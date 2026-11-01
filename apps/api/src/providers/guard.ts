/**
 * The budget guard (rule N2, section 7.5, section 9.3).
 *
 * Every provider call in the whole system goes through this file. It checks
 * the cache, then the ledger, then the daily allowance, and only then spends a
 * request. It is the only spender in the repository.
 */
import { createHash } from 'node:crypto';
import {
  AppError,
  BUDGET_WARN_RATIO,
  CACHE_TTL_MS,
  budgetWindow,
  canSpend,
  type ProviderMethod,
  type TrainDataProvider,
} from '@railpulse/shared';
import type { Sql } from '@railpulse/db';
import {
  commitCall,
  failCall,
  findCachedPayload,
  reserveCall,
  usageCounts,
} from '@railpulse/db';

export interface GuardDeps {
  sql: Sql;
  cap: number;
  reserve: number;
  timezone: string;
  providerName?: string;
  now?: () => Date;
  log?: { warn: (obj: unknown, msg?: string) => void; info: (obj: unknown, msg?: string) => void };
}

export interface GuardStats {
  hits: number;
  misses: number;
  spent: number;
  refused: number;
}

/** Stable key material: argument order and object key order do not matter. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function paramsHash(method: string, args: unknown[]): string {
  return createHash('sha256').update(`${method}:${stableStringify(args)}`).digest('hex').slice(0, 32);
}

function ttlFor(method: string): number {
  return CACHE_TTL_MS[method as keyof typeof CACHE_TTL_MS] ?? 0;
}

export interface GuardedProvider extends TrainDataProvider {
  readonly stats: GuardStats;
}

/**
 * Wraps a provider so no method can forget the cache, the ledger or the cap.
 */
export function guarded(inner: TrainDataProvider, deps: GuardDeps): GuardedProvider {
  const now = deps.now ?? (() => new Date());
  const providerName = deps.providerName ?? 'railradar';
  const stats: GuardStats = { hits: 0, misses: 0, spent: 0, refused: 0 };

  async function run<T>(method: ProviderMethod, args: unknown[], call: () => Promise<T>): Promise<T> {
    const hash = paramsHash(method, args);
    const ttl = ttlFor(method);
    const at = now();

    // 1. Cache. The ledger is also the archive, so a recent stored payload is
    //    a cache hit and costs nothing.
    if (ttl > 0) {
      const since = new Date(at.getTime() - ttl).toISOString();
      const hit = await findCachedPayload(deps.sql, method, hash, since);
      if (hit !== null) {
        stats.hits += 1;
        return hit as T;
      }
    }

    // 2. Budget. Never spend the reserve, never exceed the daily allowance.
    const window = budgetWindow(at, deps.timezone);
    const dayStart = new Date(window.dayEnd.getTime() - 24 * 60 * 60 * 1000);
    const usage = await usageCounts(deps.sql, {
      start: window.start,
      end: window.end,
      dayStart,
      dayEnd: window.dayEnd,
    });
    const decision = canSpend({
      used: usage.used,
      dailyUsed: usage.usedToday,
      cap: deps.cap,
      reserve: deps.reserve,
      daysLeft: window.daysLeft,
    });

    if (!decision.allowed) {
      stats.refused += 1;
      throw new AppError(
        'BUDGET_EXHAUSTED',
        decision.reason === 'reserve'
          ? 'Only the reserve is left this month, so no request was spent.'
          : 'Today\'s share of the monthly budget is used up.',
        { reason: decision.reason, remaining: decision.remaining },
      );
    }

    // 3. Reserve, call, commit. A failed attempt keeps its row: quota is gone
    //    either way, and the ledger must not under-report.
    const callId = await reserveCall(deps.sql, {
      provider: providerName,
      method,
      paramsHash: hash,
      params: args,
      at,
    });
    stats.misses += 1;
    stats.spent += 1;
    try {
      const result = await call();
      await commitCall(deps.sql, callId, result);
      if (deps.cap > 0 && usage.used + 1 >= deps.cap * BUDGET_WARN_RATIO) {
        deps.log?.warn(
          { used: usage.used + 1, cap: deps.cap },
          'Provider budget is at 80 percent or more of the monthly cap',
        );
      }
      return result;
    } catch (error) {
      await failCall(deps.sql, callId, String(error));
      throw error;
    }
  }

  return {
    stats,
    listStations: () => run('listStations', [], () => inner.listStations()),
    listTrains: () => run('listTrains', [], () => inner.listTrains()),
    getTrainDetails: (number: string) =>
      run('getTrainDetails', [number], () => inner.getTrainDetails(number)),
    getLiveMap: () => run('getLiveMap', [], () => inner.getLiveMap()),
    getStationBoard: (code: string) =>
      run('getStationBoard', [code], () => inner.getStationBoard(code)),
  };
}
