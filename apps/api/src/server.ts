/**
 * The one small host (section 15): API plus scheduler in a single process.
 */
import { buildApp } from './app';
import { ensureSchema, loadServerEnv } from './bootstrap';
import { takeSnapshot } from './jobs/snapshot';
import { startScheduler } from './jobs/scheduler';
import { budgetService } from './modules/admin/service';
import { makeMeta } from './lib/envelope';

const VERSION = '0.1.0';

async function main(): Promise<void> {
  const { config, sql, provider, providerMode } = await loadServerEnv();
  await ensureSchema(sql);

  const app = await buildApp({
    config,
    sql,
    providerMode,
    version: VERSION,
    now: () => new Date(),
    runSnapshot: async () => {
      // The admin refresh spends one request through the guard, or throws.
      const summary = await takeSnapshot(sql, provider);
      const { data } = await budgetService(sql, config);
      const snapshot = summary.snapshots[0] ?? null;
      return {
        data: {
          snapshot,
          observations: summary.observations,
          spent: data.budget.usedToday,
          message: snapshot
            ? `Stored ${summary.observations} observations for ${summary.snapshots.length} corridor(s).`
            : 'The provider returned nothing for this corridor.',
        },
        meta: makeMeta({
          asOf: snapshot?.takenAt ?? new Date().toISOString(),
          source: 'snapshot',
          isEstimated: true,
          snapshotId: snapshot?.id ?? null,
        }),
      };
    },
  });

  process.on('SIGINT', () => {
    void app.close().then(() => sql.close().then(() => process.exit(0)));
  });
  process.on('SIGTERM', () => {
    void app.close().then(() => sql.close().then(() => process.exit(0)));
  });

  if (config.schedulerEnabled) {
    startScheduler({
      sql,
      provider,
      timezone: config.budgetTimezone,
      corridorSlugs: (await (await import('@railpulse/db')).listCorridors(sql)).map((c) => c.slug),
      log: app.log,
    });
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    { providerMode, cap: config.monthlyCap, reserve: config.reserve },
    'RailPulse API ready',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
