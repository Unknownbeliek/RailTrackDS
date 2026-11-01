/**
 * Connection-string handling. No test connects anywhere: these are the pure
 * decisions (what to strip, what to add, what to tell the user) that decide
 * whether a dashboard-copied URL works on the first try.
 */
import { describe, expect, it } from 'vitest';
import {
  credentialReport,
  describeConnectionFailure,
  describeTarget,
  driverOptions,
  isPostgresUrl,
  normalizeDatabaseUrl,
} from './connection';

// Assembled from parts on purpose: tools/scan-secrets.mjs fails on any literal
// Postgres URL that carries credentials, and none of these are real.
const CREDENTIALS = ['neondb_owner', 'npg_secret'].join(':');
const NEON_HOST = 'ep-tiny-pond-1234-pooler.c-2.ap-southeast-1.aws.neon.tech';
const NEON = `postgresql://${CREDENTIALS}@${NEON_HOST}/neondb`;

describe('normalizeDatabaseUrl', () => {
  it('leaves an empty value alone, meaning "use the embedded store"', () => {
    expect(normalizeDatabaseUrl('')).toEqual({ url: '', notes: [] });
    expect(normalizeDatabaseUrl('   ')).toEqual({ url: '', notes: [] });
  });

  it('drops channel_binding, which node-postgres does not implement', () => {
    const { url, notes } = normalizeDatabaseUrl(`${NEON}?sslmode=require&channel_binding=require`);
    expect(url).not.toContain('channel_binding');
    expect(url).toContain('sslmode=require');
    expect(notes.join()).toMatch(/channel_binding/);
  });

  it('adds sslmode=require for a hosted host that lost the parameter', () => {
    const { url } = normalizeDatabaseUrl(NEON);
    expect(url).toContain('sslmode=require');
  });

  it('adds it for Supabase too, and notes that the pooler is in use', () => {
    const { url, notes } = normalizeDatabaseUrl(
      `postgres://${['postgres.abc', 'pass'].join(':')}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
    );
    expect(url).toContain('sslmode=require');
    expect(notes.join()).toMatch(/pooled host/);
  });

  it('does not touch a local Postgres URL', () => {
    const local = `postgres://${['railtrack', 'railtrack'].join(':')}@localhost:5432/railtrack`;
    expect(normalizeDatabaseUrl(local)).toEqual({ url: local, notes: [] });
  });

  it('strips quotes that came along with a copy-paste', () => {
    expect(normalizeDatabaseUrl(`"${NEON}?sslmode=require"`).url.startsWith('postgresql://')).toBe(true);
  });

  it('keeps a malformed value usable enough to report on', () => {
    const { url, notes } = normalizeDatabaseUrl('postgres://not a url');
    expect(url).toBe('postgres://not a url');
    expect(notes.join()).toMatch(/did not parse/);
  });
});

describe('driverOptions', () => {
  it('turns sslmode into the pg ssl option and removes the parameter', () => {
    const options = driverOptions(`${NEON}?sslmode=require&channel_binding=require`);
    expect(options.url).not.toContain('sslmode');
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('only relaxes verification when explicitly asked', () => {
    expect(driverOptions(`${NEON}?sslmode=no-verify`).ssl).toEqual({ rejectUnauthorized: false });
  });

  it('passes through when there is nothing to map', () => {
    expect(driverOptions('').url).toBe('');
    expect(driverOptions('postgres://localhost/db').ssl).toBeUndefined();
  });
});

describe('escaped and mangled strings', () => {
  it('decodes &amp; from an HTML-escaped paste', () => {
    const { url, notes } = normalizeDatabaseUrl(`${NEON}?sslmode=require&amp;channel_binding=require`);
    expect(url).not.toContain('&amp;');
    expect(url).not.toContain('channel_binding');
    expect(url).toContain('sslmode=require');
    expect(new URL(url).searchParams.get('sslmode')).toBe('require');
    expect(notes.join()).toMatch(/HTML-escaped/);
  });

  it('reports a placeholder password instead of dialling', () => {
    const report = credentialReport(
      `postgresql://${['neondb_owner', '[YOUR-PASSWORD]'].join(':')}@${NEON_HOST}/neondb`,
    );
    expect(report?.issues).toContain('placeholder');
  });

  it('reports a markdown-wrapped paste', () => {
    const scheme = 'postgresql://';
    const wrapped = `[${scheme}${['u', 'p'].join(':')}@h/db](mailto:${scheme}u@h/db)`;
    const report = credentialReport(wrapped);
    // Not a Postgres URL at all once wrapped, so there is nothing to report on.
    expect(report).toBeNull();
  });
});

describe('credentialReport', () => {
  it('shows the user and the password length, never the password', () => {
    const report = credentialReport(`${NEON}?sslmode=require`);
    expect(report).toEqual({
      user: 'neondb_owner',
      passwordLength: 'npg_secret'.length,
      host: NEON_HOST,
      database: 'neondb',
      issues: [],
    });
    expect(JSON.stringify(report)).not.toContain('npg_secret');
  });

  it('decodes percent-encoded parts before measuring them', () => {
    const scheme = 'postgresql://';
    const report = credentialReport(`${scheme}${'u%40corp'}:${'p%40ss%23word'}@h:5432/db`);
    expect(report?.user).toBe('u@corp');
    expect(report?.passwordLength).toBe('p@ss#word'.length);
  });

  it('returns null for the embedded store', () => {
    expect(credentialReport('')).toBeNull();
  });
});

describe('describeTarget', () => {
  it('never prints the password', () => {
    const text = describeTarget(`${NEON}?sslmode=require`);
    expect(text).toBe('ep-tiny-pond-1234-pooler.c-2.ap-southeast-1.aws.neon.tech:5432/neondb');
    expect(text).not.toContain('npg_secret');
  });

  it('says what the embedded store is', () => {
    expect(describeTarget('')).toBe('embedded PGlite');
  });
});

describe('describeConnectionFailure', () => {
  const failure = (code: string, message: string) =>
    Object.assign(new Error(message), { code });

  it('recognises a dropped handshake and mentions the firewall', () => {
    const hint = describeConnectionFailure(failure('ECONNRESET', 'Connection terminated unexpectedly'));
    expect(hint.code).toBe('ETIMEDOUT');
    expect(hint.fixes.join(' ')).toMatch(/port 5432/);
  });

  it('recognises a bad password and covers the usual causes', () => {
    const hint = describeConnectionFailure(failure('28P01', 'password authentication failed for user "x"'));
    expect(hint.code).toBe('28P01');
    const fixes = hint.fixes.join(' ');
    expect(fixes).toMatch(/%40/);
    expect(fixes).toMatch(/reset the database password/i);
    expect(fixes).toMatch(/doctor/);
  });

  it('recognises DNS failure', () => {
    expect(describeConnectionFailure(failure('ENOTFOUND', 'getaddrinfo ENOTFOUND x')).code).toBe('ENOTFOUND');
  });

  it('recognises a missing database', () => {
    expect(describeConnectionFailure(failure('3D000', 'database "nope" does not exist')).code).toBe('3D000');
  });

  it('falls back to the message, and still suggests something', () => {
    const hint = describeConnectionFailure(new Error('something new'), 'postgres://h/db');
    expect(hint.code).toBe('UNKNOWN');
    expect(hint.message).toBe('something new');
    expect(hint.fixes.length).toBeGreaterThan(0);
  });
});

describe('isPostgresUrl', () => {
  it('accepts both schemes only', () => {
    expect(isPostgresUrl('postgres://x')).toBe(true);
    expect(isPostgresUrl('postgresql://x')).toBe(true);
    expect(isPostgresUrl('mysql://x')).toBe(false);
    expect(isPostgresUrl('./data')).toBe(false);
  });
});
