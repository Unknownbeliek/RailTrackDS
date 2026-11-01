#!/usr/bin/env node
/**
 * Setup doctor: says out loud what is configured, what is missing, and what to
 * do next. It never prints the API key (rule N1), only whether it is set and
 * where it came from.
 *
 *   npm run doctor
 */
import path from 'node:path';
import {
  countStations,
  describeConnectionFailure,
  describeTarget,
  normalizeDatabaseUrl,
  countTrains,
  createDatabase,
  latestSnapshot,
  ledgerTotals,
  listCorridors,
  migrate,
  observationTotals,
  type Sql,
} from '@railpulse/db';
import { budgetWindow } from '@railpulse/shared';
import { REPO_ROOT, repoPath } from '../apps/api/src/bootstrap';
import { loadConfig, loadEnvFile } from '../apps/api/src/config';

const ok = (label: string, detail: string) => console.log(`  ok    ${label}: ${detail}`);
const warn = (label: string, detail: string) => console.log(`  warn  ${label}: ${detail}`);
const bad = (label: string, detail: string) => console.log(`  FAIL  ${label}: ${detail}`);

function mask(secret: string): string {
  if (secret.length <= 8) return '***';
  return `${secret.slice(0, 4)}…${secret.slice(-2)} (${secret.length} chars)`;
}

async function main(): Promise<void> {
  console.log('RailPulse setup check\n');

  console.log('environment');
  const envFile = loadEnvFile();
  if (envFile) ok('.env', path.relative(REPO_ROOT, envFile));
  else warn('.env', `not found at ${path.join(REPO_ROOT, '.env')} — using defaults (fixtures mode)`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) ok('node', process.versions.node);
  else bad('node', `${process.versions.node} — this project needs 20 or newer`);

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    bad('config', String(error));
    console.log('\nFix the .env values above, then run `npm run doctor` again.');
    return;
  }

  ok('provider mode', config.providerMode);
  if (config.providerMode === 'live') {
    if (config.railRadarApiKey) ok('RailRadar key', mask(config.railRadarApiKey));
    else bad('RailRadar key', 'PROVIDER_MODE=live needs RAILRADAR_API_KEY');
    ok('provider base URL', `${config.railRadarBaseUrl} (spike S6 still open)`);
    ok('train-details cap', `${config.maxTrainDetails} per static load (CORRIDOR_TRAINS can pin them)`);
  } else {
    warn(
      'RailRadar key',
      config.railRadarApiKey
        ? `${mask(config.railRadarApiKey)} is set but unused while PROVIDER_MODE=fixtures`
        : 'not set — fine in fixtures mode',
    );
  }

  if (config.adminToken.length >= 16) ok('admin token', mask(config.adminToken));
  else if (config.adminToken)
    bad('admin token', `${config.adminToken.length} chars — use 32 or more random bytes`);
  else warn('admin token', 'empty, so /api/v1/admin/* answers UNAUTHORIZED (set ADMIN_TOKEN to use the budget page)');

  console.log('\ndatabase');
  const normalized = normalizeDatabaseUrl(config.databaseUrl);
  const target = normalized.url
    ? describeTarget(normalized.url)
    : `embedded PGlite at ${repoPath(config.dataDir)}`;
  ok('target', target);
  for (const note of normalized.notes) warn('connection string', note);

  let sql: Sql | null = null;
  try {
    sql = await createDatabase({ url: normalized.url, dataDir: repoPath(config.dataDir) });
    await migrate(sql);
    ok('migrations', 'applied (nothing pending)');

    const [stations, trains, corridors] = await Promise.all([
      countStations(sql),
      countTrains(sql),
      listCorridors(sql),
    ]);
    const observations = await observationTotals(sql);
    const totals = await ledgerTotals(sql, budgetWindow(new Date(), config.budgetTimezone).start.toISOString());

    console.log('\nstored data');
    ok('stations', String(stations));
    ok('trains', String(trains));
    ok('corridors', corridors.map((c) => c.slug).join(', ') || 'none yet');
    ok('snapshots', String(observations.snapshots));
    ok('train observations', String(observations.observations));

    console.log('\nprovider ledger (raw payloads kept as the archive)');
    ok('calls all time', `${totals.calls} (${totals.archived} archived, ${totals.failures} failed)`);
    ok('cost this month', `${totals.costThisMonth} of ${config.monthlyCap} (reserve ${config.reserve})`);
    ok('last call', totals.lastCallAt ?? 'none yet');

    if (stations === 0 || trains === 0) {
      console.log('\nnext step');
      console.log('  npm run db:setup          # migrate + seed reference data + ingest fixtures');
    } else if (corridors.length === 0) {
      console.log('\nnext step');
      console.log('  npm run ingest:static');
    } else {
      for (const corridor of corridors) {
        const snapshot = await latestSnapshot(sql, `corridor:${corridor.slug}`);
        const age = snapshot
          ? Math.round((Date.now() - new Date(snapshot.takenAt).getTime()) / 60000)
          : null;
        if (!snapshot) warn(`snapshot ${corridor.slug}`, 'none recorded yet — run npm run ingest:snapshot');
        else ok(`snapshot ${corridor.slug}`, `${snapshot.takenAt} (${age} min old)`);
      }
      console.log('\nnext step');
      console.log('  npm run dev               # API :3001 + web :5173');
      if (!config.adminToken) {
        console.log('  ADMIN_TOKEN=dev-admin-token npm run dev:api   # to open /admin');
      }
    }
  } catch (error) {
    const hint = describeConnectionFailure(error, normalized.url);
    bad('database', `${hint.code}: ${hint.message}`);
    for (const fix of hint.fixes) console.log(`        → ${fix}`);
    console.log('\n  Nothing else is broken: the app will not start until this connects.');
  } finally {
    await sql?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
