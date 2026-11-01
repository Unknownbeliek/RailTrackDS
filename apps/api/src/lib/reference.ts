/**
 * Loading the reference layer from whatever provider is configured.
 * Used by the static-load job, the database seed tool and the test harness,
 * so there is exactly one implementation of "fill the reference tables".
 *
 * Budget safety: train details cost one request per train, so this never
 * fetches "every train in India". It fetches an explicit list, or — in live
 * mode — a set discovered from the corridor's station boards, always capped
 * (section 3.3 plans about 12).
 */
import {
  CORRIDOR_SEEDS,
  seedCorridor,
  seedStops,
  upsertStations,
  upsertTrains,
  type Sql,
} from '@railpulse/db';
import { toStation, toTrainReference, toTrainStops } from '@railpulse/provider-railradar';
import type { StationBoard, TrainDataProvider, TrainStopRow } from '@railpulse/shared';

export interface ReferenceSummary {
  stations: number;
  trains: number;
  stops: number;
  detailsRequested: number;
  /** Trains we would have fetched but the cap skipped. */
  detailsSkipped: number;
  /** Set when trains came from station boards rather than a list. */
  discovered: string[];
  corridors: string[];
}

export interface ReferenceOptions {
  /** Which trains to fetch details for. Highest priority. */
  trainNumbers?: string[];
  corridorSlugs?: string[];
  /** Hard cap on train-details requests; default 12, matching section 3.3. */
  maxDetails?: number;
  /**
   * Live mode without an explicit list: read one station board per corridor
   * station (a handful of requests) and keep trains that touch two or more of
   * them. Fixtures mode never needs this: its recordings are free.
   */
  discoverFromBoards?: boolean;
  log?: (message: string) => void;
}

const DEFAULT_MAX_DETAILS = 12;

/** Trains that appear at two or more corridor stations are on the corridor. */
export function trainsTouchingCorridor(boards: StationBoard[], minimumStations = 2): string[] {
  const seen = new Map<string, number>();
  for (const board of boards) {
    for (const train of new Set(board.trains.map((entry) => entry.number))) {
      seen.set(train, (seen.get(train) ?? 0) + 1);
    }
  }
  return [...seen.entries()]
    .filter(([, count]) => count >= minimumStations)
    .map(([number]) => number)
    .sort();
}

export async function loadReference(
  sql: Sql,
  provider: TrainDataProvider,
  options: ReferenceOptions = {},
): Promise<ReferenceSummary> {
  const log = options.log ?? (() => {});
  const maxDetails = options.maxDetails ?? DEFAULT_MAX_DETAILS;

  const stations = (await provider.listStations()).map(toStation);
  await upsertStations(sql, stations);

  const trains = (await provider.listTrains()).map(toTrainReference);
  await upsertTrains(sql, trains);

  const seeds = CORRIDOR_SEEDS.filter(
    (seed) => !options.corridorSlugs || options.corridorSlugs.includes(seed.slug),
  );

  // Seed the corridors first, so a corridor exists even before any timetable
  // is known: the map can then show stations while details load.
  for (const definition of seeds) {
    await seedCorridor(sql, definition);
  }

  let wanted: string[];
  let discovered: string[] = [];

  if (options.trainNumbers && options.trainNumbers.length > 0) {
    wanted = options.trainNumbers;
  } else if (options.discoverFromBoards) {
    const codes = [...new Set(seeds.flatMap((seed) => seed.stations.map((s) => s.code)))];
    const boards: StationBoard[] = [];
    for (const code of codes) {
      try {
        boards.push(await provider.getStationBoard(code));
      } catch (error) {
        // A station board we cannot read is not a reason to stop the load.
        log(`station board for ${code} failed: ${String(error)}`);
      }
    }
    discovered = trainsTouchingCorridor(boards);
    wanted = discovered;
    log(`discovered ${discovered.length} corridor trains from ${boards.length} station boards`);
  } else {
    // Fixtures (or an explicit test): every recorded train is free to read.
    wanted = trains.map((train) => train.number);
  }

  const capped = wanted.slice(0, maxDetails);
  const detailsSkipped = wanted.length - capped.length;
  if (detailsSkipped > 0) {
    log(
      `skipping ${detailsSkipped} train-detail requests to stay inside MAX_TRAIN_DETAILS=${maxDetails}; ` +
        'set CORRIDOR_TRAINS to choose exactly which trains matter',
    );
  }

  const stopsByTrain = new Map<string, TrainStopRow[]>();
  for (const number of capped) {
    try {
      const details = await provider.getTrainDetails(number);
      stopsByTrain.set(number, toTrainStops(details));
    } catch (error) {
      // One missing detail must not stop the whole load.
      log(`train details for ${number} failed: ${String(error)}`);
    }
  }
  const stops = await seedStops(sql, stopsByTrain);

  // Second pass now that timetables exist: corridor membership is derived from
  // stop rows, so a train that touches the corridor is included without a list.
  for (const definition of seeds) {
    await seedCorridor(sql, definition, { stopsByTrain });
  }

  return {
    stations: stations.length,
    trains: trains.length,
    stops,
    detailsRequested: capped.length,
    detailsSkipped,
    discovered,
    corridors: seeds.map((seed) => seed.slug),
  };
}
