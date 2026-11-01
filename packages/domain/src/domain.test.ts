import { describe, expect, it } from 'vitest';
import type { CorridorStation, TrainObservation } from '@railpulse/shared';
import {
  averageSpeedKph,
  bearingDeg,
  buildCorridorIndex,
  canOvertake,
  corridorKmAt,
  delayLevel,
  delayReason,
  estimatePosition,
  freshness,
  haversineKm,
  inferDirection,
  isStaleSnapshot,
  nearbyTrains,
  trainCorridorState,
} from './index';
import type { StationCoords } from './position';

const coords: StationCoords = new Map([
  ['NDLS', { lat: 28.6431, lng: 77.2197 }],
  ['GZB', { lat: 28.6618, lng: 77.4378 }],
  ['ALJN', { lat: 27.8974, lng: 78.088 }],
]);

const T0 = '2026-11-01T04:00:00.000Z';

function obs(overrides: Partial<TrainObservation> = {}): TrainObservation {
  return {
    snapshotId: 41,
    trainNumber: '12301',
    takenAt: T0,
    currentStation: 'NDLS',
    nextStation: 'GZB',
    minsIntoSegment: 15,
    segmentMinutes: 40,
    delayMin: 0,
    lat: null,
    lng: null,
    ...overrides,
  };
}

function corridor(): CorridorStation[] {
  const rows: Array<[string, number, number, number]> = [
    ['NDLS', 0, 28.6431, 77.2197],
    ['GZB', 1, 28.6618, 77.4378],
    ['ALJN', 2, 27.8974, 78.088],
  ];
  return rows.map(([code, seq, lat, lng]) => ({
    seq,
    kmFromStart: [0, 26, 136][seq] ?? 0,
    station: {
      code,
      name: code,
      nameHi: null,
      lat,
      lng,
      zone: null,
      isJunction: false,
    },
  }));
}

describe('geo', () => {
  it('measures Delhi to Ghaziabad at roughly 24 km', () => {
    const km = haversineKm(coords.get('NDLS')!, coords.get('GZB')!);
    expect(km).toBeGreaterThan(18);
    expect(km).toBeLessThan(30);
  });

  it('gives an easterly bearing to the east', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 5);
  });
});

describe('delayLevel', () => {
  it('bands delays at 5 and 15 minutes', () => {
    expect(delayLevel(0)).toBe('ontime');
    expect(delayLevel(4)).toBe('ontime');
    expect(delayLevel(5)).toBe('slight');
    expect(delayLevel(14)).toBe('slight');
    expect(delayLevel(15)).toBe('major');
  });
});

describe('freshness', () => {
  const now = new Date('2026-11-01T10:00:00.000Z');
  it('labels under 15 minutes as recent', () => {
    expect(freshness('2026-11-01T09:50:00.000Z', now)).toBe('recent');
  });
  it('labels 15 minutes to 3 hours as aged', () => {
    expect(freshness('2026-11-01T09:00:00.000Z', now)).toBe('aged');
  });
  it('labels over 3 hours as old and stale', () => {
    expect(freshness('2026-11-01T05:00:00.000Z', now)).toBe('old');
    expect(isStaleSnapshot('2026-11-01T05:00:00.000Z', now)).toBe(true);
  });
});

describe('estimatePosition', () => {
  it('puts the train at a fraction of the segment', () => {
    const p = estimatePosition(obs(), '2026-11-01T04:00:00.000Z', coords)!;
    expect(p.progress).toBeCloseTo(15 / 40, 5);
    expect(p.minsToNextStation).toBe(25);
    expect(p.isStale).toBe(false);
    expect(p.delayLevel).toBe('ontime');
  });

  it('moves the train forward as the viewing time advances', () => {
    const a = estimatePosition(obs(), T0, coords)!;
    const b = estimatePosition(obs(), '2026-11-01T04:10:00.000Z', coords)!;
    expect(b.progress).toBeGreaterThan(a.progress);
  });

  it('holds the train at the next station when it is far past arrival', () => {
    const p = estimatePosition(obs(), '2026-11-01T05:30:00.000Z', coords)!;
    expect(p.progress).toBe(1);
    expect(p.isStale).toBe(true);
    expect(p.lat).toBeCloseTo(coords.get('GZB')!.lat, 6);
  });

  it('returns null when a station has no coordinates', () => {
    expect(estimatePosition(obs({ nextStation: 'XXX' }), T0, coords)).toBeNull();
  });
});

