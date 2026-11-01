/**
 * Marker positions in the browser, from the shared estimatePosition function.
 *
 * Honesty rule: a marker is only extrapolated forward while the snapshot is
 * Recent. On an Aged or Old snapshot the markers sit exactly where the
 * recording left them, and the as-of banner says how old that is. Carrying a
 * five-hour-old estimate forward would pile every train at its next station
 * and imply knowledge we do not have.
 */
import { estimatePosition } from '@railpulse/domain';
import type { CorridorStation, Meta } from '@railpulse/shared';
import type { MapTrain } from './map/MapView';
import { prefersReducedMotion } from './useNow';

export type MapTrainResponse = {
  trainNumber: string;
  lat: number;
  lng: number;
  bearingDeg: number;
  progress: number;
  delayLevel: 'ontime' | 'slight' | 'major';
  delayMin: number;
  isStale: boolean;
  minsToNextStation: number;
  trainName: string;
  selected?: boolean;
  observation: {
    trainNumber: string;
    takenAt: string;
    currentStation: string;
    nextStation: string;
    minsIntoSegment: number;
    segmentMinutes: number;
    delayMin: number;
    snapshotId: number;
    lat: number | null;
    lng: number | null;
  };
};

export function coordsMap(stations: CorridorStation[]): Map<string, { lat: number; lng: number }> {
  const map = new Map<string, { lat: number; lng: number }>();
  for (const entry of stations) {
    if (entry.station.lat !== null && entry.station.lng !== null) {
      map.set(entry.station.code, { lat: entry.station.lat, lng: entry.station.lng });
    }
  }
  return map;
}

/** The instant to draw: now while the data is fresh, the snapshot otherwise. */
export function positionTime(meta: Meta, now: Date): Date {
  const fresh = meta.freshness === 'recent' && meta.source !== 'replay';
  return fresh && !prefersReducedMotion() ? now : new Date(meta.asOf);
}

export function toMarkers(
  trains: MapTrainResponse[],
  stations: CorridorStation[],
  at: Date,
  selectedTrain?: string,
): MapTrain[] {
  const coords = coordsMap(stations);
  return trains.map((train) => {
    const position = estimatePosition(train.observation, at, coords);
    return {
      trainNumber: train.trainNumber,
      lat: position?.lat ?? train.lat,
      lng: position?.lng ?? train.lng,
      bearingDeg: position?.bearingDeg ?? train.bearingDeg,
      delayLevel: position?.delayLevel ?? train.delayLevel,
      label: train.trainName,
      selected: train.trainNumber === selectedTrain,
    };
  });
}
