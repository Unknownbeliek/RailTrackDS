/** Train reference data and timetable rows (section 10). */
import type { StopTiming, TrainReference, TrainStopRow } from '@railpulse/shared';
import type { Sql } from '../sql';

interface TrainRow {
  number: string;
  name: string;
  name_hi: string | null;
  category: string;
  priority: number;
  source_code: string | null;
  dest_code: string | null;
  run_days: number;
  return_train: string | null;
}

interface StopRow {
  train_number: string;
  seq: number;
  station_code: string;
  station_name: string | null;
  arr_min: number | null;
  dep_min: number | null;
  arr_day: number;
  dep_day: number;
  dist_km: string | number;
  is_halt: boolean;
  platform: string | null;
}

function toReference(row: TrainRow): TrainReference {
  return {
    number: row.number,
    name: row.name,
    nameHi: row.name_hi,
    category: row.category,
    priority: row.priority,
    sourceCode: row.source_code,
    destinationCode: row.dest_code,
    runDays: row.run_days,
    returnTrain: row.return_train,
  };
}

export async function upsertTrains(sql: Sql, trains: TrainReference[]): Promise<number> {
  for (const t of trains) {
    await sql.query(
      `INSERT INTO trains (number, name, name_hi, category, type, priority, source_code, dest_code, run_days, return_train)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (number) DO UPDATE SET
         name = EXCLUDED.name,
         name_hi = COALESCE(EXCLUDED.name_hi, trains.name_hi),
         category = EXCLUDED.category,
         priority = EXCLUDED.priority,
         source_code = COALESCE(EXCLUDED.source_code, trains.source_code),
         dest_code = COALESCE(EXCLUDED.dest_code, trains.dest_code),
         run_days = EXCLUDED.run_days`,
      [
        t.number,
        t.name,
        t.nameHi,
        t.category,
        t.priority,
        t.sourceCode,
        t.destinationCode,
        t.runDays,
        t.returnTrain,
      ],
    );
  }
  return trains.length;
}

export async function upsertTrainStops(sql: Sql, stops: TrainStopRow[]): Promise<number> {
  for (const s of stops) {
    await sql.query(
      `INSERT INTO train_stops (train_number, seq, station_code, arr_min, dep_min, arr_day, dep_day, dist_km, is_halt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (train_number, seq) DO UPDATE SET
         station_code = EXCLUDED.station_code,
         arr_min = EXCLUDED.arr_min,
         dep_min = EXCLUDED.dep_min,
         arr_day = EXCLUDED.arr_day,
         dep_day = EXCLUDED.dep_day,
         dist_km = EXCLUDED.dist_km,
         is_halt = EXCLUDED.is_halt`,
      [
        s.trainNumber,
        s.seq,
        s.stationCode,
        s.arrivalMin,
        s.departureMin,
        s.arrivalDay,
        s.departureDay,
        s.distanceKm,
        s.isHalt,
      ],
    );
  }
  return stops.length;
}

export async function getTrain(sql: Sql, number: string): Promise<TrainReference | null> {
  const res = await sql.query<TrainRow>(
    `SELECT number, name, name_hi, category, priority, source_code, dest_code, run_days, return_train
     FROM trains WHERE number = $1`,
    [number],
  );
  const row = res.rows[0];
  return row ? toReference(row) : null;
}

export async function getTrains(sql: Sql, numbers: string[]): Promise<TrainReference[]> {
  if (numbers.length === 0) return [];
  const res = await sql.query<TrainRow>(
    `SELECT number, name, name_hi, category, priority, source_code, dest_code, run_days, return_train
     FROM trains WHERE number = ANY($1::text[]) ORDER BY number`,
    [numbers],
  );
  return res.rows.map(toReference);
}

export async function getTrainStops(sql: Sql, number: string): Promise<StopTiming[]> {
  const res = await sql.query<StopRow>(
    `SELECT ts.train_number, ts.seq, ts.station_code, s.name AS station_name,
            ts.arr_min, ts.dep_min, ts.arr_day, ts.dep_day, ts.dist_km, ts.is_halt,
            NULL::text AS platform
     FROM train_stops ts
     LEFT JOIN stations s ON s.code = ts.station_code
     WHERE ts.train_number = $1
     ORDER BY ts.seq ASC`,
    [number],
  );
  return res.rows.map((row) => ({
    seq: row.seq,
    stationCode: row.station_code,
    stationName: row.station_name ?? row.station_code,
    arrivalMin: row.arr_min,
    departureMin: row.dep_min,
    arrivalDay: row.arr_day,
    departureDay: row.dep_day,
    distanceKm: Number(row.dist_km),
    isHalt: row.is_halt,
    platform: row.platform,
    actualArrivalMin: null,
    actualDepartureMin: null,
    delayMin: null,
  }));
}

export async function searchTrains(sql: Sql, term: string, limit: number): Promise<TrainReference[]> {
  const res = await sql.query<TrainRow>(
    `SELECT number, name, name_hi, category, priority, source_code, dest_code, run_days, return_train
     FROM trains
     WHERE number ILIKE $1 OR name ILIKE $1 OR name_hi ILIKE $1
     ORDER BY (number = $2) DESC, number ASC
     LIMIT $3`,
    [`%${term}%`, term, limit],
  );
  return res.rows.map(toReference);
}

export async function countTrains(sql: Sql): Promise<number> {
  const res = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM trains');
  return Number(res.rows[0]?.count ?? 0);
}
