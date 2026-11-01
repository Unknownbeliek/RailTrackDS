/**
 * Static load job: stations, trains (one request each) and train details
 * (one request per corridor train). The static part is saved for good, so this
 * runs rarely; in fixtures mode it costs nothing.
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
  const { sql, ingest, providerMode } = await loadServerEnv();
  try {
    const summary = await loadStatic(sql, ingest);
    console.log(
      `static load: ${summary.stations} stations, ${summary.trains} trains, ` +
        `${summary.stops} stop rows, ${summary.detailsRequested} detail calls ` +
        `(provider mode: ${providerMode})`,
    );
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
