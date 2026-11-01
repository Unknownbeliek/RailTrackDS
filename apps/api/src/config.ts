/**
 * The ONLY file that reads process.env (rule N1, section 9.1).
 * If a variable is needed somewhere else, it is passed down from here.
 *
 * This is also the one place the `.env` file is read: `dotenv` fills
 * process.env for anything that is not already set, so a value exported in the
 * shell always wins over the file.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import { DEFAULT_CORRIDOR_SLUG, MONTHLY_CAP_DEFAULT, RESERVE_DEFAULT } from '@railpulse/shared';

/** The repository root, so `.env` is found whatever directory a job runs from. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let envFileLoaded = false;

/**
 * Loads `.env` (and `.env.local`) once. Vite already gives the web app its own
 * env handling; this is for the API, the jobs and the CLI tools.
 */
export function loadEnvFile(root: string = REPO_ROOT): string | null {
  if (envFileLoaded) return null;
  envFileLoaded = true;
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (existsSync(file)) {
      loadDotEnv({ path: file, override: false, quiet: true });
      return file;
    }
  }
  return null;
}

export type ProviderMode = 'fixtures' | 'live';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  providerMode: ProviderMode;
  railRadarApiKey: string;
  railRadarBaseUrl: string;
  databaseUrl: string;
  dataDir: string;
  monthlyCap: number;
  reserve: number;
  budgetTimezone: string;
  adminToken: string;
  port: number;
  host: string;
  corsOrigins: string[];
  logLevel: string;
  defaultCorridor: string;
  fixturesDir: string;
  schedulerEnabled: boolean;
  /** Explicit corridor train list; without it, live mode discovers a bounded set. */
  corridorTrains: string[];
  /** Hard cap on train-details requests during one static load (budget safety). */
  maxTrainDetails: number;
}

/**
 * The train-details cap exists to protect a 100-request month, so a typo like
 * MAX_TRAIN_DETAILS=9999 must not override it: 24 leaves room for two snapshots
 * a day and the 20-request reserve.
 */
const MAX_TRAIN_DETAILS_LIMIT = 24;

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadEnvFile();
  const providerMode: ProviderMode = env.PROVIDER_MODE === 'live' ? 'live' : 'fixtures';
  if (providerMode === 'live' && !env.RAILRADAR_API_KEY) {
    // Fail fast and loudly rather than discovering it mid-ingest.
    throw new Error('PROVIDER_MODE=live needs RAILRADAR_API_KEY (rule N1).');
  }

  return {
    nodeEnv: (env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    providerMode,
    railRadarApiKey: env.RAILRADAR_API_KEY ?? '',
    railRadarBaseUrl: env.RAILRADAR_BASE_URL ?? 'https://api.railradar.in',
    // DATABASE_URL_POOLED is the name Neon puts next to the direct string; either
    // works, so accept both instead of failing on the one that was copied.
    databaseUrl: (env.DATABASE_URL ?? '').trim() || (env.DATABASE_URL_POOLED ?? '').trim(),
    dataDir: env.PGLITE_DIR ?? './.data/pglite',
    monthlyCap: int(env.MONTHLY_CAP, MONTHLY_CAP_DEFAULT),
    reserve: int(env.RESERVE, RESERVE_DEFAULT),
    budgetTimezone: env.BUDGET_TIMEZONE ?? 'Asia/Kolkata',
    adminToken: env.ADMIN_TOKEN ?? '',
    port: int(env.PORT, 3001),
    host: env.HOST ?? '0.0.0.0',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    logLevel: env.LOG_LEVEL ?? 'info',
    defaultCorridor: env.DEFAULT_CORRIDOR ?? DEFAULT_CORRIDOR_SLUG,
    fixturesDir: env.RAILPULSE_FIXTURES_DIR ?? './fixtures/railradar',
    schedulerEnabled: bool(env.SCHEDULER_ENABLED, providerMode === 'live'),
    corridorTrains: (env.CORRIDOR_TRAINS ?? '')
      .split(',')
      .map((number) => number.trim())
      .filter((number) => /^\d{4,5}$/.test(number)),
    maxTrainDetails: Math.min(
      MAX_TRAIN_DETAILS_LIMIT,
      Math.max(1, int(env.MAX_TRAIN_DETAILS, 12)),
    ),
  };
}

export type { AppConfig as Config };
