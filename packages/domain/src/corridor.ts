/**
 * Corridor geometry helpers (section 7.3). A corridor station carries the
 * distance from the corridor start, so every train has one scalar position.
 */
import type { CorridorStation, Direction, TrainObservation } from '@railpulse/shared';

export interface CorridorIndex {
  /** station code -> index in corridor order */
  indexByCode: ReadonlyMap<string, number>;
  /** station code -> km from corridor start */
  kmByCode: ReadonlyMap<string, number>;
  /** station code -> coordinates */
  coords: ReadonlyMap<string, { lat: number; lng: number }>;
}

export function buildCorridorIndex(stations: CorridorStation[]): CorridorIndex {
  const indexByCode = new Map<string, number>();
  const kmByCode = new Map<string, number>();
  const coords = new Map<string, { lat: number; lng: number }>();
  stations.forEach((entry, i) => {
    indexByCode.set(entry.station.code, entry.seq ?? i);
    kmByCode.set(entry.station.code, entry.kmFromStart);
    if (entry.station.lat !== null && entry.station.lng !== null) {
      coords.set(entry.station.code, { lat: entry.station.lat, lng: entry.station.lng });
    }
  });
  return { indexByCode, kmByCode, coords };
}

/**
 * "up" means the train is moving towards a lower corridor index (higher km
 * order reversed). Pure and total: unknown stations fall back to "down".
 */
export function inferDirection(obs: TrainObservation, index: CorridorIndex): Direction {
  const a = index.indexByCode.get(obs.currentStation);
  const b = index.indexByCode.get(obs.nextStation);
  if (a === undefined || b === undefined || a === b) return 'down';
  return b > a ? 'down' : 'up';
}

/** Position of a train along the corridor in km, from a 0..1 segment progress. */
export function corridorKmAt(
  obs: TrainObservation,
  progress: number,
  index: CorridorIndex,
): number | null {
  const start = index.kmByCode.get(obs.currentStation);
  const end = index.kmByCode.get(obs.nextStation);
  if (start === undefined || end === undefined) return null;
  return start + (end - start) * progress;
}

/** Average scheduled speed in km/h, from a timetable's distance and time. */
export function averageSpeedKph(distanceKm: number, minutes: number): number | null {
  if (distanceKm <= 0 || minutes <= 0) return null;
  return Math.round((distanceKm / minutes) * 60);
}
