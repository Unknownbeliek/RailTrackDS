#!/usr/bin/env node
/**
 * Generates the saved provider fixtures in fixtures/railradar (rule N6).
 *
 * These are synthetic-but-realistic recordings shaped exactly like the
 * RailRadar envelope, so development, tests and demos never spend a request.
 * Spike S1 to S8 replace them with real payloads; the contract tests in
 * packages/shared only care about the shape.
 *
 *   node tools/make-fixtures.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../fixtures/railradar/', import.meta.url));
const IST_OFFSET_MIN = 330;

/** Delhi to Kanpur corridor (section 10 seed example). km measured from NDLS. */
const STATIONS = [
  { code: 'NDLS', name: 'New Delhi', nameHi: 'नई दिल्ली', lat: 28.6431, lng: 77.2197, zone: 'NR', isJunction: true, km: 0 },
  { code: 'GZB', name: 'Ghaziabad', nameHi: 'ग़ाज़ियाबाद', lat: 28.6618, lng: 77.4378, zone: 'NR', isJunction: true, km: 25.6 },
  { code: 'ALJN', name: 'Aligarh Junction', nameHi: 'अलीगढ़ जंक्शन', lat: 27.8974, lng: 78.088, zone: 'NCR', isJunction: true, km: 133.1 },
  { code: 'TDL', name: 'Tundla Junction', nameHi: 'टूंडला जंक्शन', lat: 27.2167, lng: 78.2333, zone: 'NCR', isJunction: true, km: 201.4 },
  { code: 'ETW', name: 'Etawah Junction', nameHi: 'इटावा जंक्शन', lat: 26.7843, lng: 79.02, zone: 'NCR', isJunction: true, km: 284.2 },
  { code: 'CNB', name: 'Kanpur Central', nameHi: 'कानपुर सेंट्रल', lat: 26.4499, lng: 80.3319, zone: 'NCR', isJunction: true, km: 440.4 },
];

/**
 * departMin is minutes after midnight IST at the origin.
 * delay is the delay reported in each snapshot (minutes).
 */
const TRAINS = [
  { number: '12301', name: 'Howrah Rajdhani Express', nameHi: 'हावड़ा राजधानी एक्सप्रेस', category: 'RAJ', direction: 'down', speedKph: 88, departMin: 9 * 60, haltMin: 2, delay: [6, 9] },
  { number: '12302', name: 'New Delhi Rajdhani Express', nameHi: 'नई दिल्ली राजधानी एक्सप्रेस', category: 'RAJ', direction: 'up', speedKph: 87, departMin: 8 * 60, haltMin: 2, delay: [0, 3] },
  { number: '12004', name: 'Lucknow Shatabdi Express', nameHi: 'लखनऊ शताब्दी एक्सप्रेस', category: 'SHATABDI', direction: 'down', speedKph: 90, departMin: 8 * 60 + 15, haltMin: 2, delay: [0, 0] },
  { number: '12002', name: 'Bhopal Shatabdi Express', nameHi: 'भोपाल शताब्दी एक्सप्रेस', category: 'SHATABDI', direction: 'down', speedKph: 85, departMin: 12 * 60 + 25, haltMin: 2, delay: [0, 4] },
  { number: '12559', name: 'Shiv Ganga Express', nameHi: 'शिव गंगा एक्सप्रेस', category: 'SF', direction: 'down', speedKph: 70, departMin: 7 * 60 + 30, haltMin: 3, delay: [12, 18] },
  { number: '12451', name: 'Shram Shakti Express', nameHi: 'श्रम शक्ति एक्सप्रेस', category: 'SF', direction: 'down', speedKph: 65, departMin: 10 * 60 + 40, haltMin: 3, delay: [4, 5] },
  { number: '12801', name: 'Purushottam Express', nameHi: 'पुरुषोत्तम एक्सप्रेस', category: 'SF', direction: 'down', speedKph: 62, departMin: 5 * 60 + 45, haltMin: 4, delay: [22, 26] },
  { number: '64101', name: 'Kanpur MEMU', nameHi: 'कानपुर मेमू', category: 'MEMU', direction: 'down', speedKph: 45, departMin: 11 * 60 + 20, haltMin: 1, delay: [18, 28], stallAfterMin: 18 },
  { number: '12391', name: 'Shramjeevi Express', nameHi: 'श्रमजीवी एक्सप्रेस', category: 'SF', direction: 'up', speedKph: 68, departMin: 7 * 60, haltMin: 3, delay: [9, 11] },
  { number: '12488', name: 'Seemanchal Express', nameHi: 'सीमांचल एक्सप्रेस', category: 'SF', direction: 'up', speedKph: 65, departMin: 9 * 60 + 30, haltMin: 3, delay: [0, 7] },
  { number: '14217', name: 'Unchahar Express', nameHi: 'उंचाहार एक्सप्रेस', category: 'EXPRESS', direction: 'up', speedKph: 55, departMin: 10 * 60, haltMin: 4, delay: [14, 16] },
];

