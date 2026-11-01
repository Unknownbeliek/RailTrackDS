/**
 * A3 — deterministic delay reasons (section 7.4, F9).
 *
 * Rules run in order, first match wins. Labels are Likely, Possible or Unknown.
 * No percentages and no machine learning: with three snapshots a day, a
 * percentage would be invented precision (rule N4).
 */
import {
  REASON_FOG_VISIBILITY_M,
  REASON_MAKING_WAY_KM,
  REASON_MAX_GAP_MIN,
  type NearbyTrain,
  type Reason,
} from '@railpulse/shared';
import { minutesBetween } from './freshness';

export interface ReasonObservation {
  takenAt: string;
  currentStation: string;
  nextStation: string;
  delayMin: number;
  minsIntoSegment: number;
  segmentMinutes: number;
}

export interface ReasonInput {
  previous: ReasonObservation | null;
  current: ReasonObservation;
  /** Trains behind the selected one, already computed by A2. */
  behind?: NearbyTrain[];
  /** Optional free weather source; ignored when absent. */
  weather?: { visibilityM: number } | null;
}

export interface ReasonOutcome {
  available: boolean;
  reason: Reason | null;
}

const UNKNOWN: Reason = { rule: 'R4', label: 'unknown', evidence: {} };

/**
 * Shown only when two snapshots are no more than 30 minutes apart.
 * Otherwise the UI prints "Not enough fresh data" (F9).
 */
export function delayReason(input: ReasonInput): ReasonOutcome {
  const { previous, current } = input;
  if (!previous) return { available: false, reason: null };

  const gapMin = minutesBetween(previous.takenAt, current.takenAt);
  if (gapMin <= 0 || gapMin > REASON_MAX_GAP_MIN) {
    return { available: false, reason: null };
  }
  if (current.delayMin <= 0) return { available: true, reason: null };

  const evidenceBase = {
    gapMin: Math.round(gapMin),
    previousDelayMin: previous.delayMin,
    currentDelayMin: current.delayMin,
    currentStation: current.currentStation,
    nextStation: current.nextStation,
  };

  // R1 Making way: stopped or crawling, and a higher priority train is behind.
  const higherPriorityBehind = (input.behind ?? [])
    .filter((t) => t.distanceKm <= REASON_MAKING_WAY_KM && t.overtakeHint)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const barelyMoved = current.minsIntoSegment - previous.minsIntoSegment < gapMin / 2;
  const sameSegment =
    previous.currentStation === current.currentStation &&
    previous.nextStation === current.nextStation;
  if (sameSegment && barelyMoved && higherPriorityBehind) {
    return {
      available: true,
      reason: {
        rule: 'R1',
        label: 'likely',
        evidence: {
          ...evidenceBase,
          blockedByTrain: higherPriorityBehind.trainNumber,
          distanceKm: higherPriorityBehind.distanceKm,
          rule: 'R1',
        },
      },
    };
  }

  // R2 Fog: delay grew and visibility is under 500 m near the train.
  const delayGrew = current.delayMin > previous.delayMin;
  if (
    input.weather &&
    input.weather.visibilityM < REASON_FOG_VISIBILITY_M &&
    delayGrew
  ) {
    return {
      available: true,
      reason: {
        rule: 'R2',
        label: 'possible',
        evidence: { ...evidenceBase, visibilityM: input.weather.visibilityM },
      },
    };
  }

  // R3 Long halt: delay grew while the train sat at one station.
  const sameStation =
    previous.currentStation === current.currentStation &&
    previous.nextStation === current.nextStation &&
    previous.delayMin < current.delayMin;
  if (sameStation && delayGrew) {
    return {
      available: true,
      reason: {
        rule: 'R3',
        label: 'possible',
        evidence: { ...evidenceBase, station: current.currentStation },
      },
    };
  }

  return { available: true, reason: { ...UNKNOWN, evidence: evidenceBase } };
}
