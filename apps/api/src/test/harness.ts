/**
 * Test harness: an in-memory database filled from saved fixtures (rule N6).
 * No test in this repository can reach the provider.
 */
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, migrate, type Sql } from '@railpulse/db';
import { createFixtureProvider } from '@railpulse/provider-railradar';
import { takeSnapshot } from '../jobs/snapshot';
import { loadReference } from '../lib/reference';
import { loadConfig, type AppConfig } from '../config';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../fixtures/railradar');

export interface TestContext {
  sql: Sql;
  config: AppConfig;
  /** Recorded live-map fixture names, oldest first. */
  liveMaps: string[];
  /** Both recorded snapshots are ingested, oldest first. */
  ingest(): Promise<void>;
  close(): Promise<void>;
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({
      PROVIDER_MODE: 'fixtures',
      DATABASE_URL: '',
      ADMIN_TOKEN: 'test-admin-token',
      LOG_LEVEL: 'silent',
      MONTHLY_CAP: '100',
      RESERVE: '20',
      BUDGET_TIMEZONE: 'Asia/Kolkata',
      CORS_ORIGINS: '*',
    } as NodeJS.ProcessEnv),
    ...overrides,
  };
}

export async function createTestContext(): Promise<TestContext> {
  const sql = await createDatabase({ dataDir: ':memory:' });
  await migrate(sql);
  const provider = await createFixtureProvider({ dir: FIXTURES });
  await loadReference(sql, provider);
  const liveMaps = (await readdir(FIXTURES))
    .filter((file) => file.startsWith('live-map-'))
    .sort();

  return {
    sql,
    config: testConfig(),
    liveMaps,
    async ingest() {
      const reader = await createFixtureProvider({ dir: FIXTURES, liveMaps });
      for (let i = 0; i < liveMaps.length; i += 1) {
        await takeSnapshot(sql, reader);
      }
    },
    async close() {
      await sql.close();
    },
  };
}
