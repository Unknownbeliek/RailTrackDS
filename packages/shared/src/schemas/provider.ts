/**
 * Raw provider payload shapes (RailRadar).
 *
 * These schemas describe what we RECEIVE, not what we store or serve. They are
 * the contract tests' anchor: every saved fixture must parse here, so a silent
 * provider field rename breaks CI instead of the map (section 14).
 *
 * Field names and meanings are assumptions until spikes S1 and S3 confirm them
 * against the live docs; the mappers in @railpulse/provider-railradar are the
 * only place that knows them (see docs/DECISIONS.md).
 */
import { z } from 'zod';

export const isoTimestampSchema = z.string().datetime({ offset: true });

/** Every provider response uses one envelope: success, data and meta (section 3). */
export function railRadarEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.boolean(),
    data,
    meta: z
      .object({
        timestamp: isoTimestampSchema.optional(),
        source: z.string().optional(),
        requestId: z.string().optional(),
      })
      .passthrough()
      .optional(),
    error: z
      .object({ code: z.string().optional(), message: z.string().optional() })
      .optional(),
  });
}

/* --------------------------------------------------------------- stations -- */

export const stationLookupSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  nameHi: z.string().nullish(),
  zone: z.string().nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  isJunction: z.boolean().nullish(),
});
export type StationLookup = z.infer<typeof stationLookupSchema>;

export const stationLookupResponseSchema = railRadarEnvelope(
  z.object({ stations: z.array(stationLookupSchema) }),
);

/* ----------------------------------------------------------------- trains -- */

export const trainLookupSchema = z.object({
  number: z.string().min(1),
  name: z.string().min(1),
  nameHi: z.string().nullish(),
  category: z.string().nullish(),
  type: z.string().nullish(),
  sourceCode: z.string().nullish(),
  destinationCode: z.string().nullish(),
  daysOfRun: z.array(z.number().int().min(0).max(6)).nullish(),
});
export type TrainLookup = z.infer<typeof trainLookupSchema>;

export const trainLookupResponseSchema = railRadarEnvelope(
  z.object({ trains: z.array(trainLookupSchema) }),
);

export const routeStopSchema = z.object({
  seq: z.number().int().nonnegative(),
  stationCode: z.string().min(1),
  stationName: z.string().nullish(),
  /** Minutes from the origin's midnight, plus a day number (section 10). */
  arrivalMin: z.number().int().nullish(),
  departureMin: z.number().int().nullish(),
  arrivalDay: z.number().int().nullish(),
  departureDay: z.number().int().nullish(),
  distanceKm: z.number().nonnegative().nullish(),
  platform: z.string().nullish(),
  /** Live part of train details, saved as an observation (section 3.1). */
  actualArrivalMin: z.number().int().nullish(),
  actualDepartureMin: z.number().int().nullish(),
  delayMin: z.number().int().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
});
export type RouteStop = z.infer<typeof routeStopSchema>;

export const trainDetailsSchema = z.object({
  train: trainLookupSchema,
  route: z.array(routeStopSchema).min(1),
  live: z
    .object({
      currentStation: z.string().min(1),
      nextStation: z.string().min(1),
      minutesSinceDeparture: z.number().int().nonnegative(),
      minutesToNextStation: z.number().int().nonnegative().nullish(),
      delayMin: z.number().int(),
      speedKph: z.number().nonnegative().nullish(),
      lat: z.number().nullish(),
      lng: z.number().nullish(),
      takenAt: isoTimestampSchema,
    })
    .nullish(),
});
export type TrainDetails = z.infer<typeof trainDetailsSchema>;

export const trainDetailsResponseSchema = railRadarEnvelope(trainDetailsSchema);

/* --------------------------------------------------------------- live map -- */

export const liveTrainSchema = z.object({
  number: z.string().min(1),
  currentStation: z.string().min(1),
  nextStation: z.string().min(1),
  /** VERIFY in spike S1: minutes since this train left currentStation. */
  minutesSinceDeparture: z.number().int().nonnegative(),
  /** VERIFY in spike S1: minutes still to run until nextStation. */
  minutesToNextStation: z.number().int().nonnegative().nullish(),
  delayMin: z.number().int(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  bearing: z.number().min(0).max(360).nullish(),
  speedKph: z.number().nonnegative().nullish(),
  destinationCode: z.string().nullish(),
  lastReportedAt: isoTimestampSchema.nullish(),
});
export type LiveTrain = z.infer<typeof liveTrainSchema>;

export const liveMapSchema = z.object({
  takenAt: isoTimestampSchema,
  trains: z.array(liveTrainSchema),
});
export type LiveMap = z.infer<typeof liveMapSchema>;

export const liveMapResponseSchema = railRadarEnvelope(liveMapSchema);

/* ---------------------------------------------------------- station board -- */

export const stationBoardEntrySchema = z.object({
  number: z.string().min(1),
  name: z.string().nullish(),
  delayMin: z.number().int().nullish(),
  platform: z.string().nullish(),
  expectedAt: isoTimestampSchema.nullish(),
  direction: z.enum(['up', 'down']).nullish(),
});
export type StationBoardEntry = z.infer<typeof stationBoardEntrySchema>;

export const stationBoardSchema = z.object({
  stationCode: z.string().min(1),
  takenAt: isoTimestampSchema,
  trains: z.array(stationBoardEntrySchema),
});
export type StationBoard = z.infer<typeof stationBoardSchema>;

export const stationBoardResponseSchema = railRadarEnvelope(stationBoardSchema);

/* ------------------------------------------------------------------ index -- */

export const PROVIDER_METHODS = [
  'listStations',
  'listTrains',
  'getTrainDetails',
  'getLiveMap',
  'getStationBoard',
] as const;
export type ProviderMethod = (typeof PROVIDER_METHODS)[number];
