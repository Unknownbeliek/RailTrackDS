/**
 * Provider package (section 8): one implementation per backing store.
 * Nothing here knows about budget, cache or database — the guard wraps it.
 */
import type { TrainDataProvider } from '@railpulse/shared';
import { createRailRadarClient, type RailRadarConfig } from './client';
import { createFixtureProvider } from './fixtures';

export { createRailRadarClient, PROVIDER_PATHS, type RailRadarConfig } from './client';
export { createFixtureProvider, defaultFixturesDir } from './fixtures';
export * from './mappers';

export interface ProviderSetup {
  provider: TrainDataProvider;
  mode: 'fixtures' | 'live';
  /** Fixture files that exist, used by the ingest job to plan its work. */
  fixtures?: { liveMaps: string[]; trainDetails: string[] };
}

/**
 * Builds the provider once, from configuration. `PROVIDER_MODE=fixtures`
 * everywhere except the single host allowed to spend requests (rule N6).
 */
export async function createProvider(options: {
  mode: 'fixtures' | 'live';
  baseUrl: string;
  apiKey: string;
  fixturesDir?: string;
  fixtureLiveMaps?: string[];
  fetchImpl?: typeof fetch;
}): Promise<ProviderSetup> {
  if (options.mode === 'live') {
    const config: RailRadarConfig = {
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      fetchImpl: options.fetchImpl,
    };
    return { provider: createRailRadarClient(config), mode: 'live' };
  }
  const provider = await createFixtureProvider({
    dir: options.fixturesDir,
    liveMaps: options.fixtureLiveMaps,
  });
  return {
    provider,
    mode: 'fixtures',
    fixtures: { liveMaps: options.fixtureLiveMaps ?? [], trainDetails: [] },
  };
}
