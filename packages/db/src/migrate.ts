/**
 * Migration runner (rule N7). Reads packages/db/migrations/*.sql in order and
 * applies what has not been applied, inside one transaction each.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from './sql';

const MIGRATIONS_DIR = process.env.RAILPULSE_MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '../migrations');

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export async function migrate(sql: Sql): Promise<MigrationResult> {
  await sql.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const existing = await sql.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(existing.rows.map((r) => r.name));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const text = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    await sql.exec('BEGIN');
    try {
      await sql.exec(text);
      await sql.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await sql.exec('COMMIT');
      applied.push(file);
    } catch (error) {
      await sql.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${String(error)}`);
    }
  }

  return { applied, alreadyApplied: [...done] };
}

/** Drops every table the app owns. Used by `db:reset` and the test harness. */
export async function resetSchema(sql: Sql): Promise<void> {
  await sql.exec(`
    DROP TABLE IF EXISTS reason_results, share_links, delay_history, stop_observations,
      train_observations, snapshots, provider_calls, corridor_trains, corridor_stations,
      corridors, train_stops, trains, stations, schema_migrations CASCADE;
  `);
}
