/**
 * One place that turns a corridor plus a snapshot into per-train states.
 *
 * Map, nearby trains, train detail reasons and the share page all need the
 * same numbers, so they all come through here instead of recomputing them.
 */
import {
  getCorridor,
  getSnapshot,
  latestSnapshot,
  listCorridorStations,
  listCorridorTrains,
  listObservations,
  previousSnapshot,
  snapshotAtOrBefore,
  type Sql,
} from '@railpulse/db';
import {
  averageSpeedKph,
  buildCorridorIndex,
  corridorKmAt,
  estimatePosition,
  inferDirection,
  type StationCoords,
} from '@railpulse/domain';
import {
  AppError,
  type Corridor,
  type CorridorStation,
  type Direction,
  type Snapshot,
  type TrainObservation,
  type TrainPosition,
  type TrainReference,
} from '@railpulse/shared';

export interface CorridorState {
  corridor: Corridor;
  stations: CorridorStation[];
  trains: TrainReference[];
  snapshot: Snapshot | null;
  previous: Snapshot | null;
  observations: Map<string, TrainObservation>;
}

export type SnapshotSelector =
  | { kind: 'latest' }
  | { kind: 'id'; id: number }
  | { kind: 'at'; at: string };

export function coordsOf(stations: CorridorStation[]): StationCoords {
  return buildCorridorIndex(stations).coords;
}

export function scopeOf(slug: string): string {
  return `corridor:${slug}`;
}

export async function resolveSnapshot(
  sql: Sql,
  scope: string,
  selector: SnapshotSelector,
): Promise<Snapshot | null> {
  if (selector.kind === 'latest') return latestSnapshot(sql, scope);
  if (selector.kind === 'id') {
    const snapshot = await getSnapshot(sql, selector.id);
    if (!snapshot || snapshot.scope !== scope) {
      throw new AppError('NOT_FOUND', 'That snapshot does not belong to this corridor.');
    }
    return snapshot;
  }
  return snapshotAtOrBefore(sql, scope, selector.at);
}

export async function loadCorridorState(
  sql: Sql,
  slug: string,
  selector: SnapshotSelector = { kind: 'latest' },
): Promise<CorridorState> {
  const corridor = await getCorridor(sql, slug);
  if (!corridor) throw new AppError('NOT_FOUND', `No corridor called "${slug}" yet.`);

  const [stations, trains] = await Promise.all([
    listCorridorStations(sql, corridor.id),
    listCorridorTrains(sql, corridor.id),
  ]);

  const snapshot = await resolveSnapshot(sql, scopeOf(slug), selector);
  const [observations, previous] = await Promise.all([
    snapshot ? listObservations(sql, snapshot.id) : Promise.resolve([]),
    snapshot ? previousSnapshot(sql, scopeOf(slug), snapshot.takenAt) : Promise.resolve(null),
  ]);

  return {
    corridor,
    stations,
    trains,
    snapshot,
    previous,
    observations: new Map(observations.map((obs) => [obs.trainNumber, obs])),
  };
}

export interface TrainState {
  train: TrainReference;
  position: TrainPosition;
  direction: Direction;
  speedKph: number | null;
  corridorKm: number;
  /** The stored observation this estimate came from. */
  observation: TrainObservation;
}

export function buildStates(state: CorridorState, at: Date | string): Map<string, TrainState> {
  const index = buildCorridorIndex(state.stations);
  const result = new Map<string, TrainState>();
  const trainsByNumber = new Map(state.trains.map((t) => [t.number, t]));

  for (const [number, observation] of state.observations) {
    const train = trainsByNumber.get(number);
    if (!train) continue;
    const position = estimatePosition(observation, at, index.coords);
    if (!position) continue;
    const corridorKm = corridorKmAt(observation, position.progress, index);
    if (corridorKm === null) continue;

    const segmentKm = Math.abs(
      (index.kmByCode.get(observation.nextStation) ?? 0) -
        (index.kmByCode.get(observation.currentStation) ?? 0),
    );
    result.set(number, {
      train,
      position,
      direction: inferDirection(observation, index),
      speedKph: averageSpeedKph(segmentKm, observation.segmentMinutes),
      corridorKm,
      observation,
    });
  }
  return result;
}

export function countsFor(states: Map<string, TrainState>): {
  total: number;
  delayed: number;
  onTime: number;
  major: number;
} {
  let delayed = 0;
  let onTime = 0;
  let major = 0;
  for (const { position } of states.values()) {
    if (position.delayLevel === 'ontime') onTime += 1;
    else delayed += 1;
    if (position.delayLevel === 'major') major += 1;
  }
  return { total: states.size, delayed, onTime, major };
}
