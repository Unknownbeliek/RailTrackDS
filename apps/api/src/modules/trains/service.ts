/**
 * Train detail (F4) and nearby trains (F6).
 * The reason card is computed here and stored with its evidence (section 7.4).
 */
import {
  corridorSlugForTrain,
  getDelayHistory,
  getStations,
  getTrain,
  getTrainStops,
  listObservations,
  listStopObservations,
  saveReason,
  type Sql,
} from '@railpulse/db';
import { nearbyTrains } from '@railpulse/domain';
import {
  NEARBY_RADIUS_KM,
  AppError,
  type NearbyResponse,
  type Reason,
  type TrainDetailResponse,
} from '@railpulse/shared';
import {
  buildStates,
  loadCorridorState,
  type CorridorState,
  type TrainState,
} from '../../lib/corridor-state';
import { snapshotMeta } from '../../lib/envelope';
import { asDomainState, reasonForTrain } from '../../lib/reasoning';

export interface TrainDetailOptions {
  corridorSlug?: string;
  at?: string;
}

export async function trainDetailService(
  sql: Sql,
  number: string,
  options: TrainDetailOptions,
  now: Date = new Date(),
): Promise<TrainDetailResponse> {
  const train = await getTrain(sql, number);
  if (!train) throw new AppError('NOT_FOUND', `No train ${number} in the local database.`);

  const [stops, stations, history] = await Promise.all([
    getTrainStops(sql, number),
    getStations(sql, [train.sourceCode, train.destinationCode].filter((c): c is string => !!c)),
    getDelayHistory(sql, number),
  ]);

  const slug = options.corridorSlug ?? (await corridorSlugForTrain(sql, number));
  let corridorState: CorridorState | null = null;
  let state: TrainState | null = null;
  let states = new Map<string, TrainState>();

  if (slug) {
    corridorState = await loadCorridorState(
      sql,
      slug,
      options.at ? { kind: 'at', at: options.at } : { kind: 'latest' },
    );
    states = buildStates(corridorState, corridorState.snapshot?.takenAt ?? now.toISOString());
    state = states.get(number) ?? null;
  }

  const observation = corridorState?.observations.get(number) ?? null;
  let reason: Reason | null = null;
  let reasonAvailable = false;

  if (corridorState?.snapshot && observation) {
    const previousObservations = corridorState.previous
      ? await listObservations(sql, corridorState.previous.id)
      : [];
    const previous = previousObservations.find((o) => o.trainNumber === number);

    const outcome = state
      ? reasonForTrain(state, states.values(), previous)
      : { available: false, reason: null };
    reason = outcome.reason;
    reasonAvailable = outcome.available;
    if (outcome.reason) {
      await saveReason(sql, {
        snapshotId: corridorState.snapshot.id,
        trainNumber: number,
        reason: outcome.reason,
      });
    }
  }

  // Observed platform and actual times, when a details snapshot recorded them.
  const observed = corridorState?.snapshot
    ? await listStopObservations(sql, corridorState.snapshot.id, number)
    : [];
  const observedBySeq = new Map(observed.map((row) => [row.seq, row]));
  const mergedStops = stops.map((stop) => {
    const live = observedBySeq.get(stop.seq);
    return live
      ? {
          ...stop,
          platform: live.platform ?? stop.platform,
          actualArrivalMin: live.actualArrivalMin,
          actualDepartureMin: live.actualDepartureMin,
          delayMin: live.delayMin,
        }
      : stop;
  });

  const source = stations.find((s) => s.code === train.sourceCode) ?? null;
  const destination = stations.find((s) => s.code === train.destinationCode) ?? null;
  return {
    data: {
      train: {
        number: train.number,
        name: train.name,
        nameHi: train.nameHi,
        category: train.category,
        priority: train.priority,
      },
      stations: { source, destination },
      stops: mergedStops,
      position: state?.position ?? null,
      direction: state?.direction ?? null,
      speedKph: state?.speedKph ?? null,
      runningInLatestSnapshot: Boolean(state),
      reason,
      reasonAvailable,
      history,
    },
    meta: snapshotMeta(corridorState?.snapshot ?? null, { isEstimated: true, now }),
  };
}

export async function nearbyService(
  sql: Sql,
  number: string,
  options: { snapshot?: number; corridorSlug?: string },
  now: Date = new Date(),
): Promise<NearbyResponse> {
  const slug = options.corridorSlug ?? (await corridorSlugForTrain(sql, number));
  if (!slug) throw new AppError('NOT_FOUND', `Train ${number} is not on an active corridor.`);

  const corridorState = await loadCorridorState(
    sql,
    slug,
    options.snapshot ? { kind: 'id', id: options.snapshot } : { kind: 'latest' },
  );
  const states = buildStates(corridorState, corridorState.snapshot?.takenAt ?? now.toISOString());
  const selected = states.get(number);
  if (!selected) {
    throw new AppError('NOT_FOUND', `Train ${number} is not running in that snapshot.`);
  }

  const all = [...states.values()].map(asDomainState);
  const groups = nearbyTrains(asDomainState(selected), all, NEARBY_RADIUS_KM);

  return {
    data: {
      trainNumber: number,
      corridorSlug: slug,
      radiusKm: NEARBY_RADIUS_KM,
      ...groups,
    },
    meta: snapshotMeta(corridorState.snapshot, { isEstimated: true, now }),
  };
}
