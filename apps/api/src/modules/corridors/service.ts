/** Corridor list and detail (F2, section 11). Reads only our database. */
import { listCorridors, type Sql } from '@railpulse/db';
import { AppError, type CorridorDetail, type CorridorList } from '@railpulse/shared';
import { buildStates, countsFor, loadCorridorState } from '../../lib/corridor-state';
import { snapshotMeta } from '../../lib/envelope';

export async function listCorridorsService(sql: Sql): Promise<CorridorList> {
  const corridors = await listCorridors(sql);
  return {
    data: { corridors },
    meta: snapshotMeta(null, { isEstimated: false, source: 'static' }),
  };
}

export async function corridorDetailService(
  sql: Sql,
  slug: string,
  now: Date = new Date(),
): Promise<CorridorDetail> {
  const state = await loadCorridorState(sql, slug, { kind: 'latest' });
  if (!state.corridor.isActive) {
    throw new AppError('NOT_FOUND', `Corridor "${slug}" is not active.`);
  }

  const states = buildStates(state, state.snapshot?.takenAt ?? now.toISOString());
  return {
    data: {
      corridor: state.corridor,
      stations: state.stations,
      trains: state.trains.map((train) => ({
        number: train.number,
        name: train.name,
        nameHi: train.nameHi,
        category: train.category,
        priority: train.priority,
      })),
      counts: countsFor(states),
    },
    meta: snapshotMeta(state.snapshot, { isEstimated: true, now }),
  };
}
