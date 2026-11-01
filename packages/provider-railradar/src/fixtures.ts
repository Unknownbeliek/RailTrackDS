/**
 * Fixtures mode (rule N6): the same provider interface, backed by the JSON
 * saved from spikes S1 to S8. Development, tests and demos never spend a
 * request. The live client is only built when PROVIDER_MODE=live.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppError,
  liveMapResponseSchema,
  stationBoardResponseSchema,
  stationLookupResponseSchema,
  trainDetailsResponseSchema,
  trainLookupResponseSchema,
  type LiveMap,
  type StationBoard,
  type StationLookup,
  type TrainDataProvider,
  type TrainDetails,
  type TrainLookup,
} from '@railpulse/shared';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repository `fixtures/railradar` directory, resolved from the source tree. */
export function defaultFixturesDir(): string {
  return process.env.RAILPULSE_FIXTURES_DIR ?? join(HERE, '../../../fixtures/railradar');
}

async function readJson(dir: string, name: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(dir, name), 'utf8'));
  } catch (cause) {
    throw new AppError('PROVIDER_DOWN', `Fixture ${name} could not be read.`, String(cause));
  }
}

export interface FixtureProviderOptions {
  dir?: string;
  /** Fixture live maps, oldest first; each call returns the next one. */
  liveMaps?: string[];
}

export async function createFixtureProvider(
  options: FixtureProviderOptions = {},
): Promise<TrainDataProvider & { describe(): Promise<unknown> }> {
  const dir = options.dir ?? defaultFixturesDir();
  let liveIndex = 0;

  return {
    async describe() {
      return { dir, liveMaps: options.liveMaps ?? [], liveIndex };
    },
    async listStations(): Promise<StationLookup[]> {
      const parsed = stationLookupResponseSchema.parse(await readJson(dir, 'stations.json'));
      return parsed.data.stations;
    },
    async listTrains(): Promise<TrainLookup[]> {
      const parsed = trainLookupResponseSchema.parse(await readJson(dir, 'trains.json'));
      return parsed.data.trains;
    },
    async getTrainDetails(trainNumber: string): Promise<TrainDetails> {
      const parsed = trainDetailsResponseSchema.parse(
        await readJson(dir, `train-details-${trainNumber}.json`),
      );
      return parsed.data;
    },
    async getLiveMap(): Promise<LiveMap> {
      const maps = options.liveMaps ?? [];
      const name = maps[Math.min(liveIndex, Math.max(0, maps.length - 1))];
      if (!name) throw new AppError('PROVIDER_DOWN', 'No live map fixtures configured.');
      liveIndex += 1;
      const parsed = liveMapResponseSchema.parse(await readJson(dir, name));
      return parsed.data;
    },
    async getStationBoard(stationCode: string): Promise<StationBoard> {
      const parsed = stationBoardResponseSchema.parse(
        await readJson(dir, `station-board-${stationCode}.json`),
      );
      return parsed.data;
    },
  };
}
