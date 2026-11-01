/**
 * Loading the reference layer from whatever provider is configured.
 * Used by the static-load job, the database seed tool and the test harness,
 * so there is exactly one implementation of "fill the reference tables".
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
import type { TrainDataProvider, TrainStopRow } from '@railpulse/shared';

export interface ReferenceSummary {
  stations: number;
  trains: number;
  stops: number;
  detailsRequested: number;
  corridors: string[];
}

export interface ReferenceOptions {
  /** Which trains to fetch details for; defaults to every seeded corridor station. */
  trainNumbers?: string[];
  corridorSlugs?: string[];
}

export async function loadReference(
  sql: Sql,
  provider: TrainDataProvider,
  options: ReferenceOptions = {},
): Promise<ReferenceSummary> {
  const stations = (await provider.listStations()).map(toStation);
  await upsertStations(sql, stations);

  const trains = (await provider.listTrains()).map(toTrainReference);
  await upsertTrains(sql, trains);

  const stopsByTrain = new Map<string, TrainStopRow[]>();
  const wanted = options.trainNumbers ?? trains.map((train) => train.number);
  for (const number of wanted) {
    try {
      const details = await provider.getTrainDetails(number);
      stopsByTrain.set(number, toTrainStops(details));
    } catch (error) {
      // One missing detail fixture must not stop the whole load.
      console.warn(`train details for ${number} failed: ${String(error)}`);
    }
  }
  const stops = await seedStops(sql, stopsByTrain);

  const seeds = CORRIDOR_SEEDS.filter(
    (seed) => !options.corridorSlugs || options.corridorSlugs.includes(seed.slug),
  );
  for (const definition of seeds) {
    await seedCorridor(sql, definition, { stopsByTrain });
  }

  return {
    stations: stations.length,
    trains: trains.length,
    stops,
    detailsRequested: wanted.length,
    corridors: seeds.map((seed) => seed.slug),
  };
}
