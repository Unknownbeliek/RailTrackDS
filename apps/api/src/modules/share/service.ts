/**
 * Anonymous share links (F5, section 13): a random code, a train and a date.
 * Nothing about the person is stored.
 */
import { randomBytes } from 'node:crypto';
import {
  corridorSlugForTrain,
  getCorridor,
  getShareLink,
  getTrain,
  getTrainStops,
  insertShareLink,
  latestObservationOfTrain,
  listCorridorStations,
  type Sql,
} from '@railpulse/db';
import { buildCorridorIndex, estimatePosition } from '@railpulse/domain';
import {
  SHARE_CODE_LENGTH,
  SHARE_TTL_DAYS,
  AppError,
  type ShareCreateResponse,
  type ShareViewResponse,
} from '@railpulse/shared';
import { snapshotMeta } from '../../lib/envelope';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(length = SHARE_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) code += ALPHABET[bytes[i]! % ALPHABET.length];
  return code;
}

export async function createShareService(
  sql: Sql,
  input: { trainNumber: string; journeyDate: string; baseUrl: string },
  now: Date = new Date(),
): Promise<ShareCreateResponse> {
  const train = await getTrain(sql, input.trainNumber);
  if (!train) throw new AppError('NOT_FOUND', `No train ${input.trainNumber} in the local database.`);

  const expiresAt = new Date(now.getTime() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const link = await insertShareLink(sql, {
    code: makeCode(),
    trainNumber: input.trainNumber,
    journeyDate: input.journeyDate,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    data: {
      code: link.code,
      url: `${input.baseUrl.replace(/\/$/, '')}/share/${link.code}`,
      expiresAt: link.expiresAt,
    },
    meta: snapshotMeta(null, { isEstimated: true, source: 'snapshot', now }),
  };
}

export async function viewShareService(
  sql: Sql,
  code: string,
  now: Date = new Date(),
): Promise<ShareViewResponse> {
  const link = await getShareLink(sql, code);
  if (!link) throw new AppError('NOT_FOUND', 'That share link is unknown or has expired.');

  const [train, latest, stops, slug] = await Promise.all([
    getTrain(sql, link.trainNumber),
    latestObservationOfTrain(sql, link.trainNumber),
    getTrainStops(sql, link.trainNumber),
    corridorSlugForTrain(sql, link.trainNumber),
  ]);
  if (!train) throw new AppError('NOT_FOUND', 'That train is no longer in the database.');

  let position = null;
  let currentStationName: string | null = null;
  let nextStationName: string | null = null;

  if (latest && slug) {
    const corridor = await getCorridor(sql, slug);
    if (corridor) {
      const stations = await listCorridorStations(sql, corridor.id);
      const index = buildCorridorIndex(stations);
      position = estimatePosition(latest.observation, now.toISOString(), index.coords);
      currentStationName =
        stations.find((s) => s.station.code === latest.observation.currentStation)?.station.name ??
        null;
      nextStationName =
        stations.find((s) => s.station.code === latest.observation.nextStation)?.station.name ??
        null;
    }
  }
  if (!currentStationName) {
    currentStationName =
      stops.find((s) => s.stationCode === latest?.observation.currentStation)?.stationName ?? null;
  }

  return {
    data: {
      code: link.code,
      train: {
        number: train.number,
        name: train.name,
        nameHi: train.nameHi,
        category: train.category,
        priority: train.priority,
      },
      journeyDate: link.journeyDate,
      position,
      currentStationName,
      nextStationName,
      delayLevel: position?.delayLevel ?? null,
      expiresAt: link.expiresAt,
    },
    meta: snapshotMeta(latest?.snapshot ?? null, { isEstimated: true, now }),
  };
}
