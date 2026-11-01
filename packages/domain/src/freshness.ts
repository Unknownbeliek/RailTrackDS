/**
 * Freshness labels (section 7.5) and the stale-data state (section 6.5).
 * Under 15 minutes is Recent, 15 minutes to 3 hours is Aged, over 3 hours is Old.
 */
import {
  FRESH_AGED_MS,
  FRESH_RECENT_MS,
  STALE_SNAPSHOT_MS,
  type Freshness,
} from '@railpulse/shared';

export function freshness(asOf: Date | string, now: Date = new Date()): Freshness {
  const age = ageMs(asOf, now);
  if (age < FRESH_RECENT_MS) return 'recent';
  if (age < FRESH_AGED_MS) return 'aged';
  return 'old';
}

/** The UI adds an extra stale-data warning past this threshold (6.5 item 5). */
export function isStaleSnapshot(asOf: Date | string, now: Date = new Date()): boolean {
  return ageMs(asOf, now) > STALE_SNAPSHOT_MS;
}

export function ageMs(asOf: Date | string, now: Date = new Date()): number {
  const then = asOf instanceof Date ? asOf : new Date(asOf);
  return Math.max(0, now.getTime() - then.getTime());
}

/** Minutes between two instants, negative when `b` is before `a`. */
export function minutesBetween(a: Date | string, b: Date | string): number {
  const from = a instanceof Date ? a.getTime() : new Date(a).getTime();
  const to = b instanceof Date ? b.getTime() : new Date(b).getTime();
  return (to - from) / 60000;
}
