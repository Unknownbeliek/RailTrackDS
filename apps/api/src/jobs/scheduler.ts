/**
 * Scheduler (section 15): a cron-style tick inside the API process.
 * It fires only at the planned times, only if that slot has no snapshot yet,
 * and only if the budget guard allows the spend. Everything else is a no-op,
 * so users can never cause a provider call.
 */
import { latestSnapshot, type Sql } from '@railpulse/db';
import {
  SCHEDULER_TICK_MS,
  dueSnapshotSlot,
  slotTaken,
} from '@railpulse/shared';
import { takeSnapshot } from './snapshot';
import type { TrainDataProvider } from '@railpulse/shared';

export interface SchedulerDeps {
  sql: Sql;
  provider: TrainDataProvider;
  timezone: string;
  corridorSlugs: string[];
  log: { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void };
  now?: () => Date;
  /** Injected by tests so the tick can be driven by hand. */
  intervalMs?: number;
}

export async function schedulerTick(deps: SchedulerDeps): Promise<'skipped' | 'taken'> {
  const now = (deps.now ?? (() => new Date()))();
  const slot = dueSnapshotSlot(now, deps.timezone);
  if (!slot) return 'skipped';

  const latest = await latestSnapshot(deps.sql, `corridor:${deps.corridorSlugs[0]}`);
  if (latest && slotTaken([latest.takenAt], now, deps.timezone, slot)) {
    return 'skipped';
  }

  try {
    const summary = await takeSnapshot(deps.sql, deps.provider, { slugs: deps.corridorSlugs });
    deps.log.info({ slot, ...summary }, 'Planned snapshot taken');
  } catch (error) {
    // A refused spend is expected at the end of the month; keep serving data.
    deps.log.warn({ slot, error: String(error) }, 'Planned snapshot was refused or failed');
  }
  return 'taken';
}

export function startScheduler(deps: SchedulerDeps): () => void {
  const intervalMs = deps.intervalMs ?? SCHEDULER_TICK_MS;
  let running = false;

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void schedulerTick(deps).finally(() => {
      running = false;
    });
  }, intervalMs);

  timer.unref?.();
  deps.log.info({ intervalMs, timezone: deps.timezone }, 'Scheduler started');
  return () => clearInterval(timer);
}
