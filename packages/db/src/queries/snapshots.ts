/** Append-only observations: snapshots, train observations, stop observations. */
import type {
  ObservationInput,
  Snapshot,
  StopTiming,
  TrainObservation,
} from '@railpulse/shared';
import type { Sql } from '../sql';

interface SnapshotRow {
  id: number | string;
  scope: string;
  taken_at: Date | string;
  call_id: number | string | null;
}

interface ObservationRow {
  snapshot_id: number | string;
  train_number: string;
  taken_at: Date | string;
  current_station: string;
  next_station: string;
  mins_since_dep: number;
  next_arrival_min: number;
  delay_min: number;
  lat: string | number | null;
  lng: string | number | null;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
const num = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : Number(v);

function toSnapshot(row: SnapshotRow): Snapshot {
  return { id: Number(row.id), scope: row.scope, takenAt: iso(row.taken_at) };
}

export async function createSnapshot(
  sql: Sql,
  input: { scope: string; takenAt: string; callId: number | null },
): Promise<Snapshot> {
  // (scope, taken_at) is unique, so re-ingesting the same recording is a no-op.
  await sql.query(
    `INSERT INTO snapshots (scope, taken_at, call_id) VALUES ($1, $2, $3)
     ON CONFLICT (scope, taken_at) DO NOTHING`,
    [input.scope, input.takenAt, input.callId],
  );
  const res = await sql.query<SnapshotRow>(
    `SELECT id, scope, taken_at, call_id FROM snapshots WHERE scope = $1 AND taken_at = $2`,
    [input.scope, input.takenAt],
  );
  return toSnapshot(res.rows[0]!);
}

export async function insertObservations(
  sql: Sql,
  snapshotId: number,
  observations: ObservationInput[],
): Promise<number> {
  let written = 0;
  for (const o of observations) {
    await sql.query(
      `INSERT INTO train_observations
        (snapshot_id, train_number, current_station, next_station, mins_since_dep, next_arrival_min, delay_min, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (snapshot_id, train_number) DO UPDATE SET
         current_station = EXCLUDED.current_station,
         next_station = EXCLUDED.next_station,
         mins_since_dep = EXCLUDED.mins_since_dep,
         next_arrival_min = EXCLUDED.next_arrival_min,
         delay_min = EXCLUDED.delay_min,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng`,
      [
        snapshotId,
        o.trainNumber,
        o.currentStation,
        o.nextStation,
        o.minsIntoSegment,
        o.segmentMinutes,
        o.delayMin,
        o.lat,
        o.lng,
      ],
    );
    written += 1;
  }
  return written;
}

export async function getSnapshot(sql: Sql, id: number): Promise<Snapshot | null> {
  const res = await sql.query<SnapshotRow>(
    `SELECT id, scope, taken_at, call_id FROM snapshots WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  return row ? toSnapshot(row) : null;
}

export async function latestSnapshot(sql: Sql, scope: string): Promise<Snapshot | null> {
  const res = await sql.query<SnapshotRow>(
    `SELECT id, scope, taken_at, call_id FROM snapshots WHERE scope = $1
     ORDER BY taken_at DESC LIMIT 1`,
    [scope],
  );
  const row = res.rows[0];
  return row ? toSnapshot(row) : null;
}

/** The snapshot at or before an instant, used by replay and by `?at=`. */
export async function snapshotAtOrBefore(
  sql: Sql,
  scope: string,
  at: string,
): Promise<Snapshot | null> {
  const res = await sql.query<SnapshotRow>(
    `SELECT id, scope, taken_at, call_id FROM snapshots
     WHERE scope = $1 AND taken_at <= $2
     ORDER BY taken_at DESC LIMIT 1`,
    [scope, at],
  );
  const row = res.rows[0];
  return row ? toSnapshot(row) : null;
}

export async function previousSnapshot(
  sql: Sql,
  scope: string,
  before: string,
): Promise<Snapshot | null> {
  const res = await sql.query<SnapshotRow>(
    `SELECT id, scope, taken_at, call_id FROM snapshots
     WHERE scope = $1 AND taken_at < $2
     ORDER BY taken_at DESC LIMIT 1`,
    [scope, before],
  );
  const row = res.rows[0];
  return row ? toSnapshot(row) : null;
}

export async function listSnapshots(
  sql: Sql,
  scope: string,
  fromIso: string | null,
  toIso: string | null,
  limit: number,
): Promise<Snapshot[]> {
  const res = await sql.query<SnapshotRow>(
    `SELECT id, scope, taken_at, call_id FROM snapshots
     WHERE scope = $1
       AND ($2::timestamptz IS NULL OR taken_at >= $2)
       AND ($3::timestamptz IS NULL OR taken_at < $3)
     ORDER BY taken_at ASC
     LIMIT $4`,
    [scope, fromIso, toIso, limit],
  );
  return res.rows.map(toSnapshot);
}

export async function listObservations(
  sql: Sql,
  snapshotId: number,
): Promise<TrainObservation[]> {
  const res = await sql.query<ObservationRow>(
    `SELECT o.snapshot_id, o.train_number, s.taken_at, o.current_station, o.next_station,
            o.mins_since_dep, o.next_arrival_min, o.delay_min, o.lat, o.lng
     FROM train_observations o
     JOIN snapshots s ON s.id = o.snapshot_id
     WHERE o.snapshot_id = $1`,
    [snapshotId],
  );
  return res.rows.map((row) => ({
    snapshotId: Number(row.snapshot_id),
    trainNumber: row.train_number,
    takenAt: iso(row.taken_at),
    currentStation: row.current_station,
    nextStation: row.next_station,
    minsIntoSegment: row.mins_since_dep,
    segmentMinutes: Math.max(1, row.next_arrival_min),
    delayMin: row.delay_min,
    lat: num(row.lat),
    lng: num(row.lng),
  }));
}

export async function getObservation(
  sql: Sql,
  snapshotId: number,
  trainNumber: string,
): Promise<TrainObservation | null> {
  const rows = await listObservations(sql, snapshotId);
  return rows.find((o) => o.trainNumber === trainNumber) ?? null;
}

/** Latest observation of one train, whatever the snapshot (used by share). */
export async function latestObservationOfTrain(
  sql: Sql,
  trainNumber: string,
): Promise<{ observation: TrainObservation; snapshot: Snapshot } | null> {
  const res = await sql.query<ObservationRow>(
    `SELECT o.snapshot_id, o.train_number, s.taken_at, o.current_station, o.next_station,
            o.mins_since_dep, o.next_arrival_min, o.delay_min, o.lat, o.lng,
            s.scope, s.id AS sid
     FROM train_observations o
     JOIN snapshots s ON s.id = o.snapshot_id
     WHERE o.train_number = $1
     ORDER BY s.taken_at DESC LIMIT 1`,
    [trainNumber],
  );
  const row = res.rows[0] as (ObservationRow & { scope: string }) | undefined;
  if (!row) return null;
  return {
    observation: {
      snapshotId: Number(row.snapshot_id),
      trainNumber: row.train_number,
      takenAt: iso(row.taken_at),
      currentStation: row.current_station,
      nextStation: row.next_station,
      minsIntoSegment: row.mins_since_dep,
      segmentMinutes: Math.max(1, row.next_arrival_min),
      delayMin: row.delay_min,
      lat: num(row.lat),
      lng: num(row.lng),
    },
    snapshot: { id: Number(row.snapshot_id), scope: row.scope, takenAt: iso(row.taken_at) },
  };
}

export async function insertStopObservations(
  sql: Sql,
  snapshotId: number,
  stops: Array<{
    trainNumber: string;
    seq: number;
    actArrivalMin: number | null;
    actDepartureMin: number | null;
    delayMin: number | null;
    platform: string | null;
  }>,
): Promise<number> {
  for (const stop of stops) {
    await sql.query(
      `INSERT INTO stop_observations
        (snapshot_id, train_number, seq, act_arr_min, act_dep_min, delay_min, platform)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (snapshot_id, train_number, seq) DO UPDATE SET
         act_arr_min = EXCLUDED.act_arr_min,
         act_dep_min = EXCLUDED.act_dep_min,
         delay_min = EXCLUDED.delay_min,
         platform = EXCLUDED.platform`,
      [
        snapshotId,
        stop.trainNumber,
        stop.seq,
        stop.actArrivalMin,
        stop.actDepartureMin,
        stop.delayMin,
        stop.platform,
      ],
    );
  }
  return stops.length;
}

export async function listStopObservations(
  sql: Sql,
  snapshotId: number,
  trainNumber: string,
): Promise<StopTiming[]> {
  const res = await sql.query<{
    seq: number;
    act_arr_min: number | null;
    act_dep_min: number | null;
    delay_min: number | null;
    platform: string | null;
  }>(
    `SELECT seq, act_arr_min, act_dep_min, delay_min, platform
     FROM stop_observations WHERE snapshot_id = $1 AND train_number = $2 ORDER BY seq`,
    [snapshotId, trainNumber],
  );
  return res.rows.map((row) => ({
    seq: row.seq,
    stationCode: '',
    stationName: '',
    arrivalMin: null,
    departureMin: null,
    arrivalDay: 0,
    departureDay: 0,
    distanceKm: 0,
    isHalt: true,
    platform: row.platform,
    actualArrivalMin: row.act_arr_min,
    actualDepartureMin: row.act_dep_min,
    delayMin: row.delay_min,
  }));
}

export async function countObservations(sql: Sql, snapshotId: number): Promise<number> {
  const res = await sql.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM train_observations WHERE snapshot_id = $1',
    [snapshotId],
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** Does this scope have any recorded snapshot at all? (used by admin plan) */
export async function observationsExist(sql: Sql, scope: string): Promise<boolean> {
  const res = await sql.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM snapshots WHERE scope = $1) AS exists',
    [scope],
  );
  return Boolean(res.rows[0]?.exists);
}
