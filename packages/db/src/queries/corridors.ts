/**
 * Corridors are data, not code (section 10): adding Delhi to Patna means
 * inserting rows, so every function here takes a slug or an id.
 */
import type { Corridor, CorridorStation, TrainReference } from '@railpulse/shared';
import type { Sql } from '../sql';

interface CorridorRow {
  id: number;
  slug: string;
  name: string;
  name_hi: string | null;
  is_active: boolean;
}

interface CorridorStationRow {
  seq: number;
  station_code: string;
  km_from_start: string | number;
  name: string;
  name_hi: string | null;
  lat: string | number | null;
  lng: string | number | null;
  zone: string | null;
  is_junction: boolean;
}

const num = (v: string | number | null): number => (typeof v === 'number' ? v : Number(v ?? 0));

function toCorridor(row: CorridorRow): Corridor {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameHi: row.name_hi,
    isActive: row.is_active,
  };
}

export async function upsertCorridor(
  sql: Sql,
  corridor: { slug: string; name: string; nameHi: string | null },
): Promise<number> {
  const res = await sql.query<{ id: number }>(
    `INSERT INTO corridors (slug, name, name_hi) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, name_hi = EXCLUDED.name_hi
     RETURNING id`,
    [corridor.slug, corridor.name, corridor.nameHi],
  );
  return res.rows[0]!.id;
}

export async function setCorridorStations(
  sql: Sql,
  corridorId: number,
  stations: Array<{ stationCode: string; kmFromStart: number }>,
): Promise<void> {
  await sql.query('DELETE FROM corridor_stations WHERE corridor_id = $1', [corridorId]);
  for (const [seq, entry] of stations.entries()) {
    await sql.query(
      `INSERT INTO corridor_stations (corridor_id, seq, station_code, km_from_start)
       VALUES ($1, $2, $3, $4)`,
      [corridorId, seq, entry.stationCode, entry.kmFromStart],
    );
  }
}

export async function setCorridorTrains(
  sql: Sql,
  corridorId: number,
  trainNumbers: string[],
): Promise<void> {
  await sql.query('DELETE FROM corridor_trains WHERE corridor_id = $1', [corridorId]);
  for (const number of trainNumbers) {
    await sql.query(
      `INSERT INTO corridor_trains (corridor_id, train_number) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [corridorId, number],
    );
  }
}

export async function listCorridors(sql: Sql): Promise<Corridor[]> {
  const res = await sql.query<CorridorRow>(
    `SELECT id, slug, name, name_hi, is_active FROM corridors ORDER BY id ASC`,
  );
  return res.rows.map(toCorridor);
}

export async function getCorridor(sql: Sql, slug: string): Promise<Corridor | null> {
  const res = await sql.query<CorridorRow>(
    `SELECT id, slug, name, name_hi, is_active FROM corridors WHERE slug = $1`,
    [slug],
  );
  const row = res.rows[0];
  return row ? toCorridor(row) : null;
}

export async function listCorridorStations(
  sql: Sql,
  corridorId: number,
): Promise<CorridorStation[]> {
  const res = await sql.query<CorridorStationRow>(
    `SELECT cs.seq, cs.station_code, cs.km_from_start,
            s.name, s.name_hi, s.lat, s.lng, s.zone, s.is_junction
     FROM corridor_stations cs
     JOIN stations s ON s.code = cs.station_code
     WHERE cs.corridor_id = $1
     ORDER BY cs.seq ASC`,
    [corridorId],
  );
  return res.rows.map((row) => ({
    seq: row.seq,
    kmFromStart: num(row.km_from_start),
    station: {
      code: row.station_code,
      name: row.name,
      nameHi: row.name_hi,
      lat: row.lat === null ? null : num(row.lat),
      lng: row.lng === null ? null : num(row.lng),
      zone: row.zone,
      isJunction: row.is_junction,
    },
  }));
}

export async function listCorridorTrainNumbers(sql: Sql, corridorId: number): Promise<string[]> {
  const res = await sql.query<{ train_number: string }>(
    `SELECT train_number FROM corridor_trains WHERE corridor_id = $1 ORDER BY train_number`,
    [corridorId],
  );
  return res.rows.map((r) => r.train_number);
}

export async function listCorridorTrains(sql: Sql, corridorId: number): Promise<TrainReference[]> {
  const res = await sql.query<{
    number: string;
    name: string;
    name_hi: string | null;
    category: string;
    priority: number;
    source_code: string | null;
    dest_code: string | null;
    run_days: number;
    return_train: string | null;
  }>(
    `SELECT t.number, t.name, t.name_hi, t.category, t.priority,
            t.source_code, t.dest_code, t.run_days, t.return_train
     FROM corridor_trains ct JOIN trains t ON t.number = ct.train_number
     WHERE ct.corridor_id = $1
     ORDER BY t.priority ASC, t.number ASC`,
    [corridorId],
  );
  return res.rows.map((row) => ({
    number: row.number,
    name: row.name,
    nameHi: row.name_hi,
    category: row.category,
    priority: row.priority,
    sourceCode: row.source_code,
    destinationCode: row.dest_code,
    runDays: row.run_days,
    returnTrain: row.return_train,
  }));
}

/** Which corridor a station belongs to, for search results (F3). */
export async function corridorSlugForStation(
  sql: Sql,
  stationCode: string,
): Promise<string | null> {
  const res = await sql.query<{ slug: string }>(
    `SELECT c.slug FROM corridor_stations cs JOIN corridors c ON c.id = cs.corridor_id
     WHERE cs.station_code = $1 LIMIT 1`,
    [stationCode],
  );
  return res.rows[0]?.slug ?? null;
}

/** Which corridor a train belongs to, for /trains/:number and nearby (F6). */
export async function corridorSlugForTrain(
  sql: Sql,
  trainNumber: string,
): Promise<string | null> {
  const res = await sql.query<{ slug: string }>(
    `SELECT c.slug FROM corridor_trains ct JOIN corridors c ON c.id = ct.corridor_id
     WHERE ct.train_number = $1 ORDER BY c.id LIMIT 1`,
    [trainNumber],
  );
  return res.rows[0]?.slug ?? null;
}
