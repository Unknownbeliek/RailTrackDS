/**
 * API response shapes (section 11). One envelope, and the meta fields are
 * rule N4: every data response carries asOf, source and isEstimated.
 */
import { z } from 'zod';
import {
  budgetSchema,
  corridorSchema,
  corridorStationSchema,
  delayLevelSchema,
  freshnessSchema,
  nearbyTrainSchema,
  providerCallSchema,
  reasonSchema,
  snapshotSchema,
  stationSchema,
  stopTimingSchema,
  trainObservationSchema,
  trainPositionSchema,
  trainSchema,
} from './domain';
import { isoTimestampSchema } from './provider';

export const metaSchema = z.object({
  asOf: isoTimestampSchema,
  source: z.enum(['snapshot', 'static', 'replay', 'live']),
  isEstimated: z.boolean(),
  snapshotId: z.number().int().nullable(),
  freshness: freshnessSchema,
  /** True when the budget stopped us refreshing; data is served anyway (7.5). */
  budgetLimited: z.boolean().default(false),
});
export type Meta = z.infer<typeof metaSchema>;

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: metaSchema });
}

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/* --------------------------------------------------------------- payloads -- */

export const corridorListSchema = envelope(
  z.object({ corridors: z.array(corridorSchema) }),
);

export const corridorDetailSchema = envelope(
  z.object({
    corridor: corridorSchema,
    stations: z.array(corridorStationSchema),
    trains: z.array(trainSchema),
    counts: z.object({
      total: z.number().int(),
      delayed: z.number().int(),
      onTime: z.number().int(),
      major: z.number().int(),
    }),
  }),
);

export const corridorMapSchema = envelope(
  z.object({
    corridor: corridorSchema,
    stations: z.array(corridorStationSchema),
    trains: z.array(
      trainPositionSchema.extend({
        trainName: z.string(),
        trainNameHi: z.string().nullable(),
        direction: z.enum(['up', 'down']),
        speedKph: z.number().nullable(),
        /**
         * The stored observation, so the browser can move the marker between
         * refreshes with the same estimatePosition function (section 12).
         */
        observation: trainObservationSchema,
      }),
    ),
    snapshot: snapshotSchema.nullable(),
  }),
);

export const snapshotListSchema = envelope(
  z.object({ snapshots: z.array(snapshotSchema) }),
);

export const searchResultSchema = envelope(
  z.object({
    trains: z.array(
      trainSchema.extend({
        sourceStation: stationSchema.nullable(),
        destinationStation: stationSchema.nullable(),
      }),
    ),
    stations: z.array(stationSchema.extend({ corridorSlug: z.string().nullable() })),
  }),
);

export const trainDetailSchema = envelope(
  z.object({
    train: trainSchema,
    stations: z.object({ source: stationSchema.nullable(), destination: stationSchema.nullable() }),
    stops: z.array(stopTimingSchema),
    position: trainPositionSchema.nullable(),
    direction: z.enum(['up', 'down']).nullable(),
    speedKph: z.number().nullable(),
    /** F4: a train that is not in the latest snapshot says so. */
    runningInLatestSnapshot: z.boolean(),
    reason: reasonSchema.nullable(),
    reasonAvailable: z.boolean(),
    history: z.array(
      z.object({
        stationCode: z.string(),
        stationName: z.string(),
        avgArrDelayMin: z.number(),
        samples: z.number().int(),
        onTimeRatio: z.number(),
      }),
    ),
  }),
);

export const nearbySchema = envelope(
  z.object({
    trainNumber: z.string(),
    corridorSlug: z.string(),
    radiusKm: z.number(),
    ahead: z.array(nearbyTrainSchema),
    behind: z.array(nearbyTrainSchema),
    opposite: z.array(nearbyTrainSchema),
  }),
);

export const shareCreateSchema = envelope(
  z.object({
    code: z.string(),
    url: z.string(),
    expiresAt: isoTimestampSchema,
  }),
);

export const shareViewSchema = envelope(
  z.object({
    code: z.string(),
    train: trainSchema,
    journeyDate: z.string(),
    position: trainPositionSchema.nullable(),
    currentStationName: z.string().nullable(),
    nextStationName: z.string().nullable(),
    delayLevel: delayLevelSchema.nullable(),
    expiresAt: isoTimestampSchema,
  }),
);

export const healthSchema = z.object({
  status: z.literal('ok'),
  providerMode: z.enum(['fixtures', 'live']),
  now: isoTimestampSchema,
  version: z.string(),
});

export const budgetResponseSchema = envelope(
  z.object({
    budget: budgetSchema,
    recentCalls: z.array(providerCallSchema),
  }),
);

export const adminSnapshotSchema = envelope(
  z.object({
    snapshot: snapshotSchema.nullable(),
    observations: z.number().int(),
    spent: z.number().int(),
    message: z.string(),
  }),
);

/* ------------------------------------------------------------ input types -- */

export const corridorSlugParamsSchema = z.object({ slug: z.string().min(1).max(64) });
export const trainNumberParamsSchema = z.object({
  number: z.string().regex(/^\d{4,5}$/, 'Train numbers are 4 or 5 digits'),
});
export const shareCodeParamsSchema = z.object({ code: z.string().min(6).max(64) });
export const mapQuerySchema = z
  .object({
    snapshot: z.union([z.literal('latest'), z.coerce.number().int().positive()]).optional(),
    at: isoTimestampSchema.optional(),
  })
  .refine((q) => !(q.snapshot !== undefined && q.at !== undefined), {
    message: 'Use either snapshot or at, not both',
  });
export const snapshotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(64),
  corridor: z.string().max(64).optional(),
});
export const nearbyQuerySchema = z.object({
  snapshot: z.coerce.number().int().positive().optional(),
  corridor: z.string().max(64).optional(),
});
export const shareCreateBodySchema = z.object({
  trainNumber: z.string().regex(/^\d{4,5}$/),
  journeyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baseUrl: z.string().url().optional(),
});

export type CorridorList = z.infer<typeof corridorListSchema>;
export type CorridorDetail = z.infer<typeof corridorDetailSchema>;
export type CorridorMapResponse = z.infer<typeof corridorMapSchema>;
export type SnapshotList = z.infer<typeof snapshotListSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type TrainDetailResponse = z.infer<typeof trainDetailSchema>;
export type NearbyResponse = z.infer<typeof nearbySchema>;
export type ShareCreateResponse = z.infer<typeof shareCreateSchema>;
export type ShareViewResponse = z.infer<typeof shareViewSchema>;
export type HealthResponse = z.infer<typeof healthSchema>;
export type BudgetResponse = z.infer<typeof budgetResponseSchema>;
export type AdminSnapshotResponse = z.infer<typeof adminSnapshotSchema>;
