/**
 * Shared start-up for the server and the CLI jobs: one config read, one
 * database handle and one guarded provider.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, migrate, type Sql } from '@railpulse/db';
import { loadConfig, type AppConfig } from './config';
import { buildProvider, type ProviderBundle } from './providers';
import type { GuardedProvider } from './providers/guard';
import type { TrainDataProvider } from '@railpulse/shared';

export interface ServerEnv {
  config: AppConfig;
  sql: Sql;
  /** Guarded: spends within the budget. */
  provider: GuardedProvider;
  /** Jobs read from this (see ProviderBundle.ingest). */
  ingest: TrainDataProvider;
  providerMode: 'fixtures' | 'live';
  fixtureLiveMaps: string[];
}

/** The monorepo root, found from this file rather than from the caller's cwd. */
export const REPO_ROOT =
  process.env.RAILPULSE_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Resolve a relative path against the repository root, not the caller's cwd. */
export function repoPath(relative: string): string {
  return path.isAbsolute(relative) ? relative : path.resolve(REPO_ROOT, relative);
}

export async function loadServerEnv(env: NodeJS.ProcessEnv = process.env): Promise<ServerEnv> {
  const config = loadConfig(env);
  const sql = await createDatabase({ url: config.databaseUrl, dataDir: repoPath(config.dataDir) });
  const bundle: ProviderBundle = await buildProvider({ ...config, fixturesDir: repoPath(config.fixturesDir) }, sql);
  return {
    config,
    sql,
    provider: bundle.provider,
    ingest: bundle.ingest,
    providerMode: bundle.mode,
    fixtureLiveMaps: bundle.fixtureLiveMaps,
  };
}

/** The database must exist before the API serves it (rule N7, deploy step). */
export async function ensureSchema(sql: Sql): Promise<void> {
  await migrate(sql);
}
