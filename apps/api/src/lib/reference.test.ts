/**
 * The static load must never turn into "fetch every train in India": it takes
 * an explicit list, or discovers from station boards, and always respects the
 * cap (section 3.3 plans about 12 detail requests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, migrate, countTrains, listCorridorTrainNumbers, getCorridor, type Sql } from '@railpulse/db';
import { createFixtureProvider } from '@railpulse/provider-railradar';
import type { StationBoard, TrainDataProvider, TrainLookup } from '@railpulse/shared';
import { loadReference, trainsTouchingCorridor } from './reference';

const FIXTURES = 'fixtures/railradar';

function board(stationCode: string, numbers: string[]): StationBoard {
  return {
    stationCode,
    takenAt: '2026-11-01T07:00:00.000Z',
    trains: numbers.map((number) => ({ number, name: number, delayMin: 0 })),
  };
}

describe('trainsTouchingCorridor', () => {
  it('keeps trains that appear at two or more corridor stations', () => {
    const trains = trainsTouchingCorridor([
      board('NDLS', ['12301', '99999']),
      board('GZB', ['12301', '88888']),
      board('CNB', ['88888']),
    ]);
    expect(trains).toEqual(['12301', '88888']);
  });
});

describe('loadReference', () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await createDatabase({ dataDir: ':memory:' });
    await migrate(sql);
  });

  afterEach(async () => {
    await sql.close();
  });

  it('fetches only the trains it was told about, then derives corridor membership', async () => {
    const provider = await createFixtureProvider({ dir: FIXTURES });
    const summary = await loadReference(sql, provider, { trainNumbers: ['12301', '12002'] });
    expect(summary.detailsRequested).toBe(2);
    expect(summary.detailsSkipped).toBe(0);

    const corridor = await getCorridor(sql, 'delhi-kanpur');
    const members = await listCorridorTrainNumbers(sql, corridor!.id);
    expect(members).toEqual(['12002', '12301']);
  });

  it('stops at the cap and says how much it skipped', async () => {
    const provider = await createFixtureProvider({ dir: FIXTURES });
    const summary = await loadReference(sql, provider, {
      trainNumbers: ['12301', '12002', '12004', '12559'],
      maxDetails: 2,
    });
    expect(summary.detailsRequested).toBe(2);
    expect(summary.detailsSkipped).toBe(2);
  });

  it('discovers corridor trains from station boards in live style, and caps them', async () => {
    const fixture = await createFixtureProvider({ dir: FIXTURES });
    const lookups: TrainLookup[] = await fixture.listTrains();
    const boards = [board('NDLS', ['12301', '12559']), board('CNB', ['12301', '12559', '14217'])];

    const getToken = vi.fn(async () => ({ stationCode: 'X', takenAt: '2026-11-01T07:00:00.000Z', trains: [] }));
    const provider: TrainDataProvider = {
      listStations: () => fixture.listStations(),
      listTrains: async () => lookups,
      getTrainDetails: (number: string) => fixture.getTrainDetails(number),
      getLiveMap: () => fixture.getLiveMap(),
      getStationBoard: async (code: string) => boards.find((b) => b.stationCode === code) ?? getToken(),
    };

    const summary = await loadReference(sql, provider, { discoverFromBoards: true, maxDetails: 1 });
    expect(summary.discovered).toEqual(['12301', '12559']);
    expect(summary.detailsRequested).toBe(1);
    expect(summary.detailsSkipped).toBe(1);
  });

  it('still writes reference data when a detail request fails', async () => {
    const fixture = await createFixtureProvider({ dir: FIXTURES });
    const provider: TrainDataProvider = {
      listStations: () => fixture.listStations(),
      listTrains: () => fixture.listTrains(),
      getTrainDetails: async () => {
        throw new Error('provider said no');
      },
      getLiveMap: () => fixture.getLiveMap(),
      getStationBoard: () => fixture.getStationBoard('CNB'),
    };
    const summary = await loadReference(sql, provider, { trainNumbers: ['12301'] });
    expect(summary.stations).toBe(6);
    expect(await countTrains(sql)).toBe(11);
    expect(summary.stops).toBe(0);
  });
});
