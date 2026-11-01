/**
 * The corridor map (F1, section 11). Trains are placed by estimatePosition at
 * the requested viewing time, so a marker moves without another request.
 */
import type { Sql } from '@railpulse/db';
import type { CorridorMapResponse } from '@railpulse/shared';
import { buildStates, loadCorridorState, type SnapshotSelector } from '../../lib/corridor-state';
import { snapshotMeta } from '../../lib/envelope';

export interface MapQuery {
  snapshot?: 'latest' | number;
  at?: string;
}

export function selectorFromQuery(query: MapQuery): SnapshotSelector {
  if (query.at) return { kind: 'at', at: query.at };
  if (typeof query.snapshot === 'number') return { kind: 'id', id: query.snapshot };
  return { kind: 'latest' };
}

export async function corridorMapService(
  sql: Sql,
  slug: string,
  query: MapQuery,
  now: Date = new Date(),
): Promise<CorridorMapResponse> {
  const state = await loadCorridorState(sql, slug, selectorFromQuery(query));
  // Replay and ?at= both look at a past instant; the label must say so.
  const viewingAt = query.at ? new Date(query.at) : (state.snapshot?.takenAt ?? now.toISOString());
  const states = buildStates(state, viewingAt);

  const trains = [...states.values()].map(({ train, position, direction, speedKph, observation }) => ({
    ...position,
    trainName: train.name,
    trainNameHi: train.nameHi,
    direction,
    speedKph,
    observation,
  }));

  return {
    data: {
      corridor: state.corridor,
      stations: state.stations,
      trains,
      snapshot: state.snapshot,
    },
    meta: snapshotMeta(state.snapshot, {
      isEstimated: true,
      source: query.at ? 'replay' : 'snapshot',
      now,
      // A viewing time in the past means the numbers are an estimate, not a fact.
    }),
  };
}
