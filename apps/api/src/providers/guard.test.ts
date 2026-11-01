/**
 * Proofs for rule N2 (section 7.5, P5): the cap is never exceeded, cache hits
 * cost nothing, the reserve is untouchable, and every spend leaves a ledger row.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, migrate, recentCalls, usageCounts, type Sql } from '@railpulse/db';
import { AppError, budgetWindow, type TrainDataProvider } from '@railpulse/shared';
import { guarded } from './guard';

/** A provider that counts calls and never touches the network. */
function countingProvider() {
  const calls = { count: 0 };
  const payload = { value: 'live' };
  const provider: TrainDataProvider = {
    async listStations() {
      calls.count += 1;
      return [];
    },
    async listTrains() {
      calls.count += 1;
      return [];
    },
    async getTrainDetails(number: string) {
      calls.count += 1;
      return {
        train: { number, name: 'Test', category: 'EXPRESS' },
        route: [{ seq: 0, stationCode: 'AAA' }],
        live: null,
      } as never;
    },
    async getLiveMap() {
      calls.count += 1;
      return payload as never;
    },
    async getStationBoard(code: string) {
      calls.count += 1;
      return { stationCode: code, takenAt: new Date().toISOString(), trains: [] };
    },
  };
  return { provider, calls };
}

const MONTH_END = new Date('2026-11-30T04:00:00.000Z');
const TZ = 'Asia/Kolkata';

describe('budget guard', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await createDatabase({ dataDir: ':memory:' });
    await migrate(sql);
  });

  afterEach(async () => {
    await sql.close();
  });

  function guardWith(provider: TrainDataProvider, cap: number, reserve: number, now = MONTH_END) {
    return guarded(provider, { sql, cap, reserve, timezone: TZ, now: () => now });
  }

  it('serves a repeated call from the cache and spends once', async () => {
    const { provider, calls } = countingProvider();
    const guardedProvider = guardWith(provider, 10, 0);
    // getTrainDetails is cached for a day, so two calls are one request.
    await guardedProvider.getTrainDetails('12301');
    await guardedProvider.getTrainDetails('12301');
    expect(calls.count).toBe(1);

    const window = budgetWindow(MONTH_END, TZ);
    const usage = await usageCounts(sql, {
      start: window.start,
      end: window.end,
      dayStart: new Date(window.dayEnd.getTime() - 86_400_000),
      dayEnd: window.dayEnd,
    });
    expect(usage.used).toBe(1);
  });

  it('treats different arguments as different requests', async () => {
    const { provider, calls } = countingProvider();
    const guardedProvider = guardWith(provider, 10, 0);
    await guardedProvider.getStationBoard('CNB');
    await guardedProvider.getStationBoard('NDLS');
    expect(calls.count).toBe(2);
  });

  it('never exceeds the daily allowance on the last day of the month', async () => {
    const { provider, calls } = countingProvider();
    const cap = 3;
    const guardedProvider = guardWith(provider, cap, 0);
    await guardedProvider.getStationBoard('AAA');
    await guardedProvider.getStationBoard('BBB');
    await guardedProvider.getStationBoard('CCC');

    await expect(guardedProvider.getStationBoard('DDD')).rejects.toBeInstanceOf(AppError);
    expect(calls.count).toBe(cap);
    expect(guardedProvider.stats.refused).toBe(1);
  });

  it('refuses to touch the reserve', async () => {
    const { provider, calls } = countingProvider();
    // Daily allowance is generous, but the reserve must stay untouched.
    const guardedProvider = guardWith(provider, 2, 2);
    await expect(guardedProvider.getStationBoard('AAA')).rejects.toMatchObject({
      code: 'BUDGET_EXHAUSTED',
    });
    expect(calls.count).toBe(0);
  });

  it('records a failed attempt as spent, because quota is gone either way', async () => {
    const failing: TrainDataProvider = {
      ...countingProvider().provider,
      async getLiveMap() {
        throw new AppError('PROVIDER_DOWN', 'boom');
      },
    };
    const guardedProvider = guardWith(failing, 5, 0);
    await expect(guardedProvider.getLiveMap()).rejects.toMatchObject({ code: 'PROVIDER_DOWN' });

    const calls = await recentCalls(sql, 5);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('getLiveMap');
  });

  it('writes one ledger row per spend with its payload as the archive', async () => {
    const { provider } = countingProvider();
    const guardedProvider = guardWith(provider, 5, 0);
    await guardedProvider.getLiveMap();
    const calls = await recentCalls(sql, 5);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'getLiveMap', cost: 1, httpStatus: 200 });
  });

  it('counts the budget per month, in the budget timezone', async () => {
    const { provider } = countingProvider();
    let now = MONTH_END;
    const make = () =>
      guarded(provider, { sql, cap: 400, reserve: 0, timezone: TZ, now: () => now });

    const first = make();
    await first.getStationBoard('AAA');
    await first.getStationBoard('BBB');

    const november = budgetWindow(now, TZ);
    const novUsage = await usageCounts(sql, {
      start: november.start,
      end: november.end,
      dayStart: new Date(november.dayEnd.getTime() - 86_400_000),
      dayEnd: november.dayEnd,
    });
    expect(novUsage.used).toBe(2);

    now = new Date('2026-12-01T04:00:00.000Z');
    const december = budgetWindow(now, TZ);
    const decBefore = await usageCounts(sql, {
      start: december.start,
      end: december.end,
      dayStart: new Date(december.dayEnd.getTime() - 86_400_000),
      dayEnd: december.dayEnd,
    });
    expect(decBefore.used).toBe(0);

    const second = make();
    await second.getStationBoard('CCC');
    expect(second.stats.spent).toBe(1);
  });
});
