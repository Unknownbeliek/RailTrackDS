/**
 * A2 — nearby trains (section 7.3).
 * Every train gets one scalar position along the corridor; Ahead / Behind /
 * Opposite are just comparisons on that scalar. Computed from one snapshot, so
 * the UI must carry the Estimated label.
 */
import {
  NEARBY_RADIUS_KM,
  OVERTAKE_SPEED_RATIO,
  type CorridorStation,
  type Direction,
  type NearbyGroup,
  type NearbyTrain,
  type TrainObservation,
} from '@railpulse/shared';
import { buildCorridorIndex, corridorKmAt, inferDirection } from './corridor';
import { delayLevel } from './delay';
import { estimatePosition } from './position';

export interface TrainState {
  trainNumber: string;
  trainName: string;
  direction: Direction;
  priority: number;
  avgSpeedKph: number;
  delayMin: number;
  corridorKm: number;
}

export interface NearbyInput {
  observation: TrainObservation;
  trainName: string;
  priority: number;
  avgSpeedKph: number;
}

/** The scalar corridor state of one train at a given viewing time. */
export function trainCorridorState(
  input: NearbyInput,
  at: Date | string,
  stations: CorridorStation[],
): TrainState | null {
  const index = buildCorridorIndex(stations);
  const position = estimatePosition(input.observation, at, index.coords);
  if (!position) return null;
  const km = corridorKmAt(input.observation, position.progress, index);
  if (km === null) return null;
  return {
    trainNumber: input.observation.trainNumber,
    trainName: input.trainName,
    direction: inferDirection(input.observation, index),
    priority: input.priority,
    avgSpeedKph: input.avgSpeedKph,
    delayMin: input.observation.delayMin,
    corridorKm: km,
  };
}

export function groupOf(
  selected: TrainState,
  candidate: TrainState,
): NearbyGroup {
  if (candidate.direction !== selected.direction) return 'opposite';
  return candidate.corridorKm > selected.corridorKm ? 'ahead' : 'behind';
}

/**
 * Overtake hint (7.3): a train behind with a higher priority (lower number)
 * and a meaningfully higher average speed than the selected train.
 */
export function canOvertake(selected: TrainState, candidate: TrainState): boolean {
  return (
    candidate.corridorKm < selected.corridorKm &&
    candidate.direction === selected.direction &&
    candidate.priority < selected.priority &&
    candidate.avgSpeedKph > selected.avgSpeedKph * OVERTAKE_SPEED_RATIO
  );
}

export function nearbyTrains(
  selected: TrainState,
  all: TrainState[],
  radiusKm: number = NEARBY_RADIUS_KM,
): { ahead: NearbyTrain[]; behind: NearbyTrain[]; opposite: NearbyTrain[] } {
  const ahead: NearbyTrain[] = [];
  const behind: NearbyTrain[] = [];
  const opposite: NearbyTrain[] = [];

  for (const candidate of all) {
    if (candidate.trainNumber === selected.trainNumber) continue;
    const distanceKm = Math.abs(candidate.corridorKm - selected.corridorKm);
    if (distanceKm > radiusKm) continue;
    const group = groupOf(selected, candidate);
    const entry: NearbyTrain = {
      trainNumber: candidate.trainNumber,
      trainName: candidate.trainName,
      group,
      distanceKm: Math.round(distanceKm * 10) / 10,
      delayMin: candidate.delayMin,
      delayLevel: delayLevel(candidate.delayMin),
      corridorPositionKm: Math.round(candidate.corridorKm * 10) / 10,
      overtakeHint: canOvertake(selected, candidate),
    };
    if (group === 'ahead') ahead.push(entry);
    else if (group === 'behind') behind.push(entry);
    else opposite.push(entry);
  }

  const byDistance = (a: NearbyTrain, b: NearbyTrain) => a.distanceKm - b.distanceKm;
  return { ahead: ahead.sort(byDistance), behind: behind.sort(byDistance), opposite: opposite.sort(byDistance) };
}
