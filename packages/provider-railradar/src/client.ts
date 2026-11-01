/**
 * RailRadar HTTP client. The only code in the repository that speaks to the
 * provider over the network, and it is only ever reached through the budget
 * guard (rule N2, section 9.3).
 */
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
import { z } from 'zod';

export interface RailRadarConfig {
  baseUrl: string;
  apiKey: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Paths are the documented names; spike S6 confirms the base URL and paths. */
export const PROVIDER_PATHS = {
  stations: '/v1/stations',
  trains: '/v1/trains',
  trainDetails: (number: string) => `/v1/trains/${encodeURIComponent(number)}`,
  liveMap: '/v1/trains/live',
  stationBoard: (code: string) => `/v1/stations/${encodeURIComponent(code)}/live`,
} as const;

export function createRailRadarClient(config: RailRadarConfig): TrainDataProvider {
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 10_000;

  async function get<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${config.baseUrl.replace(/\/$/, '')}${path}`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (cause) {
      throw new AppError('PROVIDER_DOWN', 'The provider did not answer.', {
        path,
        cause: String(cause),
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new AppError('UNAUTHORIZED', 'The provider rejected the API key.', { path });
    }
    if (res.status === 429) {
      throw new AppError('BUDGET_EXHAUSTED', 'The provider says the quota is spent.', { path });
    }
    if (!res.ok) {
      throw new AppError('PROVIDER_DOWN', `Provider returned ${res.status}.`, { path });
    }

    const body: unknown = await res.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'PROVIDER_DOWN',
        'The provider response did not match its schema.',
        { path, issues: parsed.error.issues.slice(0, 5) },
      );
    }
    const payload = parsed.data as { success: boolean; error?: { message?: string } };
    if (payload.success === false) {
      throw new AppError('PROVIDER_DOWN', payload.error?.message ?? 'Provider reported failure.');
    }
    return parsed.data;
  }

  return {
    async listStations(): Promise<StationLookup[]> {
      const res = await get(PROVIDER_PATHS.stations, stationLookupResponseSchema);
      return res.data.stations;
    },
    async listTrains(): Promise<TrainLookup[]> {
      const res = await get(PROVIDER_PATHS.trains, trainLookupResponseSchema);
      return res.data.trains;
    },
    async getTrainDetails(trainNumber: string): Promise<TrainDetails> {
      const res = await get(PROVIDER_PATHS.trainDetails(trainNumber), trainDetailsResponseSchema);
      return res.data;
    },
    async getLiveMap(): Promise<LiveMap> {
      const res = await get(PROVIDER_PATHS.liveMap, liveMapResponseSchema);
      return res.data;
    },
    async getStationBoard(stationCode: string): Promise<StationBoard> {
      const res = await get(PROVIDER_PATHS.stationBoard(stationCode), stationBoardResponseSchema);
      return res.data;
    },
  };
}
