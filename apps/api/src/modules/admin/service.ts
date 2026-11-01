/**
 * Admin budget page (F11, section 7.5): what was spent, what is left, the last
 * twenty provider calls and the next planned snapshot.
 */
import {
  listCorridors,
  listCorridorTrainNumbers,
  observationsExist,
  recentCalls,
  usageCounts,
  type Sql,
} from '@railpulse/db';
import {
  BUDGET_WARN_RATIO,
  RECENT_CALLS_LIMIT,
  budgetWindow,
  todayAllowance,
  nextPlannedSnapshot,
  type Budget,
  type BudgetResponse,
} from '@railpulse/shared';
import { makeMeta } from '../../lib/envelope';
import type { AppConfig } from '../../config';

export async function budgetService(
  sql: Sql,
  config: AppConfig,
  now: Date = new Date(),
): Promise<BudgetResponse> {
  const window = budgetWindow(now, config.budgetTimezone);
  const usage = await usageCounts(sql, {
    start: window.start,
    end: window.end,
    dayStart: new Date(window.dayEnd.getTime() - 24 * 60 * 60 * 1000),
    dayEnd: window.dayEnd,
  });
  const remaining = Math.max(0, config.monthlyCap - usage.used);

  const budget: Budget = {
    month: window.month,
    cap: config.monthlyCap,
    reserve: config.reserve,
    used: usage.used,
    remaining,
    dailyAllowance: todayAllowance({
      remaining,
      usedToday: usage.usedToday,
      reserve: config.reserve,
      daysLeft: window.daysLeft,
    }),
    usedToday: usage.usedToday,
    warn: config.monthlyCap > 0 && usage.used >= config.monthlyCap * BUDGET_WARN_RATIO,
    nextSnapshotAt: nextPlannedSnapshot(now, config.budgetTimezone).toISOString(),
  };

  const calls = await recentCalls(sql, RECENT_CALLS_LIMIT);

  return {
    data: { budget, recentCalls: calls },
    meta: makeMeta({ asOf: now.toISOString(), source: 'snapshot', isEstimated: false, now }),
  };
}

export interface SnapshotPlanEntry {
  slug: string;
  trains: number;
  hasSnapshot: boolean;
}

/** What the admin refresh will touch, so the spend is never a surprise. */
export async function snapshotPlanService(sql: Sql): Promise<SnapshotPlanEntry[]> {
  const corridors = await listCorridors(sql);
  const plan: SnapshotPlanEntry[] = [];
  for (const corridor of corridors) {
    if (!corridor.isActive) continue;
    const trains = await listCorridorTrainNumbers(sql, corridor.id);
    plan.push({
      slug: corridor.slug,
      trains: trains.length,
      hasSnapshot: await observationsExist(sql, `corridor:${corridor.slug}`),
    });
  }
  return plan;
}
