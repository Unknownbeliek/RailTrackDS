/**
 * Snapshot job (P6, section 3): one live-map request covers every active
 * corridor, then observations are stored for corridor trains only.
 * Reasons are computed once here and stored with their evidence.
 */
import {
  createSnapshot,
  insertObservations,
  listCorridors,
  listCorridorTrainNumbers,
  listObservations,
  saveReason,
  type Sql,
} from '@railpulse/db';
import { toObservations } from '@railpulse/provider-railradar';
import type { Snapshot } from '@railpulse/shared';
import type { TrainDataProvider } from '@railpulse/shared';
import { buildStates, loadCorridorState, scopeOf } from '../lib/corridor-state';
import { reasonForTrain } from '../lib/reasoning';

export interface SnapshotSummary {
  snapshots: Snapshot[];
  observations: number;
  reasons: number;
}

export async function takeSnapshot(
  sql: Sql,
  provider: TrainDataProvider,
  options: { slugs?: string[] } = {},
): Promise<SnapshotSummary> {
  const corridors = (await listCorridors(sql)).filter(
    (corridor) => corridor.isActive && (!options.slugs || options.slugs.includes(corridor.slug)),
  );

  // Exactly one provider request per snapshot, whatever the corridor count.
  const live = await provider.getLiveMap();

  const summary: SnapshotSummary = { snapshots: [], observations: 0, reasons: 0 };

  for (const corridor of corridors) {
    const numbers = await listCorridorTrainNumbers(sql, corridor.id);
    const corridorTrains = new Set(numbers);
    const observations = toObservations(live, corridorTrains);
    if (observations.length === 0) continue;

    const snapshot = await createSnapshot(sql, {
      scope: scopeOf(corridor.slug),
      takenAt: live.takenAt,
      callId: null,
    });
    summary.observations += await insertObservations(sql, snapshot.id, observations);
    summary.snapshots.push(snapshot);

    // Reasons: only when the previous snapshot is close enough (F9).
    const state = await loadCorridorState(sql, corridor.slug, { kind: 'id', id: snapshot.id });
    if (!state.previous) continue;
    const previousObservations = new Map(
      (await listObservations(sql, state.previous.id)).map((o) => [o.trainNumber, o]),
    );
    const states = buildStates(state, live.takenAt);

    for (const trainState of states.values()) {
      const outcome = reasonForTrain(
        trainState,
        states.values(),
        previousObservations.get(trainState.train.number),
      );
      if (!outcome.reason) continue;
      await saveReason(sql, {
        snapshotId: snapshot.id,
        trainNumber: trainState.train.number,
        reason: outcome.reason,
      });
      summary.reasons += 1;
    }
  }

  return summary;
}

/** CLI: `tsx src/jobs/snapshot.ts [--all-fixtures]` */
async function main(): Promise<void> {
  const { loadServerEnv } = await import('../bootstrap');
  const { sql, ingest, providerMode, config } = await loadServerEnv();
  try {
    const allFixtures = process.argv.includes('--all-fixtures');
    const rounds = allFixtures && providerMode === 'fixtures' ? 2 : 1;
    for (let i = 0; i < rounds; i += 1) {
      const summary = await takeSnapshot(sql, ingest);
      console.log(
        `snapshot: ${summary.observations} observations, ${summary.reasons} reasons, ` +
          `${summary.snapshots.map((s) => `${s.scope}@${s.takenAt}`).join(' ') || 'nothing to store'}`,
      );
    }
    console.log(`provider mode: ${providerMode}, corridor: ${config.defaultCorridor}`);
  } finally {
    await sql.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('snapshot.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
