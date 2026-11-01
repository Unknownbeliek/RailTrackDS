/**
 * Search runs on our own database and costs no provider requests (F3).
 * Trains by number or name, stations by name, results as the user types.
 */
import { getStations, searchStations, searchTrains, type Sql } from '@railpulse/db';
import { SEARCH_LIMIT, type SearchResult } from '@railpulse/shared';
import { snapshotMeta } from '../../lib/envelope';

export async function searchService(
  sql: Sql,
  term: string,
  now: Date = new Date(),
): Promise<SearchResult> {
  const [trains, stations] = await Promise.all([
    searchTrains(sql, term, SEARCH_LIMIT),
    searchStations(sql, term, SEARCH_LIMIT),
  ]);

  const codes = [
    ...new Set(
      trains.flatMap((t) => [t.sourceCode, t.destinationCode]).filter((c): c is string => !!c),
    ),
  ];
  const stationRows = await getStations(sql, codes);
  const byCode = new Map(stationRows.map((s) => [s.code, s]));

  return {
    data: {
      trains: trains.map((train) => ({
        number: train.number,
        name: train.name,
        nameHi: train.nameHi,
        category: train.category,
        priority: train.priority,
        sourceStation: train.sourceCode ? (byCode.get(train.sourceCode) ?? null) : null,
        destinationStation: train.destinationCode
          ? (byCode.get(train.destinationCode) ?? null)
          : null,
      })),
      stations: stations.map((station) => ({ ...station, corridorSlug: null })),
    },
    meta: snapshotMeta(null, { isEstimated: false, source: 'static', now }),
  };
}
