/**
 * Planned snapshots (section 15). Pure, so the scheduler, the admin page and
 * the tests agree on when the next request will be spent.
 */
import { SNAPSHOT_PLAN_IST } from './constants';
import { budgetWindow, zonedParts, zonedTimeToUtc } from './budget';

/** The next planned snapshot after `now`, in the budget timezone. */
export function nextPlannedSnapshot(now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  const candidates: Date[] = [];
  for (const slot of SNAPSHOT_PLAN_IST) {
    const [h, m] = slot.split(':').map(Number) as [number, number];
    for (const dayOffset of [0, 1]) {
      const dayStart = zonedTimeToUtc(p.year, p.month, p.day, h, m, timeZone);
      const at = new Date(dayStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      if (at.getTime() > now.getTime()) candidates.push(at);
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? new Date(budgetWindow(now, timeZone).end);
}

/** The planned slot that `now` falls into, if a tick should fire right now. */
export function dueSnapshotSlot(now: Date, timeZone: string): string | null {
  const p = zonedParts(now, timeZone);
  for (const slot of SNAPSHOT_PLAN_IST) {
    const [h, m] = slot.split(':').map(Number) as [number, number];
    if (p.hour === h && p.minute >= m && p.minute < m + 5) return slot;
  }
  return null;
}

export function slotTaken(snapshotTimes: string[], now: Date, timeZone: string, slot: string): boolean {
  const p = zonedParts(now, timeZone);
  const [h, m] = slot.split(':').map(Number) as [number, number];
  const slotStart = zonedTimeToUtc(p.year, p.month, p.day, h, m, timeZone);
  return snapshotTimes.some((iso) => new Date(iso).getTime() >= slotStart.getTime());
}
