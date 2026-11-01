/**
 * The ONLY file that reads process.env (rule N1, section 9.1).
 * If a variable is needed somewhere else, it is passed down from here.
 */
import { DEFAULT_CORRIDOR_SLUG, MONTHLY_CAP_DEFAULT, RESERVE_DEFAULT } from '@railpulse/shared';

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
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
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
    databaseUrl: env.DATABASE_URL ?? '',
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
  };
}

export type { AppConfig as Config };
