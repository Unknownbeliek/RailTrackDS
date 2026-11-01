/**
 * Corridors are data (section 10). The definition below is the seed for the
 * Phase 1 corridor; adding Delhi to Patna later means another entry here and
 * rows in the database, not a code change (F2).
 *
 * Coordinates are a known gap (spike S8): the provider's station lookup
 * returns codes and names only. These points come from the corridor timetable
 * and are stored with coord_source = 'timetable' so their origin is auditable.
 */
import type { Station, TrainStopRow } from '@railpulse/shared';
import type { Sql } from '../sql';
import { insertStationsIfMissing } from '../queries/stations';
import {
  listCorridorTrainNumbers,
  setCorridorStations,
  setCorridorTrains,
  upsertCorridor,
} from '../queries/corridors';
import { upsertTrainStops } from '../queries/trains';

export interface CorridorDefinition {
  slug: string;
  name: string;
  nameHi: string;
  stations: Array<{
    code: string;
    kmFromStart: number;
    lat: number;
    lng: number;
  }>;
}

export const DELHI_KANPUR: CorridorDefinition = {
  slug: 'delhi-kanpur',
  name: 'Delhi — Kanpur',
  nameHi: 'दिल्ली — कानपुर',
  stations: [
    { code: 'NDLS', kmFromStart: 0, lat: 28.6431, lng: 77.2197 },
    { code: 'GZB', kmFromStart: 25.6, lat: 28.6618, lng: 77.4378 },
    { code: 'ALJN', kmFromStart: 133.1, lat: 27.8974, lng: 78.088 },
    { code: 'TDL', kmFromStart: 201.4, lat: 27.2167, lng: 78.2333 },
    { code: 'ETW', kmFromStart: 284.2, lat: 26.7843, lng: 79.02 },
    { code: 'CNB', kmFromStart: 440.4, lat: 26.4499, lng: 80.3319 },
  ],
};

export const CORRIDOR_SEEDS: CorridorDefinition[] = [DELHI_KANPUR];

/**
 * A train belongs to a corridor when its timetable touches at least two of the
 * corridor's stations. Nothing is hard-coded per train number.
 */
export function trainsOnCorridor(
  stopsByTrain: Map<string, TrainStopRow[]>,
  corridorCodes: ReadonlySet<string>,
): string[] {
  const result: string[] = [];
  for (const [number, stops] of stopsByTrain) {
    const hits = stops.filter((stop) => corridorCodes.has(stop.stationCode)).length;
    if (hits >= 2) result.push(number);
  }
  return result.sort();
}

export interface SeedResult {
  corridorId: number;
  stations: number;
  trains: number;
}

/**
 * Writes one corridor: its stations (with coordinates if the reference layer
 * still lacks them), the ordered station list and the trains that run on it.
 */
export async function seedCorridor(
  sql: Sql,
  definition: CorridorDefinition,
  options: { trainNumbers?: string[]; stopsByTrain?: Map<string, TrainStopRow[]> } = {},
): Promise<SeedResult> {
  const stationRows: Station[] = definition.stations.map((entry) => ({
    code: entry.code,
    name: entry.code,
    nameHi: null,
    lat: entry.lat,
    lng: entry.lng,
    zone: null,
    isJunction: false,
  }));

  await insertStationsIfMissing(sql, stationRows);
  await sql.exec(`
    UPDATE stations SET coord_source = 'timetable'
    WHERE lat IS NOT NULL AND lng IS NOT NULL AND coord_source IS NULL;
  `);

  const corridorId = await upsertCorridor(sql, {
    slug: definition.slug,
    name: definition.name,
    nameHi: definition.nameHi,
  });

  await setCorridorStations(
    sql,
    corridorId,
    definition.stations.map((entry) => ({
      stationCode: entry.code,
      kmFromStart: entry.kmFromStart,
    })),
  );

  const codes = new Set(definition.stations.map((s) => s.code));
  let trainNumbers = options.trainNumbers;
  if (!trainNumbers && options.stopsByTrain) {
    trainNumbers = trainsOnCorridor(options.stopsByTrain, codes);
  }
  if (trainNumbers) {
    await setCorridorTrains(sql, corridorId, trainNumbers);
  }

  const existing = await listCorridorTrainNumbers(sql, corridorId);
  return { corridorId, stations: definition.stations.length, trains: existing.length };
}

/** Convenience for the seed tool: write stops, then the corridors that use them. */
export async function seedStops(sql: Sql, stopsByTrain: Map<string, TrainStopRow[]>): Promise<number> {
  let written = 0;
  for (const stops of stopsByTrain.values()) {
    written += await upsertTrainStops(sql, stops);
  }
  return written;
}
