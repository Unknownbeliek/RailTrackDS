/**
 * The ledger is also the archive (section 10): every provider call stores its
 * raw payload, so old data can be reprocessed without spending a request, and
 * the cache is simply a recent matching row.
 */
import type { ProviderCall } from '@railpulse/shared';
import type { Sql } from '../sql';

interface CallRow {
  id: number | string;
  method: string;
  params: unknown;
  http_status: number | null;
  cost: number;
  cached: boolean;
  payload: unknown;
  created_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

function toCall(row: CallRow): ProviderCall {
  return {
    id: Number(row.id),
    method: row.method,
    params: (row.params ?? {}) as Record<string, unknown>,
    httpStatus: row.http_status,
    cost: row.cost,
    createdAt: iso(row.created_at),
    cached: row.cached,
  };
}

/** Reserve before the call: the row itself is the spend. */
export async function reserveCall(
  sql: Sql,
  input: {
    provider: string;
    method: string;
    paramsHash: string;
    params: unknown;
    /** The caller's clock, so the ledger stays testable and deterministic. */
    at: Date;
  },
): Promise<number> {
  const res = await sql.query<{ id: string | number }>(
    `INSERT INTO provider_calls (provider, method, params_hash, params, cost, created_at)
     VALUES ($1, $2, $3, $4::jsonb, 1, $5)
     RETURNING id`,
    [input.provider, input.method, input.paramsHash, JSON.stringify(input.params), input.at],
  );
  return Number(res.rows[0]!.id);
}

export async function commitCall(
  sql: Sql,
  id: number,
  payload: unknown,
  httpStatus = 200,
): Promise<void> {
  await sql.query(
    `UPDATE provider_calls SET payload = $2::jsonb, http_status = $3 WHERE id = $1`,
    [id, JSON.stringify(payload), httpStatus],
  );
}

/** A failed call keeps its row (and its cost): an attempt still spent quota. */
export async function failCall(
  sql: Sql,
  id: number,
  error: string,
  httpStatus: number | null = null,
): Promise<void> {
  await sql.query(`UPDATE provider_calls SET error = $2, http_status = $3 WHERE id = $1`, [
    id,
    error,
    httpStatus,
  ]);
}

export async function discardCall(sql: Sql, id: number): Promise<void> {
  await sql.query(`DELETE FROM provider_calls WHERE id = $1`, [id]);
}

export async function findCachedPayload(
  sql: Sql,
  method: string,
  paramsHash: string,
  sinceIso: string,
): Promise<unknown | null> {
  const res = await sql.query<{ payload: unknown }>(
    `SELECT payload FROM provider_calls
     WHERE method = $1 AND params_hash = $2 AND payload IS NOT NULL
       AND created_at >= $3
     ORDER BY created_at DESC LIMIT 1`,
    [method, paramsHash, sinceIso],
  );
  const row = res.rows[0];
  return row ? row.payload : null;
}

export async function findCallPayloadById(sql: Sql, id: number): Promise<unknown | null> {
  const res = await sql.query<{ payload: unknown }>(
    'SELECT payload FROM provider_calls WHERE id = $1',
    [id],
  );
  return res.rows[0]?.payload ?? null;
}

export interface UsageCounts {
  used: number;
  usedToday: number;
  total: number;
}

export async function usageCounts(
  sql: Sql,
  window: { start: Date; end: Date; dayStart: Date; dayEnd: Date },
): Promise<UsageCounts> {
  const res = await sql.query<{ used: string; used_today: string; total: string }>(
    `SELECT
       COALESCE(SUM(CASE WHEN created_at >= $1 AND created_at < $2 THEN cost ELSE 0 END), 0)::text AS used,
       COALESCE(SUM(CASE WHEN created_at >= $3 AND created_at < $4 THEN cost ELSE 0 END), 0)::text AS used_today,
       COALESCE(SUM(cost), 0)::text AS total
     FROM provider_calls`,
    [window.start, window.end, window.dayStart, window.dayEnd],
  );
  const row = res.rows[0];
  return {
    used: Number(row?.used ?? 0),
    usedToday: Number(row?.used_today ?? 0),
    total: Number(row?.total ?? 0),
  };
}

export async function recentCalls(sql: Sql, limit: number): Promise<ProviderCall[]> {
  const res = await sql.query<CallRow>(
    `SELECT id, method, params, http_status, cost, cached, payload, created_at
     FROM provider_calls ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map(toCall);
}
