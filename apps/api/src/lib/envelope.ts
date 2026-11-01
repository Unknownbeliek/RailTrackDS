/**
 * Response envelope and meta fields (rule N4, section 11).
 * Every data response carries asOf, source and isEstimated; the UI shows them.
 */
import { freshness, isStaleSnapshot } from '@railpulse/domain';
import type { Meta, Snapshot, Source } from '@railpulse/shared';

export interface MetaInput {
  asOf: string;
  source: Source;
  isEstimated: boolean;
  snapshotId?: number | null;
  budgetLimited?: boolean;
  now?: Date;
}

export function makeMeta(input: MetaInput): Meta {
  return {
    asOf: input.asOf,
    source: input.source,
    isEstimated: input.isEstimated,
    snapshotId: input.snapshotId ?? null,
    freshness: freshness(input.asOf, input.now ?? new Date()),
    budgetLimited: input.budgetLimited ?? false,
  };
}

/** Meta for a read that is served from a snapshot, or from static data only. */
export function snapshotMeta(
  snapshot: Snapshot | null,
  options: { isEstimated: boolean; source?: Source; now?: Date; budgetLimited?: boolean } = {
    isEstimated: true,
  },
): Meta {
  // With no snapshot there is nothing to be stale: the answer is current
  // reference data, so asOf is now and source says "static".
  const asOf = snapshot?.takenAt ?? (options.now ?? new Date()).toISOString();
  return makeMeta({
    asOf,
    source: options.source ?? (snapshot ? 'snapshot' : 'static'),
    isEstimated: options.isEstimated,
    snapshotId: snapshot?.id ?? null,
    now: options.now,
    budgetLimited: options.budgetLimited,
  });
}

/** True when the caller should show the stale-data banner (section 6.5). */
export function metaIsStale(meta: Meta, now: Date = new Date()): boolean {
  return isStaleSnapshot(meta.asOf, now);
}
