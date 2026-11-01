#!/usr/bin/env node
/**
 * Database CLI (rule N7: the only way the database changes).
 *
 *   tsx tools/db.ts migrate   apply pending migration files
 *   tsx tools/db.ts seed      load reference data and corridors
 *   tsx tools/db.ts reset     drop everything, then migrate
 *   tsx tools/db.ts status    show what is in the database
 *
 * Reference data comes from the saved provider fixtures, so seeding never
 * spends a request (rule N6).
 */
import { fileURLToPath } from 'node:url';
import {
  createDatabase,
  countStations,
  countTrains,
  latestSnapshot,
  ledgerTotals,
  listCorridors,
  describeConnectionFailure,
  describeTarget,
  migrate,
  normalizeDatabaseUrl,
  observationTotals,
  resetSchema,
  usageCounts,
  type Sql,
} from '@railpulse/db';
import { budgetWindow } from '@railpulse/shared';
import { createFixtureProvider } from '@railpulse/provider-railradar';
import { loadReference } from '../apps/api/src/lib/reference';
import { loadEnvFile } from '../apps/api/src/config';

// Same `.env` handling as the API, so DATABASE_URL in the file is honoured.
loadEnvFile();

const DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED || '').url;
// Absolute, so the CLI writes the same store whatever directory it is run from.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = process.env.PGLITE_DIR ?? `${ROOT}.data/pglite`;

async function open(): Promise<Sql> {
  return createDatabase({ url: DATABASE_URL, dataDir: DATA_DIR });
}

async function seed(sql: Sql): Promise<void> {
  console.log('Seeding reference data from fixtures (no provider requests)…');
  const provider = await createFixtureProvider();
  const summary = await loadReference(sql, provider);
  console.log(`  stations: ${summary.stations}`);
  console.log(`  trains: ${summary.trains}`);
  console.log(`  train_stops: ${summary.stops}`);
  console.log(`  corridors: ${summary.corridors.join(', ')}`);
}

async function status(sql: Sql): Promise<void> {
  const [stations, trains, corridors] = await Promise.all([
    countStations(sql),
    countTrains(sql),
    listCorridors(sql),
  ]);
  console.log(`stations: ${stations}`);
  console.log(`trains: ${trains}`);
  console.log(`corridors: ${corridors.map((c) => c.slug).join(', ') || 'none'}`);
  for (const corridor of corridors) {
    const snapshot = await latestSnapshot(sql, `corridor:${corridor.slug}`);
    console.log(`  ${corridor.slug}: latest snapshot ${snapshot?.takenAt ?? 'none'}`);
  }

  // Proof that everything fetched from the provider was kept (section 10).
  const timezone = process.env.BUDGET_TIMEZONE ?? 'Asia/Kolkata';
  const now = new Date();
  const window = budgetWindow(now, timezone);
  const [totals, observations, usage] = await Promise.all([
    ledgerTotals(sql, window.start.toISOString()),
    observationTotals(sql),
    usageCounts(sql, {
      start: window.start,
      end: window.end,
      dayStart: new Date(window.dayEnd.getTime() - 86_400_000),
      dayEnd: window.dayEnd,
    }),
  ]);

  console.log('');
  console.log('recorded data');
  console.log(`  snapshots: ${observations.snapshots}`);
  console.log(`  train observations: ${observations.observations}`);
  console.log(`  stop observations: ${observations.stopObservations}`);
  console.log(`  stored reasons: ${observations.reasons}`);
  console.log('');
  console.log('provider ledger (every call keeps its raw payload)');
  console.log(`  calls all time: ${totals.calls} (${totals.archived} with a saved payload, ${totals.failures} failed)`);
  console.log(`  cost this month (${window.month}): ${totals.costThisMonth} | used ${usage.used}/${window.daysLeft}d window`);
  console.log(`  last call: ${totals.lastCallAt ?? 'none yet'}`);
  console.log(`  methods seen: ${totals.methods.join(', ') || 'none yet'}`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'migrate';
  const sql = await open();
  console.log(`Database: ${describeTarget(DATABASE_URL)}`);
  try {
    switch (command) {
      case 'migrate': {
        const result = await migrate(sql);
        console.log(
          result.applied.length
            ? `Applied: ${result.applied.join(', ')}`
            : 'No pending migrations.',
        );
        break;
      }
      case 'seed': {
        await migrate(sql);
        await seed(sql);
        break;
      }
      case 'reset': {
        await resetSchema(sql);
        const result = await migrate(sql);
        console.log(`Database reset. Applied: ${result.applied.join(', ')}`);
        break;
      }
      case 'status': {
        await status(sql);
        break;
      }
      default: {
        console.error(`Unknown command "${command}". Use migrate, seed, reset or status.`);
        process.exitCode = 1;
      }
    }
  } finally {
    await sql.close();
  }
}

main().catch((error) => {
  const hint = describeConnectionFailure(error, DATABASE_URL);
  console.error(`\nDatabase error (${hint.code}): ${hint.message}\n`);
  for (const fix of hint.fixes) console.error(`  - ${fix}`);
  console.error('\nNothing was changed. Fix the above and run the command again.\n');
  process.exit(1);
});
