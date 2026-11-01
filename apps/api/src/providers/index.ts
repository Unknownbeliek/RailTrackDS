/**
 * provider = guarded(railradar | fixtures).
 * Nothing else in the API imports a provider package (section 9.3).
 */
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Sql } from '@railpulse/db';
import { createProvider, type ProviderSetup } from '@railpulse/provider-railradar';
import type { TrainDataProvider } from '@railpulse/shared';
import type { AppConfig } from '../config';
import { guarded, type GuardedProvider } from './guard';

export interface ProviderBundle {
  /** Guarded provider: the only way to spend a request (rule N2). */
  provider: GuardedProvider;
  /**
   * What ingest jobs read from. In live mode this is the guarded provider; in
   * fixtures mode it is the file reader, because reading a saved JSON file is
   * not a provider call and must not be cached like one.
   */
  ingest: TrainDataProvider;
  mode: 'fixtures' | 'live';
  /** Fixture live maps in time order; the ingest job walks them. */
  fixtureLiveMaps: string[];
}

export async function buildProvider(
  config: AppConfig,
  sql: Sql,
  log?: { warn: (o: unknown, m?: string) => void; info: (o: unknown, m?: string) => void },
): Promise<ProviderBundle> {
  const fixturesDir = resolve(config.fixturesDir);
  let fixtureLiveMaps: string[] = [];
  if (config.providerMode === 'fixtures') {
    try {
      fixtureLiveMaps = (await readdir(fixturesDir))
        .filter((file) => file.startsWith('live-map-') && file.endsWith('.json'))
        .sort();
    } catch {
      log?.warn({ fixturesDir }, 'No fixtures directory found; live map calls will fail.');
    }
  }

  const setup: ProviderSetup = await createProvider({
    mode: config.providerMode,
    baseUrl: config.railRadarBaseUrl,
    apiKey: config.railRadarApiKey,
    fixturesDir: join(fixturesDir),
    fixtureLiveMaps,
  });

  const provider = guarded(setup.provider, {
    sql,
    cap: config.monthlyCap,
    reserve: config.reserve,
    timezone: config.budgetTimezone,
    log,
  });

  log?.info(
    { mode: setup.mode, fixtures: fixtureLiveMaps.length, cap: config.monthlyCap },
    'Provider ready',
  );

  return {
    provider,
    ingest: setup.mode === 'live' ? provider : setup.provider,
    mode: setup.mode,
    fixtureLiveMaps,
  };
}
