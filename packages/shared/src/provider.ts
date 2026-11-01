/**
 * The provider contract, defined once (section 9.3).
 * The RailRadar package implements it; the budget guard wraps it; nothing else
 * is allowed to call the provider directly (rule N2).
 */
import type {
  LiveMap,
  StationBoard,
  StationLookup,
  TrainDetails,
  TrainLookup,
} from './schemas/provider';

export interface TrainDataProvider {
  listStations(): Promise<StationLookup[]>;
  listTrains(): Promise<TrainLookup[]>;
  getTrainDetails(trainNumber: string): Promise<TrainDetails>;
  getLiveMap(): Promise<LiveMap>;
  getStationBoard(stationCode: string): Promise<StationBoard>;
}

/** What a guarded provider exposes: the same methods, but every call is metered. */
export type MeteredProvider = TrainDataProvider;
