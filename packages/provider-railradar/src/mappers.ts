/**
 * Field mapping (section 9.1): the only place that knows what the provider's
 * field names mean. Everything downstream sees our own normalised shapes.
 */
import {
  DEFAULT_TRAIN_PRIORITY,
  TRAIN_PRIORITY,
  type LiveMap,
  type ObservationInput,
  type StationLookup,
  type Station,
  type TrainDetails,
  type TrainLookup,
  type TrainReference,
  type TrainStopRow,
} from '@railpulse/shared';

export function priorityForCategory(category: string | null | undefined): number {
  if (!category) return DEFAULT_TRAIN_PRIORITY;
  const key = category.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return TRAIN_PRIORITY[key] ?? DEFAULT_TRAIN_PRIORITY;
}

/** Station lookup returns codes and names; coordinates arrive later (S8). */
export function toStation(lookup: StationLookup): Station {
  return {
    code: lookup.code.trim().toUpperCase(),
    name: lookup.name.trim(),
    nameHi: lookup.nameHi?.trim() ?? null,
    lat: lookup.lat ?? null,
    lng: lookup.lng ?? null,
    zone: lookup.zone ?? null,
    isJunction: lookup.isJunction ?? false,
  };
}

/** Weekday array -> bitmask, bit 0 = Sunday (section 10). */
export function toRunDaysMask(days: number[] | null | undefined): number {
  if (!days || days.length === 0) return 0b1111111;
  return days.reduce((mask, day) => mask | (1 << day), 0);
}

export function toTrainReference(lookup: TrainLookup): TrainReference {
  const category = (lookup.category ?? lookup.type ?? 'EXPRESS').toUpperCase();
  return {
    number: lookup.number.trim(),
    name: lookup.name.trim(),
    nameHi: lookup.nameHi?.trim() ?? null,
    category,
    priority: priorityForCategory(category),
    sourceCode: lookup.sourceCode?.toUpperCase() ?? null,
    destinationCode: lookup.destinationCode?.toUpperCase() ?? null,
    runDays: toRunDaysMask(lookup.daysOfRun),
    returnTrain: null,
  };
}

/** Train details route -> timetable rows. Times are offsets, never dates. */
export function toTrainStops(details: TrainDetails): TrainStopRow[] {
  return details.route
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((stop) => ({
      trainNumber: details.train.number.trim(),
      seq: stop.seq,
      stationCode: stop.stationCode.toUpperCase(),
      arrivalMin: stop.arrivalMin ?? null,
      departureMin: stop.departureMin ?? null,
      arrivalDay: stop.arrivalDay ?? 0,
      departureDay: stop.departureDay ?? 0,
      distanceKm: stop.distanceKm ?? 0,
      isHalt: stop.arrivalMin !== null && stop.departureMin !== null,
    }));
}

/**
 * Live map -> one observation per corridor train (section 10 note: we keep the
 * raw payload in the ledger, but write observations only for corridor trains).
 *
 * segmentMinutes = minutes since departure + minutes still to run. Spike S1
 * confirms this reading of the two fields.
 */
export function toObservations(
  live: LiveMap,
  corridorTrainNumbers: ReadonlySet<string>,
): ObservationInput[] {
  return live.trains
    .filter((train) => corridorTrainNumbers.has(train.number))
    .map((train) => {
      const minsIntoSegment = Math.max(0, train.minutesSinceDeparture);
      return {
        trainNumber: train.number.trim(),
        takenAt: live.takenAt,
        currentStation: train.currentStation.toUpperCase(),
        nextStation: train.nextStation.toUpperCase(),
        minsIntoSegment,
        segmentMinutes: segmentMinutesFromLive(
          minsIntoSegment,
          train.minutesToNextStation ?? 0,
        ),
        delayMin: train.delayMin,
        lat: train.lat ?? null,
        lng: train.lng ?? null,
      };
    });
}

/** Segment length in minutes, from the two live-map fields (spike S1). */
export function segmentMinutesFromLive(
  minutesSinceDeparture: number,
  minutesToNext: number,
): number {
  const into = Number.isFinite(minutesSinceDeparture) ? minutesSinceDeparture : 0;
  const left = Number.isFinite(minutesToNext) ? minutesToNext : 0;
  return Math.max(1, Math.round(into + left));
}