describe('corridor index', () => {
  it('reads a train direction from corridor order', () => {
    const index = buildCorridorIndex(corridor());
    expect(inferDirection(obs(), index)).toBe('down');
    expect(inferDirection(obs({ currentStation: 'GZB', nextStation: 'NDLS' }), index)).toBe('up');
  });

  it('places a train in km along the corridor', () => {
    const index = buildCorridorIndex(corridor());
    expect(corridorKmAt(obs(), 0.5, index)).toBeCloseTo(13, 5);
  });

  it('computes average speed only from usable numbers', () => {
    expect(averageSpeedKph(130, 120)).toBe(65);
    expect(averageSpeedKph(0, 120)).toBeNull();
  });
});

describe('nearbyTrains', () => {
  const at = T0;
  const stations = corridor();

  it('groups trains as ahead, behind and opposite within 50 km', () => {
    const selected = trainCorridorState(
      { observation: obs({ minsIntoSegment: 20 }), trainName: 'A', priority: 5, avgSpeedKph: 60 },
      at,
      stations,
    )!;
    const behind = trainCorridorState(
      {
        observation: obs({ trainNumber: '22222', minsIntoSegment: 5, delayMin: 20 }),
        trainName: 'B',
        priority: 1,
        avgSpeedKph: 90,
      },
      at,
      stations,
    )!;
    const opposite = trainCorridorState(
      {
        observation: obs({
          trainNumber: '33333',
          currentStation: 'GZB',
          nextStation: 'NDLS',
          minsIntoSegment: 10,
        }),
        trainName: 'C',
        priority: 3,
        avgSpeedKph: 70,
      },
      at,
      stations,
    )!;

    expect(canOvertake(selected, behind)).toBe(true);
    const result = nearbyTrains(selected, [selected, behind, opposite]);
    expect(result.behind.map((t) => t.trainNumber)).toEqual(['22222']);
    expect(result.ahead).toHaveLength(0);
    expect(result.opposite.map((t) => t.trainNumber)).toEqual(['33333']);
    expect(result.behind[0]!.overtakeHint).toBe(true);
  });
});

describe('delayReason', () => {
  const base = {
    takenAt: T0,
    currentStation: 'NDLS',
    nextStation: 'GZB',
    delayMin: 6,
    minsIntoSegment: 10,
    segmentMinutes: 40,
  };

  it('says Not enough fresh data when snapshots are far apart', () => {
    const out = delayReason({
      previous: { ...base, takenAt: '2026-11-01T02:00:00.000Z' },
      current: base,
    });
    expect(out.available).toBe(false);
    expect(out.reason).toBeNull();
  });

  it('returns null when there is no previous snapshot at all', () => {
    expect(delayReason({ previous: null, current: base }).available).toBe(false);
  });

  it('matches R1 when a faster train is close behind', () => {
    const out = delayReason({
      previous: { ...base, takenAt: '2026-11-01T03:50:00.000Z', minsIntoSegment: 8, delayMin: 4 },
      current: { ...base, minsIntoSegment: 9 },
      behind: [
        {
          trainNumber: '22222',
          trainName: 'B',
          group: 'behind',
          distanceKm: 12,
          delayMin: 0,
          delayLevel: 'ontime',
          corridorPositionKm: 3,
          overtakeHint: true,
        },
      ],
    });
    expect(out.reason?.rule).toBe('R1');
    expect(out.reason?.label).toBe('likely');
  });

  it('matches R2 when visibility is under 500 m', () => {
    const out = delayReason({
      previous: { ...base, takenAt: '2026-11-01T03:50:00.000Z', delayMin: 2 },
      current: { ...base, delayMin: 18, minsIntoSegment: 22 },
      weather: { visibilityM: 300 },
    });
    expect(out.reason?.rule).toBe('R2');
    expect(out.reason?.label).toBe('possible');
  });

  it('matches R3 when the delay grew while standing at a station', () => {
    const out = delayReason({
      previous: { ...base, takenAt: '2026-11-01T03:50:00.000Z', delayMin: 3, minsIntoSegment: 10 },
      current: { ...base, delayMin: 12, minsIntoSegment: 10 },
    });
    expect(out.reason?.rule).toBe('R3');
  });

  it('falls back to Unknown with evidence rather than a percentage', () => {
    const out = delayReason({
      previous: {
        ...base,
        takenAt: '2026-11-01T03:50:00.000Z',
        currentStation: 'GZB',
        nextStation: 'ALJN',
        delayMin: 5,
        minsIntoSegment: 5,
      },
      current: { ...base, delayMin: 4, minsIntoSegment: 20 },
    });
    expect(out.reason?.label).toBe('unknown');
    expect(out.reason?.evidence).toMatchObject({ gapMin: 10 });
  });
});
