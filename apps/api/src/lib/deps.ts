/**
 * What a module needs from the app, declared once so route modules never have
 * to import app.ts (which would create a dependency cycle).
 */
import type { Sql } from '@railpulse/db';
import type { AdminSnapshotResponse } from '@railpulse/shared';
import type { AppConfig } from '../config';

export interface AppDeps {
  config: AppConfig;
  sql: Sql;
  providerMode: 'fixtures' | 'live';
  version: string;
  now: () => Date;
  /** Admin refresh. Spending happens inside the job, through the guard. */
  runSnapshot: () => Promise<AdminSnapshotResponse>;
}
