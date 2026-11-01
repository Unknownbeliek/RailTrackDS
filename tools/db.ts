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
  listCorridors,
  migrate,
  resetSchema,
  type Sql,
} from '@railpulse/db';
import { createFixtureProvider } from '@railpulse/provider-railradar';
import { loadReference } from '../apps/api/src/lib/reference';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
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
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'migrate';
  const sql = await open();
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
  console.error(error);
  process.exit(1);
});
