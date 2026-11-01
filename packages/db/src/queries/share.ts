/** Anonymous share codes: a train and a date, and nothing about a person (F5). */
import type { Sql } from '../sql';

export interface ShareLink {
  code: string;
  trainNumber: string;
  journeyDate: string;
  createdAt: string;
  expiresAt: string;
}

interface ShareRow {
  code: string;
  train_number: string;
  journey_date: Date | string;
  created_at: Date | string;
  expires_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
const dateOnly = (v: Date | string): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

function toShare(row: ShareRow): ShareLink {
  return {
    code: row.code,
    trainNumber: row.train_number,
    journeyDate: dateOnly(row.journey_date),
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
  };
}

export async function insertShareLink(
  sql: Sql,
  input: { code: string; trainNumber: string; journeyDate: string; expiresAt: string },
): Promise<ShareLink> {
  const res = await sql.query<ShareRow>(
    `INSERT INTO share_links (code, train_number, journey_date, expires_at)
     VALUES ($1, $2, $3::date, $4)
     RETURNING code, train_number, journey_date, created_at, expires_at`,
    [input.code, input.trainNumber, input.journeyDate, input.expiresAt],
  );
  return toShare(res.rows[0]!);
}

export async function getShareLink(sql: Sql, code: string): Promise<ShareLink | null> {
  const res = await sql.query<ShareRow>(
    `SELECT code, train_number, journey_date, created_at, expires_at
     FROM share_links WHERE code = $1 AND expires_at > now()`,
    [code.toUpperCase()],
  );
  const row = res.rows[0];
  return row ? toShare(row) : null;
}
