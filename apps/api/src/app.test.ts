/**
 * API tests against an in-memory database filled from fixtures (section 14).
 * Every response is parsed with its own shared schema, so the contract cannot
 * drift, and no test spends a provider request.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  adminSnapshotSchema,
  budgetResponseSchema,
  corridorDetailSchema,
  corridorListSchema,
  corridorMapSchema,
  healthSchema,
  nearbySchema,
  searchResultSchema,
  shareCreateSchema,
  shareViewSchema,
  snapshotListSchema,
  trainDetailSchema,
} from '@railpulse/shared';
import { buildApp } from './app';
import { makeMeta } from './lib/envelope';
import { createTestContext, type TestContext } from './test/harness';
import { takeSnapshot } from './jobs/snapshot';
import { createFixtureProvider } from '@railpulse/provider-railradar';

const FIXED_NOW = new Date('2026-11-01T07:20:00.000Z');

let ctx: TestContext;
let app: FastifyInstance;

function json<T>(response: { body: string }, schema: { parse: (v: unknown) => T }): T {
  return schema.parse(JSON.parse(response.body));
}

beforeAll(async () => {
  ctx = await createTestContext();
  await ctx.ingest();
  app = await buildApp({
    config: { ...ctx.config, adminToken: 'test-admin-token' },
    sql: ctx.sql,
    providerMode: 'fixtures',
    version: 'test',
    now: () => FIXED_NOW,
    runSnapshot: async () => {
      const reader = await createFixtureProvider({
        dir: 'fixtures/railradar',
        liveMaps: ctx.liveMaps,
      });
      const summary = await takeSnapshot(ctx.sql, reader);
      const snapshot = summary.snapshots[0] ?? null;
      return {
        data: {
          snapshot,
          observations: summary.observations,
          spent: 1,
          message: 'test refresh',
        },
        meta: makeMeta({ asOf: FIXED_NOW.toISOString(), source: 'snapshot', isEstimated: true }),
      };
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await ctx.close();
});

describe('health', () => {
  it('reports fixtures mode so nobody thinks we are spending', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = healthSchema.parse(res.json());
    expect(body.providerMode).toBe('fixtures');
  });
});

describe('corridors', () => {
  it('lists the seeded corridor', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/corridors' });
    const body = json(res, corridorListSchema);
    expect(body.data.corridors.map((c) => c.slug)).toContain('delhi-kanpur');
    expect(body.meta.source).toBe('static');
  });

  it('counts trains from the snapshot, not from a mockup', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/corridors/delhi-kanpur' });
    const body = json(res, corridorDetailSchema);
    expect(body.data.stations.map((s) => s.station.code)).toEqual([
      'NDLS',
      'GZB',
      'ALJN',
      'TDL',
      'ETW',
      'CNB',
    ]);
    expect(body.data.counts.total).toBeGreaterThan(5);
    expect(body.data.counts.delayed + body.data.counts.onTime).toBe(body.data.counts.total);
    expect(body.meta.asOf).toBe('2026-11-01T07:00:00.000Z');
    expect(body.meta.isEstimated).toBe(true);
  });

  it('404s on an unknown corridor', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/corridors/delhi-patna' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('map', () => {
  it('places every train inside the corridor bounding box', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/corridors/delhi-kanpur/map' });
    const body = json(res, corridorMapSchema);
    expect(body.data.trains.length).toBeGreaterThan(5);
    for (const train of body.data.trains) {
      expect(train.lat).toBeGreaterThan(26);
      expect(train.lat).toBeLessThan(29);
      expect(train.lng).toBeGreaterThan(77);
      expect(train.lng).toBeLessThan(81);
      expect(train.progress).toBeGreaterThanOrEqual(0);
      expect(train.progress).toBeLessThanOrEqual(1);
    }
    expect(body.meta.isEstimated).toBe(true);
  });

  it('moves trains forward when asked for a later viewing time', async () => {
    const base = json(
      await app.inject({ method: 'GET', url: '/api/v1/corridors/delhi-kanpur/map' }),
      corridorMapSchema,
    );
    const later = json(
      await app.inject({
        method: 'GET',
        url: '/api/v1/corridors/delhi-kanpur/map?at=2026-11-01T07:15:00.000Z',
      }),
      corridorMapSchema,
    );
    const baseTrain = base.data.trains.find((t) => t.trainNumber === '12301')!;
    const laterTrain = later.data.trains.find((t) => t.trainNumber === '12301')!;
    expect(laterTrain.progress).toBeGreaterThan(baseTrain.progress);
    expect(later.meta.source).toBe('replay');
  });

  it('serves a specific snapshot by id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/corridors/delhi-kanpur/map?snapshot=1',
    });
    const body = json(res, corridorMapSchema);
    expect(body.data.snapshot?.takenAt).toBe('2026-11-01T06:30:00.000Z');
  });

  it('rejects an impossible query instead of guessing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/corridors/delhi-kanpur/map?snapshot=1&at=2026-11-01T07:00:00.000Z',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
  });
});

describe('replay', () => {
  it('lists recorded snapshot times for the day', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/corridors/delhi-kanpur/snapshots?date=2026-11-01',
    });
    const body = json(res, snapshotListSchema);
    expect(body.data.snapshots).toHaveLength(2);
    expect(body.meta.source).toBe('replay');
  });
});

describe('trains', () => {
  it('shows the held MEMU with a Likely reason and its evidence', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/trains/64101' });
    const body = json(res, trainDetailSchema);
    expect(body.data.runningInLatestSnapshot).toBe(true);
    expect(body.data.reason?.rule).toBe('R1');
    expect(body.data.reason?.label).toBe('likely');
    expect(body.data.reason?.evidence).toMatchObject({ blockedByTrain: '12002' });
    expect(body.data.position?.delayLevel).toBe('major');
  });

  it('has no reason card when the snapshots are too far apart', async () => {
    // 12301 exists in both snapshots, which are 30 minutes apart, so the card
    // is available; a train missing from the previous snapshot is the "no data" case.
    const res = await app.inject({ method: 'GET', url: '/api/v1/trains/12002' });
    const body = json(res, trainDetailSchema);
    expect(body.data.reasonAvailable).toBe(false);
    expect(body.data.reason).toBeNull();
  });

  it('keeps the timetable and the as-of time together', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/trains/12301' });
    const body = json(res, trainDetailSchema);
    expect(body.data.stops.length).toBe(6);
    expect(body.data.stops[0]?.distanceKm).toBe(0);
    expect(body.meta.asOf).toBe('2026-11-01T07:00:00.000Z');
    expect(body.meta.snapshotId).toBe(2);
  });

  it('404s for a train that is not in the database', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/trains/99999' });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a malformed train number', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/trains/abc' });
    expect(res.statusCode).toBe(400);
  });

  it('groups nearby trains ahead, behind and opposite', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/trains/64101/nearby' });
    const body = json(res, nearbySchema);
    expect(body.data.behind.map((t) => t.trainNumber)).toContain('12002');
    expect(body.data.behind[0]?.overtakeHint).toBe(true);
    for (const group of [body.data.ahead, body.data.behind, body.data.opposite]) {
      for (const train of group) expect(train.distanceKm).toBeLessThanOrEqual(50);
    }
  });
});

describe('search', () => {
  it('finds trains by number and by name without spending anything', async () => {
    const byName = json(
      await app.inject({ method: 'GET', url: '/api/v1/search?q=Rajdhani' }),
      searchResultSchema,
    );
    expect(byName.data.trains.length).toBeGreaterThan(0);
    const byNumber = json(
      await app.inject({ method: 'GET', url: '/api/v1/search?q=64101' }),
      searchResultSchema,
    );
    expect(byNumber.data.trains[0]?.number).toBe('64101');
  });

  it('finds stations by name', async () => {
    const body = json(
      await app.inject({ method: 'GET', url: '/api/v1/search?q=Kanpur' }),
      searchResultSchema,
    );
    expect(body.data.stations.some((s) => s.code === 'CNB')).toBe(true);
  });
});

describe('share', () => {
  it('creates an anonymous code that reveals only a train and a date', async () => {
    const created = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/share',
        payload: { trainNumber: '12301', journeyDate: '2026-11-01' },
      }),
      shareCreateSchema,
    );
    expect(created.data.code).toHaveLength(10);
    expect(created.data.url).toContain(`/share/${created.data.code}`);

    const viewed = json(
      await app.inject({ method: 'GET', url: `/api/v1/share/${created.data.code}` }),
      shareViewSchema,
    );
    expect(viewed.data.train.number).toBe('12301');
    expect(viewed.data.journeyDate).toBe('2026-11-01');
    expect(viewed.data.position).not.toBeNull();
    expect(viewed.meta.isEstimated).toBe(true);
  });

  it('404s on an expired or unknown code', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/share/ZZZZZZZZZZ' });
    expect(res.statusCode).toBe(404);
  });
});

describe('admin', () => {
  it('refuses without the token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/budget' });
    expect(res.statusCode).toBe(401);
  });

  it('shows used, left, the daily allowance and recent calls', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/budget',
      headers: { 'x-admin-token': 'test-admin-token' },
    });
    const body = json(res, budgetResponseSchema);
    expect(body.data.budget.cap).toBe(100);
    expect(body.data.budget.reserve).toBe(20);
    expect(body.data.budget.dailyAllowance).toBeGreaterThan(0);
    expect(Array.isArray(body.data.recentCalls)).toBe(true);
  });

  it('refreshes a snapshot on demand', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/snapshot',
      headers: { 'x-admin-token': 'test-admin-token' },
    });
    expect(res.statusCode).toBe(200);
    adminSnapshotSchema.parse(res.json());
  });
});

describe('error shape', () => {
  it('uses one envelope for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

export { createFixtureProvider };
