/** One function per query (section 9.2). Raw SQL lives here and nowhere else. */
import type { Station } from '@railpulse/shared';
import type { Sql } from '../sql';

interface StationRow {
  code: string;
  name: string;
  name_hi: string | null;
  lat: number | string | null;
  lng: number | string | null;
  zone: string | null;
  is_junction: boolean;
}

const num = (v: number | string | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : Number(v);

function toStation(row: StationRow): Station {
  return {
    code: row.code,
    name: row.name,
    nameHi: row.name_hi,
    lat: num(row.lat),
    lng: num(row.lng),
    zone: row.zone,
    isJunction: row.is_junction,
  };
}

const COLUMNS = 'code, name, name_hi, lat, lng, zone, is_junction';

export async function upsertStations(sql: Sql, stations: Station[]): Promise<number> {
  let written = 0;
  for (const s of stations) {
    await sql.query(
      `INSERT INTO stations (code, name, name_hi, lat, lng, zone, is_junction)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         name_hi = COALESCE(EXCLUDED.name_hi, stations.name_hi),
         lat = COALESCE(EXCLUDED.lat, stations.lat),
         lng = COALESCE(EXCLUDED.lng, stations.lng),
         zone = COALESCE(EXCLUDED.zone, stations.zone),
         is_junction = EXCLUDED.is_junction`,
      [s.code, s.name, s.nameHi, s.lat, s.lng, s.zone, s.isJunction],
    );
    written += 1;
  }
  return written;
}

/** Coordinates are a known gap (spike S8); this is how they get filled. */
export async function setStationCoords(
  sql: Sql,
  code: string,
  lat: number,
  lng: number,
  coordSource: 'live_map' | 'open_dataset' | 'manual' | 'timetable',
): Promise<void> {
  await sql.query(
    `UPDATE stations SET lat = $2, lng = $3, coord_source = $4
     WHERE code = $1 AND (lat IS NULL OR lng IS NULL)`,
    [code, lat, lng, coordSource],
  );
}

export async function getStation(sql: Sql, code: string): Promise<Station | null> {
  const res = await sql.query<StationRow>(`SELECT ${COLUMNS} FROM stations WHERE code = $1`, [
    code.toUpperCase(),
  ]);
  const row = res.rows[0];
  return row ? toStation(row) : null;
}

export async function getStations(sql: Sql, codes: string[]): Promise<Station[]> {
  if (codes.length === 0) return [];
  const res = await sql.query<StationRow>(
    `SELECT ${COLUMNS} FROM stations WHERE code = ANY($1::text[])`,
    [codes.map((c) => c.toUpperCase())],
  );
  return res.rows.map(toStation);
}

export async function searchStations(sql: Sql, term: string, limit: number): Promise<Station[]> {
  const res = await sql.query<StationRow>(
    `SELECT ${COLUMNS} FROM stations
     WHERE code ILIKE $1 OR name ILIKE $1 OR name_hi ILIKE $1
     ORDER BY (code = upper($2)) DESC, name ASC
     LIMIT $3`,
    [`%${term}%`, term, limit],
  );
  return res.rows.map(toStation);
}

export async function countStations(sql: Sql): Promise<number> {
  const res = await sql.query<{ count: string }>('SELECT count(*)::text AS count FROM stations');
  return Number(res.rows[0]?.count ?? 0);
}

/**
 * Insert stations that are not known yet, and only fill in missing columns.
 * Seeding a corridor must never overwrite a real station name with a code.
 */
export async function insertStationsIfMissing(sql: Sql, stations: Station[]): Promise<number> {
  for (const s of stations) {
    await sql.query(
      `INSERT INTO stations (code, name, name_hi, lat, lng, zone, is_junction)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (code) DO UPDATE SET
         lat = COALESCE(stations.lat, EXCLUDED.lat),
         lng = COALESCE(stations.lng, EXCLUDED.lng),
         name_hi = COALESCE(stations.name_hi, EXCLUDED.name_hi)`,
      [s.code, s.name, s.nameHi, s.lat, s.lng, s.zone, s.isJunction],
    );
  }
  return stations.length;
}