/** Two recorded snapshots, 30 minutes apart, so replay and reason rules work. */
const SNAPSHOTS = [
  { file: 'live-map-2026-11-01T06-30-00Z.json', utc: '2026-11-01T06:30:00.000Z' },
  { file: 'live-map-2026-11-01T07-00-00Z.json', utc: '2026-11-01T07:00:00.000Z' },
];

/** Timetable as minutes-from-origin-midnight offsets (never dates). */
function buildRoute(spec) {
  const order = spec.direction === 'down' ? STATIONS : [...STATIONS].reverse();
  const stops = [];
  let clock = spec.departMin;
  order.forEach((station, i) => {
    const previous = order[i - 1];
    if (i > 0) {
      const run = Math.round((Math.abs(station.km - previous.km) / spec.speedKph) * 60);
      clock += run;
    }
    const isEnd = i === order.length - 1;
    const arrival = i === 0 ? null : clock;
    const departure = isEnd ? null : (i === 0 ? clock : clock + spec.haltMin);
    stops.push({
      seq: i,
      station,
      arrival,
      departure,
      // Distance along the train's own route, from its origin.
      distanceKm: Math.round(Math.abs(station.km - order[0].km) * 10) / 10,
    });
    if (departure !== null) clock = departure;
  });
  return stops;
}

const ROUTES = new Map(TRAINS.map((t) => [t.number, buildRoute(t)]));

function localMinutes(utcIso) {
  const d = new Date(utcIso);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + IST_OFFSET_MIN;
}

function isoAtUtc(utcIso, minutes) {
  return new Date(new Date(utcIso).getTime() + minutes * 60_000).toISOString();
}

function splitDay(minutes) {
  const day = Math.floor(minutes / 1440);
  return { min: minutes - day * 1440, day };
}

/** Where a train is at a given local minute, or null when it is not running. */
function liveState(spec, stops, atMinutes, snapshotIndex) {
  const first = stops[0];
  const last = stops[stops.length - 1];
  const start = first.departure;
  const end = last.arrival;
  if (start === null || end === null) return null;
  if (atMinutes < start || atMinutes > end) return null;

  // A train held between stations: its own clock stops while the wall clock runs.
  const effective =
    spec.stallAfterMin !== undefined
      ? Math.min(atMinutes, start + spec.stallAfterMin)
      : atMinutes;

  let i = 0;
  for (let k = 0; k < stops.length - 1; k += 1) {
    if (effective >= stops[k].departure && effective <= stops[k + 1].arrival) {
      i = k;
      break;
    }
    i = k;
  }
  const from = stops[i];
  const to = stops[i + 1] ?? stops[i];
  const span = Math.max(1, (to.arrival ?? effective) - from.departure);
  const into = Math.max(0, Math.min(span, effective - from.departure));
  const t = into / span;
  const lat = from.station.lat + (to.station.lat - from.station.lat) * t;
  const lng = from.station.lng + (to.station.lng - from.station.lng) * t;
  return {
    currentStation: from.station.code,
    nextStation: to.station.code,
    minutesSinceDeparture: Math.round(into),
    minutesToNextStation: Math.round(span - into),
    delayMin: spec.delay[snapshotIndex] ?? 0,
    lat: Math.round(lat * 1e4) / 1e4,
    lng: Math.round(lng * 1e4) / 1e4,
    speedKph: Math.round(spec.speedKph * (1 - t * 0.2)),
  };
}

