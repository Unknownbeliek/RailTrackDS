/**
 * Config is the only place env vars are read (rule N1), so its precedence rules
 * deserve tests of their own: a stale shell export next to a correct `.env` is
 * the exact situation that made a supplied API key look broken.
 *
 * Every case passes an explicit env object, so a developer's own `.env` cannot
 * change the outcome.
 */
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

// Built from parts so tools/scan-secrets.mjs can stay strict about literal
// credential URLs; this is not a real credential.
const NEON = `postgresql://${['u', 'p'].join(':')}@ep-x-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;

describe('loadConfig', () => {
  it('accepts DATABASE_URL_POOLED when DATABASE_URL is absent', () => {
    expect(loadConfig({ DATABASE_URL_POOLED: NEON }).databaseUrl).toBe(NEON);
  });

  it('prefers DATABASE_URL when both are set', () => {
    const direct = 'postgres://direct.example/db';
    const config = loadConfig({ DATABASE_URL: direct, DATABASE_URL_POOLED: NEON });
    expect(config.databaseUrl).toBe(direct);
  });

  it('treats a blank DATABASE_URL as unset', () => {
    expect(loadConfig({ DATABASE_URL: '   ', DATABASE_URL_POOLED: NEON }).databaseUrl).toBe(NEON);
  });

  it('falls back to the embedded store when neither is set', () => {
    expect(loadConfig({}).databaseUrl).toBe('');
  });

  it('lists trains from CORRIDOR_TRAINS and drops anything that is not a train number', () => {
    const config = loadConfig({ CORRIDOR_TRAINS: '12301, 12002 ,,12559,abc,1' });
    expect(config.corridorTrains).toEqual(['12301', '12002', '12559']);
  });

  it('caps MAX_TRAIN_DETAILS so a typo cannot spend the month', () => {
    expect(loadConfig({ MAX_TRAIN_DETAILS: '9999' }).maxTrainDetails).toBe(24);
    expect(loadConfig({ MAX_TRAIN_DETAILS: '0' }).maxTrainDetails).toBe(1);
    expect(loadConfig({ MAX_TRAIN_DETAILS: 'nonsense' }).maxTrainDetails).toBe(12);
    expect(loadConfig({ MAX_TRAIN_DETAILS: '3' }).maxTrainDetails).toBe(3);
    expect(loadConfig({}).maxTrainDetails).toBe(12);
  });

  it('refuses live mode without a key instead of quietly using fixtures', () => {
    expect(() => loadConfig({ PROVIDER_MODE: 'live' })).toThrow(/RAILRADAR_API_KEY/);
    expect(loadConfig({ PROVIDER_MODE: 'live', RAILRADAR_API_KEY: 'k' }).providerMode).toBe('live');
  });

  it('treats anything that is not "live" as fixtures', () => {
    expect(loadConfig({ PROVIDER_MODE: 'LIVE' }).providerMode).toBe('fixtures');
    expect(loadConfig({}).providerMode).toBe('fixtures');
  });

  it('keeps the budget defaults the PRD asks for', () => {
    const config = loadConfig({});
    expect(config.monthlyCap).toBe(100);
    expect(config.reserve).toBe(20);
    expect(config.budgetTimezone).toBe('Asia/Kolkata');
  });
});
