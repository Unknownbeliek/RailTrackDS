/**
 * Derived results (section 10): delay history from journey overlay data and
 * stored reason results with their evidence. Both can be rebuilt.
 */
import type { Reason } from '@railpulse/shared';
import type { Sql } from '../sql';

export interface DelayHistoryRow {
  stationCode: string;
  stationName: string;
  avgArrDelayMin: number;
  samples: number;
  onTimeRatio: number;
}

export async function upsertDelayHistory(
  sql: Sql,
  rows: Array<{
    trainNumber: string;
    stationCode: string;
    dayOfWeek: number;
    avgArrDelayMin: number;
    maxDelayMin: number;
    samples: number;
    onTimeCount: number;
  }>,
): Promise<number> {
  for (const row of rows) {
    await sql.query(
      `INSERT INTO delay_history
        (train_number, station_code, day_of_week, avg_arr_delay_min, max_delay_min, samples, ontime_count, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (train_number, station_code, day_of_week) DO UPDATE SET
         avg_arr_delay_min = EXCLUDED.avg_arr_delay_min,
         max_delay_min = EXCLUDED.max_delay_min,
         samples = EXCLUDED.samples,
         ontime_count = EXCLUDED.ontime_count,
         fetched_at = now()`,
      [
        row.trainNumber,
        row.stationCode,
        row.dayOfWeek,
        row.avgArrDelayMin,
        row.maxDelayMin,
        row.samples,
        row.onTimeCount,
      ],
    );
  }
  return rows.length;
}

/** Average across weekdays, so the card can say "usually +8 min here" (F8). */
export async function getDelayHistory(
  sql: Sql,
  trainNumber: string,
): Promise<DelayHistoryRow[]> {
  const res = await sql.query<{
    station_code: string;
    station_name: string | null;
    avg_delay: string;
    samples: string;
    ontime: string;
  }>(
    `SELECT h.station_code, s.name AS station_name,
            AVG(h.avg_arr_delay_min)::text AS avg_delay,
            SUM(h.samples)::text AS samples,
            SUM(h.ontime_count)::text AS ontime
     FROM delay_history h
     LEFT JOIN stations s ON s.code = h.station_code
     WHERE h.train_number = $1
     GROUP BY h.station_code, s.name
     ORDER BY MIN(h.station_code)`,
    [trainNumber],
  );
  return res.rows.map((row) => {
    const samples = Number(row.samples ?? 0);
    const ontime = Number(row.ontime ?? 0);
    return {
      stationCode: row.station_code,
      stationName: row.station_name ?? row.station_code,
      avgArrDelayMin: Math.round(Number(row.avg_delay ?? 0) * 10) / 10,
      samples,
      onTimeRatio: samples > 0 ? Math.round((ontime / samples) * 100) / 100 : 0,
    };
  });
}

export async function saveReason(
  sql: Sql,
  input: { snapshotId: number; trainNumber: string; reason: Reason },
): Promise<void> {
  await sql.query(
    `INSERT INTO reason_results (snapshot_id, train_number, rule, label, evidence)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (snapshot_id, train_number) DO UPDATE SET
       rule = EXCLUDED.rule, label = EXCLUDED.label, evidence = EXCLUDED.evidence`,
    [
      input.snapshotId,
      input.trainNumber,
      input.reason.rule,
      input.reason.label,
      JSON.stringify(input.reason.evidence),
    ],
  );
}

export async function getReason(
  sql: Sql,
  snapshotId: number,
  trainNumber: string,
): Promise<Reason | null> {
  const res = await sql.query<{ rule: string; label: string; evidence: unknown }>(
    `SELECT rule, label, evidence FROM reason_results
     WHERE snapshot_id = $1 AND train_number = $2`,
    [snapshotId, trainNumber],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    rule: row.rule as Reason['rule'],
    label: row.label as Reason['label'],
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
  };
}
