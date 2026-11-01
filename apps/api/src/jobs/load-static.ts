/**
 * Static load job: stations, trains (one request each) and train details
 * (one request per corridor train, capped). The static part is saved for good,
 * so this runs rarely; in fixtures mode it costs nothing.
 *
 *   npm run ingest:static                 # respects .env (PROVIDER_MODE, CORRIDOR_TRAINS)
 *   CORRIDOR_TRAINS=12301,12302 npm run ingest:static
 */
import type { Sql } from '@railpulse/db';
import type { TrainDataProvider } from '@railpulse/shared';
import { loadReference, type ReferenceOptions, type ReferenceSummary } from '../lib/reference';

export type StaticLoadSummary = ReferenceSummary;

export async function loadStatic(
  sql: Sql,
  provider: TrainDataProvider,
  options: ReferenceOptions = {},
): Promise<StaticLoadSummary> {
  return loadReference(sql, provider, options);
}

async function main(): Promise<void> {
  const { loadServerEnv } = await import('../bootstrap');
  const { sql, ingest, providerMode, config } = await loadServerEnv();
  try {
    const explicit = config.corridorTrains;
    const summary = await loadStatic(sql, ingest, {
      trainNumbers: explicit.length > 0 ? explicit : undefined,
      // Only live mode pays for discovery; recordings are free to read whole.
      discoverFromBoards: providerMode === 'live' && explicit.length === 0,
      maxDetails: config.maxTrainDetails,
      log: (message) => console.log(`  ${message}`),
    });
    console.log(
      `static load (${providerMode}): ${summary.stations} stations, ${summary.trains} trains, ` +
        `${summary.stops} stop rows, ${summary.detailsRequested} detail calls` +
        (summary.detailsSkipped ? `, ${summary.detailsSkipped} skipped by the cap` : ''),
    );
    console.log(`  corridors: ${summary.corridors.join(', ')}`);
  } finally {
    await sql.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('load-static.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
