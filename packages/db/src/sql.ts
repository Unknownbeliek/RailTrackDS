/**
 * One tiny SQL surface used by every repository.
 *
 * The PRD asks for managed Postgres (Supabase or Neon). Local development and
 * CI should not need a server, so the same SQL runs on PGlite when
 * DATABASE_URL is empty. See docs/DECISIONS.md, D-003.
 */
import type { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Multi-statement scripts, used only by migrations. */
  exec(text: string): Promise<void>;
  close(): Promise<void>;
  readonly dialect: 'postgres' | 'pglite';
}

function wrapPool(pool: Pool): Sql {
  return {
    dialect: 'postgres',
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pool.query(text, params as never[]);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
    },
    async exec(text: string) {
      await pool.query(text);
    },
    async close() {
      await pool.end();
    },
  };
}

function wrapPglite(db: PGlite): Sql {
  return {
    dialect: 'pglite',
    async query<T>(text: string, params: unknown[] = []) {
      const res = await db.query<T>(text, params as never[]);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
    async exec(text: string) {
      await db.exec(text);
    },
    async close() {
      await db.close();
    },
  };
}

export interface DatabaseOptions {
  /** postgres:// URL, or empty for the embedded store. */
  url?: string;
  /** Where the embedded store keeps its files. ':memory:' for tests. */
  dataDir?: string;
}

export async function createDatabase(options: DatabaseOptions = {}): Promise<Sql> {
  const url = options.url ?? '';
  if (url.startsWith('postgres')) {
    const { Pool: PgPool } = await import('pg');
    const pool = new PgPool({ connectionString: url, max: 5 });
    return wrapPool(pool);
  }
  const { PGlite: EmbeddedPostgres } = await import('@electric-sql/pglite');
  const dataDir = options.dataDir ?? './.data/pglite';
  // An empty constructor argument is how PGlite means "in memory"; the string
  // ':memory:' would otherwise be treated as a directory name.
  if (dataDir === ':memory:') {
    const db = new EmbeddedPostgres();
    await db.waitReady;
    return wrapPglite(db);
  }
  // PGlite only creates the last path segment, so create the parents first.
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dataDir, { recursive: true });
  const db = new EmbeddedPostgres(dataDir);
  await db.waitReady;
  return wrapPglite(db);
}
