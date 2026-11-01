/**
 * A1 — estimated position between stations (section 7.2).
 *
 * The same function runs in the API and in the browser, so a train marker
 * moves by calling this once a second instead of polling the provider.
 * Pure: no clock, no I/O — the caller passes `at`.
 */
import { STALE_HOLD_MIN, type TrainObservation, type TrainPosition } from '@railpulse/shared';
import { bearingDeg, clamp, lerpPoint, type GeoPoint } from './geo';
import { delayLevel } from './delay';
import { minutesBetween } from './freshness';

/** Coordinates looked up by station code; only stations with a known point. */
export type StationCoords = ReadonlyMap<string, GeoPoint>;

export function estimatePosition(
  obs: TrainObservation,
  at: Date | string,
  coords: StationCoords,
): TrainPosition | null {
  const start = coords.get(obs.currentStation);
  const end = coords.get(obs.nextStation);
  if (!start || !end) return null;

  const elapsed = minutesBetween(obs.takenAt, at);
  const minsInto = Math.max(0, obs.minsIntoSegment + elapsed);
  const segmentMinutes = Math.max(obs.segmentMinutes, 1);

  const raw = minsInto / segmentMinutes;
  const progress = clamp(raw, 0, 1);
  // More than 15 minutes past the expected arrival: hold at the next station.
  const lateBy = minsInto - segmentMinutes;
  const isStale = lateBy > STALE_HOLD_MIN && raw >= 1;

  const point = lerpPoint(start, end, progress);
  const bearing = bearingDeg(start, end);

  return {
    trainNumber: obs.trainNumber,
    lat: point.lat,
    lng: point.lng,
    bearingDeg: bearing,
    progress,
    currentStation: obs.currentStation,
    nextStation: obs.nextStation,
    delayMin: obs.delayMin,
    delayLevel: delayLevel(obs.delayMin),
    isStale,
    minsToNextStation: Math.max(0, Math.round(segmentMinutes - minsInto)),
  };
}

/**
 * Where a train should probably be if the snapshot is older than the segment:
 * used by the map to say "this is an estimate" rather than to invent movement.
 */
export function staleByMinutes(obs: TrainObservation, at: Date | string): number {
  const elapsed = minutesBetween(obs.takenAt, at);
  return Math.max(0, Math.round(elapsed));
}

/** Segment running time from two minutes-into-journey values (spike S1 shape). */
export function segmentMinutesFrom(
  departureMin: number,
  nextArrivalMin: number,
): number {
  return Math.max(1, nextArrivalMin - departureMin);
}