function envelope(data) {
  return {
    success: true,
    data,
    meta: { source: 'railradar-fixture', timestamp: SNAPSHOTS[0].utc },
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });

  await writeFile(
    `${OUT}stations.json`,
    JSON.stringify(
      envelope({
        stations: STATIONS.map(({ code, name, nameHi, zone, isJunction }) => ({
          code, name, nameHi, zone, isJunction,
          // The real station lookup returns no coordinates (spike S8).
          lat: null,
          lng: null,
        })),
      }),
      null,
      2,
    ),
  );

  await writeFile(
    `${OUT}trains.json`,
    JSON.stringify(
      envelope({
        trains: TRAINS.map((t) => ({
          number: t.number,
          name: t.name,
          nameHi: t.nameHi,
          category: t.category,
          type: t.category,
          sourceCode: t.direction === 'down' ? 'NDLS' : 'CNB',
          destinationCode: t.direction === 'down' ? 'CNB' : 'NDLS',
          daysOfRun: [0, 1, 2, 3, 4, 5, 6],
        })),
      }),
      null,
      2,
    ),
  );

  SNAPSHOTS.forEach((snapshot, index) => {
    const atMinutes = localMinutes(snapshot.utc);
    const trains = TRAINS.map((spec) => {
      const state = liveState(spec, ROUTES.get(spec.number), atMinutes, index);
      if (!state) return null;
      return { number: spec.number, destinationCode: spec.direction === 'down' ? 'CNB' : 'NDLS', ...state };
    }).filter(Boolean);

    const payload = envelope({
      takenAt: snapshot.utc,
      trains: trains.map((t) => ({ ...t, lastReportedAt: snapshot.utc })),
    });
    payload.meta.timestamp = snapshot.utc;
    return writeFile(`${OUT}${snapshot.file}`, JSON.stringify(payload, null, 2));
  });

  // Train details for a few corridor trains (route + live part).
  // One details fixture per corridor train: the static part is saved for good.
  const detailsFor = TRAINS.map((t) => t.number);
  const atMinutes = localMinutes(SNAPSHOTS[1].utc);
  await Promise.all(
    detailsFor.map((number) => {
      const spec = TRAINS.find((t) => t.number === number);
      const stops = ROUTES.get(number);
      const delay = spec.delay[1];
      const live = liveState(spec, stops, atMinutes, 1);
      const liveSeq = stops.findIndex((s) => s.station.code === live?.currentStation);
      const route = stops.map((stop, idx) => {
        const arr = stop.arrival === null ? null : splitDay(stop.arrival);
        const dep = stop.departure === null ? null : splitDay(stop.departure);
        const passed = idx <= liveSeq;
        return {
          seq: stop.seq,
          stationCode: stop.station.code,
          stationName: stop.station.name,
          arrivalMin: arr?.min ?? null,
          departureMin: dep?.min ?? null,
          arrivalDay: arr?.day ?? 0,
          departureDay: dep?.day ?? 0,
          distanceKm: stop.distanceKm,
          platform: String(1 + ((idx * 3) % 4)),
          actualArrivalMin: passed && arr ? arr.min + delay : null,
          actualDepartureMin: passed && dep ? dep.min + delay : null,
          delayMin: passed ? delay : null,
          lat: stop.station.lat,
          lng: stop.station.lng,
        };
      });
      return writeFile(
        `${OUT}train-details-${number}.json`,
        JSON.stringify(
          envelope({
            train: {
              number,
              name: spec.name,
              nameHi: spec.nameHi,
              category: spec.category,
              type: spec.category,
              sourceCode: spec.direction === 'down' ? 'NDLS' : 'CNB',
              destinationCode: spec.direction === 'down' ? 'CNB' : 'NDLS',
              daysOfRun: [0, 1, 2, 3, 4, 5, 6],
            },
            route,
            live: live ? { ...live, takenAt: SNAPSHOTS[1].utc } : null,
          }),
          null,
          2,
        ),
      );
    }),
  );

  // Station board for Kanpur Central (backup if the live map is not free).
  await writeFile(
    `${OUT}station-board-CNB.json`,
    JSON.stringify(
      envelope({
        stationCode: 'CNB',
        takenAt: SNAPSHOTS[1].utc,
        trains: TRAINS.filter((t) => t.direction === 'up').map((t, i) => ({
          number: t.number,
          name: t.name,
          delayMin: t.delay[1],
          platform: String(2 + (i % 3)),
          expectedAt: isoAtUtc(SNAPSHOTS[1].utc, 15 + i * 9 + t.delay[1]),
          direction: 'up',
        })),
      }),
      null,
      2,
    ),
  );

  console.log(`Fixtures written to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
