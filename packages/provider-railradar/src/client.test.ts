/**
 * The live client's behaviour on the wire, proved with a stubbed fetch.
 * No test in this repository reaches the provider (rule N6); these assertions
 * are about the envelope, the auth header and the error mapping, which is what
 * the spikes will eventually confirm (S1, S6).
 */
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@railpulse/shared';
import { createRailRadarClient, PROVIDER_PATHS } from './client';
import { segmentMinutesFromLive, toObservations, toTrainStops } from './mappers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/railradar/', import.meta.url));
const fixture = (name: string): unknown => JSON.parse(readFileSync(`${FIXTURES}${name}`, 'utf8'));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function clientWith(response: Response | (() => Promise<Response>)) {
  const fetchImpl = vi.fn(async () => (typeof response === 'function' ? response() : response));
  const client = createRailRadarClient({
    baseUrl: 'https://api.example.test/',
    apiKey: 'test-key-not-real',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, fetchImpl };
}

describe('railradar client', () => {
  it('sends the key as a Bearer token and no key in the URL', async () => {
    const { client, fetchImpl } = clientWith(jsonResponse(fixture('stations.json')));
    await client.listStations();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.example.test${PROVIDER_PATHS.stations}`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key-not-real');
    expect(url).not.toContain('test-key-not-real');
  });

  it('parses a real recorded envelope', async () => {
    const { client } = clientWith(jsonResponse(fixture('live-map-2026-11-01T07-00-00Z.json')));
    const live = await client.getLiveMap();
    expect(live.trains.length).toBeGreaterThan(0);
    expect(live.takenAt).toBe('2026-11-01T07:00:00.000Z');
  });

  it('maps a rejected key to UNAUTHORIZED', async () => {
    const { client } = clientWith(jsonResponse({ success: false }, 401));
    await expect(client.listTrains()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('maps a spent quota to BUDGET_EXHAUSTED', async () => {
    const { client } = clientWith(jsonResponse({ error: { message: 'quota' } }, 429));
    await expect(client.getLiveMap()).rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED' });
  });

  it('maps a network failure to PROVIDER_DOWN, not a crash', async () => {
    const { client } = clientWith(() => Promise.reject(new Error('ECONNREFUSED')));
    await expect(client.getLiveMap()).rejects.toBeInstanceOf(AppError);
    await expect(client.getLiveMap()).rejects.toMatchObject({ code: 'PROVIDER_DOWN' });
  });

  it('refuses a payload that does not match the schema', async () => {
    const { client } = clientWith(jsonResponse({ success: true, data: { trains: 'nope' } }));
    await expect(client.getLiveMap()).rejects.toMatchObject({ code: 'PROVIDER_DOWN' });
  });
});

describe('mappers', () => {
  it('turns a live map into observations for corridor trains only', () => {
    const live = {
      takenAt: '2026-11-01T07:00:00.000Z',
      trains: [
        {
          number: '12301',
          currentStation: 'ndls',
          nextStation: 'gzb',
          minutesSinceDeparture: 12,
          minutesToNextStation: 18,
          delayMin: 5,
        },
        {
          number: '99999',
          currentStation: 'NDLS',
          nextStation: 'GZB',
          minutesSinceDeparture: 1,
          minutesToNextStation: 1,
          delayMin: 0,
        },
      ],
    };
    const observations = toObservations(live, new Set(['12301']));
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      trainNumber: '12301',
      currentStation: 'NDLS',
      nextStation: 'GZB',
      minsIntoSegment: 12,
      segmentMinutes: 30,
    });
  });

  it('reads the segment length from the two minute fields', () => {
    expect(segmentMinutesFromLive(12, 18)).toBe(30);
    expect(segmentMinutesFromLive(0, 0)).toBe(1);
  });

  it('keeps timetable times as offsets from the origin', () => {
    const details = fixture('train-details-12301.json') as {
      data: Parameters<typeof toTrainStops>[0];
    };
    const stops = toTrainStops(details.data);
    expect(stops[0]?.seq).toBe(0);
    expect(stops.length).toBeGreaterThan(2);
    for (const stop of stops) {
      expect(stop.arrivalMin === null || stop.arrivalMin < 1440 * 3).toBe(true);
    }
  });
});
