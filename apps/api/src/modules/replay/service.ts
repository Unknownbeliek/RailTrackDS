/**
 * Replay (F7): the recorded snapshot times for a day, so the client can scrub
 * between them and move trains with the shared estimatePosition function.
 * No provider calls, ever.
 */
import { getCorridor, listSnapshots, type Sql } from '@railpulse/db';
import {
  SNAPSHOT_LIST_LIMIT,
  AppError,
  zonedTimeToUtc,
  type SnapshotList,
} from '@railpulse/shared';
import { snapshotMeta } from '../../lib/envelope';
import { scopeOf } from '../../lib/corridor-state';

export async function listSnapshotsService(
  sql: Sql,
  slug: string,
  date: string | undefined,
  timezone: string,
  now: Date = new Date(),
): Promise<SnapshotList> {
  const corridor = await getCorridor(sql, slug);
  if (!corridor) throw new AppError('NOT_FOUND', `No corridor called "${slug}" yet.`);

  let from: string | null = null;
  let to: string | null = null;
  if (date) {
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    const start = zonedTimeToUtc(year, month, day, 0, 0, timezone);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    from = start.toISOString();
    to = end.toISOString();
  }

  const snapshots = await listSnapshots(sql, scopeOf(slug), from, to, SNAPSHOT_LIST_LIMIT);
  const latest = snapshots[snapshots.length - 1] ?? null;
  return {
    data: { snapshots },
    meta: snapshotMeta(latest, { isEstimated: true, source: 'replay', now }),
  };
}
