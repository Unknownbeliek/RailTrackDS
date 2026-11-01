/**
 * One place that assembles the reason input from stored state, so the API and
 * the ingest job cannot disagree about what the reason card says (F9).
 */
import { delayReason, nearbyTrains } from '@railpulse/domain';
import { NEARBY_RADIUS_KM, type Reason, type TrainObservation } from '@railpulse/shared';
import type { TrainState } from './corridor-state';

export interface ReasonOutcome {
  available: boolean;
  reason: Reason | null;
}

/** Domain-facing view of a train state, used for grouping and overtake hints. */
export function asDomainState(state: TrainState) {
  return {
    trainNumber: state.train.number,
    trainName: state.train.name,
    direction: state.direction,
    priority: state.train.priority,
    avgSpeedKph: state.speedKph ?? 0,
    delayMin: state.position.delayMin,
    corridorKm: state.corridorKm,
  };
}

export function reasonForTrain(
  selected: TrainState,
  allStates: Iterable<TrainState>,
  previous: TrainObservation | undefined,
): ReasonOutcome {
  const all = [...allStates].map(asDomainState);
  const { behind } = nearbyTrains(asDomainState(selected), all, NEARBY_RADIUS_KM);

  return delayReason({
    previous: previous
      ? {
          takenAt: previous.takenAt,
          currentStation: previous.currentStation,
          nextStation: previous.nextStation,
          delayMin: previous.delayMin,
          minsIntoSegment: previous.minsIntoSegment,
          segmentMinutes: previous.segmentMinutes,
        }
      : null,
    current: {
      takenAt: selected.observation.takenAt,
      currentStation: selected.observation.currentStation,
      nextStation: selected.observation.nextStation,
      delayMin: selected.observation.delayMin,
      minsIntoSegment: selected.observation.minsIntoSegment,
      segmentMinutes: selected.observation.segmentMinutes,
    },
    behind,
  });
}
