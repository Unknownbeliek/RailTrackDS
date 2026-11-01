/**
 * Normalised shapes that our own API serves and our own UI renders.
 * Types are inferred from these schemas — no hand-written duplicates (section 9.2).
 */
import { z } from 'zod';
import { isoTimestampSchema } from './provider';

export const delayLevelSchema = z.enum(['ontime', 'slight', 'major']);
export type DelayLevel = z.infer<typeof delayLevelSchema>;

/** Freshness labels (section 7.5). */
export const freshnessSchema = z.enum(['recent', 'aged', 'old']);
export type Freshness = z.infer<typeof freshnessSchema>;

/** Rule labels are Likely, Possible or Unknown. Never a percentage (F9). */
export const reasonLabelSchema = z.enum(['likely', 'possible', 'unknown']);
export type ReasonLabel = z.infer<typeof reasonLabelSchema>;

export const reasonRuleSchema = z.enum(['R1', 'R2', 'R3', 'R4']);
export type ReasonRule = z.infer<typeof reasonRuleSchema>;

/** meta.source (rule N4). */
export const sourceSchema = z.enum(['snapshot', 'static', 'replay', 'live']);
export type Source = z.infer<typeof sourceSchema>;

export const directionSchema = z.enum(['up', 'down']);
export type Direction = z.infer<typeof directionSchema>;

export const stationSchema = z.object({
  code: z.string(),
  name: z.string(),
  nameHi: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  zone: z.string().nullable(),
  isJunction: z.boolean(),
});
export type Station = z.infer<typeof stationSchema>;

export const trainSchema = z.object({
  number: z.string(),
  name: z.string(),
  nameHi: z.string().nullable(),
  category: z.string(),
  priority: z.number().int(),
});
export type Train = z.infer<typeof trainSchema>;

export const corridorSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  nameHi: z.string().nullable(),
  isActive: z.boolean(),
});
export type Corridor = z.infer<typeof corridorSchema>;

export const corridorStationSchema = z.object({
  seq: z.number().int(),
  station: stationSchema,
  kmFromStart: z.number(),
});
export type CorridorStation = z.infer<typeof corridorStationSchema>;

/** A timetable row: minutes from the origin's midnight plus a day number. */
export const stopTimingSchema = z.object({
  seq: z.number().int(),
  stationCode: z.string(),
  stationName: z.string(),
  arrivalMin: z.number().int().nullable(),
  departureMin: z.number().int().nullable(),
  arrivalDay: z.number().int(),
  departureDay: z.number().int(),
  distanceKm: z.number(),
  isHalt: z.boolean(),
  platform: z.string().nullable(),
  actualArrivalMin: z.number().int().nullable(),
  actualDepartureMin: z.number().int().nullable(),
  delayMin: z.number().int().nullable(),
});
export type StopTiming = z.infer<typeof stopTimingSchema>;

/** One observation of one train in one snapshot (append-only). */
export const trainObservationSchema = z.object({
  snapshotId: z.number().int(),
  trainNumber: z.string(),
  takenAt: isoTimestampSchema,
  currentStation: z.string(),
  nextStation: z.string(),
  /** Minutes since the train left currentStation. */
  minsIntoSegment: z.number().int().nonnegative(),
  /** Scheduled running time of the whole segment, in minutes. */
  segmentMinutes: z.number().int().positive(),
  delayMin: z.number().int(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});
export type TrainObservation = z.infer<typeof trainObservationSchema>;

export const snapshotSchema = z.object({
  id: z.number().int(),
  scope: z.string(),
  takenAt: isoTimestampSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/** Output of estimatePosition (section 7.2). */
export const trainPositionSchema = z.object({
  trainNumber: z.string(),
  lat: z.number(),
  lng: z.number(),
  bearingDeg: z.number(),
  /** 0..1 along the current segment. */
  progress: z.number().min(0).max(1),
  currentStation: z.string(),
  nextStation: z.string(),
  delayMin: z.number().int(),
  delayLevel: delayLevelSchema,
  /** Held at the next station because the estimate is long past arrival. */
  isStale: z.boolean(),
  minsToNextStation: z.number().int(),
});
export type TrainPosition = z.infer<typeof trainPositionSchema>;

export const reasonSchema = z.object({
  rule: reasonRuleSchema,
  label: reasonLabelSchema,
  /** The evidence used, so a wrong guess can be debugged (section 7.4). */
  evidence: z.record(z.unknown()),
});
export type Reason = z.infer<typeof reasonSchema>;

export const nearbyGroupSchema = z.enum(['ahead', 'behind', 'opposite', 'none']);
export type NearbyGroup = z.infer<typeof nearbyGroupSchema>;

export const nearbyTrainSchema = z.object({
  trainNumber: z.string(),
  trainName: z.string(),
  group: nearbyGroupSchema,
  distanceKm: z.number(),
  delayMin: z.number(),
  delayLevel: delayLevelSchema,
  corridorPositionKm: z.number(),
  /** A train behind with higher priority and speed can overtake (7.3). */
  overtakeHint: z.boolean(),
});
export type NearbyTrain = z.infer<typeof nearbyTrainSchema>;

export const budgetSchema = z.object({
  month: z.string(),
  cap: z.number().int(),
  reserve: z.number().int(),
  used: z.number().int(),
  remaining: z.number().int(),
  dailyAllowance: z.number().int(),
  usedToday: z.number().int(),
  warn: z.boolean(),
  nextSnapshotAt: isoTimestampSchema.nullable(),
});
export type Budget = z.infer<typeof budgetSchema>;

export const providerCallSchema = z.object({
  id: z.number().int(),
  method: z.string(),
  params: z.record(z.unknown()),
  httpStatus: z.number().int().nullable(),
  cost: z.number().int(),
  createdAt: isoTimestampSchema,
  cached: z.boolean(),
});
export type ProviderCall = z.infer<typeof providerCallSchema>;

/* ------------------------------------------------------- reference rows ---- */

/** A train as stored in the reference layer (section 10). */
export const trainReferenceSchema = trainSchema.extend({
  sourceCode: z.string().nullable(),
  destinationCode: z.string().nullable(),
  /** Weekday bitmask, bit 0 = Sunday. */
  runDays: z.number().int(),
  returnTrain: z.string().nullable(),
});
export type TrainReference = z.infer<typeof trainReferenceSchema>;

export const trainStopRowSchema = z.object({
  trainNumber: z.string(),
  seq: z.number().int(),
  stationCode: z.string(),
  arrivalMin: z.number().int().nullable(),
  departureMin: z.number().int().nullable(),
  arrivalDay: z.number().int(),
  departureDay: z.number().int(),
  distanceKm: z.number(),
  isHalt: z.boolean(),
});
export type TrainStopRow = z.infer<typeof trainStopRowSchema>;

/** What a live snapshot gives us about one train, before it is stored. */
export const observationInputSchema = trainObservationSchema.omit({ snapshotId: true });
export type ObservationInput = z.infer<typeof observationInputSchema>;
