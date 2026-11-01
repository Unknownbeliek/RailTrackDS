/**
 * Contract tests (rule N6): every saved fixture must parse with the shared
 * schema. These tests never touch the network.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  liveMapResponseSchema,
  stationBoardResponseSchema,
  stationLookupResponseSchema,
  trainDetailsResponseSchema,
  trainLookupResponseSchema,
} from './provider';

const FIXTURES = fileURLToPath(new URL('../../../../fixtures/railradar/', import.meta.url));

const SCHEMAS: Array<[RegExp, z.ZodTypeAny]> = [
  [/^stations\.json$/, stationLookupResponseSchema],
  [/^trains\.json$/, trainLookupResponseSchema],
  [/^train-details-[\d]+\.json$/, trainDetailsResponseSchema],
  [/^live-map-.+\.json$/, liveMapResponseSchema],
  [/^station-board-[A-Z]+\.json$/, stationBoardResponseSchema],
];

function files(): string[] {
  return readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));
}

function schemaFor(file: string): z.ZodTypeAny | undefined {
  return SCHEMAS.find(([pattern]) => pattern.test(file))?.[1];
}

describe('provider fixtures', () => {
  const all = files();

  it('exist', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it.each(all)('%s parses with its shared schema', (file) => {
    const schema = schemaFor(file);
    expect(schema, `No schema registered for fixture ${file}`).toBeDefined();
    const json = JSON.parse(readFileSync(`${FIXTURES}${file}`, 'utf8'));
    const parsed = schema!.safeParse(json);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });
});
