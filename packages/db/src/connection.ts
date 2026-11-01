/**
 * Connection-string handling and failure diagnosis.
 *
 * Neon and Supabase both hand out a string that needs a couple of nudges
 * before node-postgres is happy with it:
 *
 *   - `channel_binding=require` is a libpq/psql option. node-postgres speaks
 *     TLS and SCRAM but does not implement channel binding, so the parameter is
 *     dropped rather than passed on as if it did something.
 *   - hosted Postgres always requires TLS, but a URL copied out of a dashboard
 *     sometimes loses `sslmode`. Adding it there turns a confusing
 *     "no pg_hba.conf entry" into a working connection.
 *
 * The failure hints exist because the raw node-postgres errors ("Connection
 * terminated unexpectedly") say nothing about what to do next.
 */

const HOSTED_TLS_SUFFIXES = [
  'neon.tech',
  'supabase.com',
  'supabase.co',
  'render.com',
  'railway.app',
  'fly.dev',
  'cockroachlabs.cloud',
  'azure.com',
  'amazonaws.com',
];

export interface NormalizedUrl {
  /** The URL to hand to the driver (empty means "use the embedded store"). */
  url: string;
  /** One line per adjustment, for `npm run doctor` to print. */
  notes: string[];
}

/** True when the string looks like a Postgres URL we should use. */
export function isPostgresUrl(raw: string): boolean {
  return /^postgres(ql)?:\/\//i.test(raw.trim());
}

export function normalizeDatabaseUrl(raw: string): NormalizedUrl {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (!isPostgresUrl(trimmed)) return { url: trimmed, notes: [] };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { url: trimmed, notes: ['the URL did not parse as a URL — check for a stray space or quote'] };
  }

  const notes: string[] = [];

  if (parsed.searchParams.has('channel_binding')) {
    parsed.searchParams.delete('channel_binding');
    notes.push('dropped channel_binding (node-postgres does not implement it; TLS + SCRAM still apply)');
  }

  const host = parsed.hostname.toLowerCase();
  const hosted = HOSTED_TLS_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!parsed.searchParams.has('sslmode') && (hosted || trimmed.includes('sslmode'))) {
    parsed.searchParams.set('sslmode', 'require');
    notes.push('added sslmode=require (hosted Postgres refuses plain connections)');
  }

  if (/[-.]pooler\./.test(host) && parsed.searchParams.get('pgbouncer') !== 'true') {
    notes.push('pooled host: good for a long-running API; use the direct host for migrations if they stall');
  }

  return { url: parsed.toString(), notes };
}

export interface ConnectionHint {
  code: string;
  message: string;
  fixes: string[];
}

const HINTS: Array<{ match: RegExp; hint: ConnectionHint }> = [
  {
    match: /ECONNREFUSED/i,
    hint: {
      code: 'ECONNREFUSED',
      message: 'nothing is listening on that host and port',
      fixes: [
        'Is the database running? For Docker: docker ps, then docker start railtrack-pg',
        'Some networks block outgoing port 5432 — try the pooled host or a mobile hotspot',
      ],
    },
  },
  {
    match: /ENOTFOUND|EAI_AGAIN/i,
    hint: {
      code: 'ENOTFOUND',
      message: 'the hostname does not resolve',
      fixes: [
        'Copy the whole host again: Neon hosts look like ep-name-12345678.c-2.region.aws.neon.tech',
        'A project that was deleted keeps its URL working — check the Neon dashboard',
      ],
    },
  },
  {
    match: /ECONNRESET|Connection terminated unexpectedly|ETIMEDOUT|timeout expired/i,
    hint: {
      code: 'ETIMEDOUT',
      message: 'the TCP connection opened but the handshake never completed',
      fixes: [
        'A firewall, antivirus or corporate proxy is dropping port 5432 — allow it, or use a hotspot',
        'A Neon project that has been idle wakes on the first query; retry once after a second',
        'Containers and CI runners often cannot reach 5432; run migrations from your machine instead',
      ],
    },
  },
  {
    match: /28P01|password authentication failed/i,
    hint: {
      code: '28P01',
      message: 'wrong user or password',
      fixes: [
        'Special characters in the password must be percent-encoded: @ becomes %40, # becomes %23',
        'In Neon press Connect again and copy the string; the password is only shown there',
      ],
    },
  },
  {
    match: /28000|no pg_hba\.conf entry/i,
    hint: {
      code: '28000',
      message: 'the server refused this client, usually because TLS is missing',
      fixes: ['Append ?sslmode=require to DATABASE_URL'],
    },
  },
  {
    match: /3D000|database .* does not exist/i,
    hint: {
      code: '3D000',
      message: 'that database name does not exist on the server',
      fixes: ['Neon calls its default database neondb; Supabase uses postgres'],
    },
  },
  {
    match: /self.signed certificate|certificate/i,
    hint: {
      code: 'CERT',
      message: 'the TLS certificate could not be verified',
      fixes: [
        'Keep ?sslmode=require and make sure the system clock is correct',
        'Behind a TLS-inspecting proxy, use ?sslmode=require&uselibpqcompat=true',
      ],
    },
  },
  {
    match: /password must be a string|Invalid URL|URI/i,
    hint: {
      code: 'URL',
      message: 'the connection string could not be parsed',
      fixes: ['It must start with postgres:// or postgresql:// and contain user:password@host/database'],
    },
  },
];

/** Turn a driver error into something a person can act on. */
export function describeConnectionFailure(error: unknown, url = ''): ConnectionHint {
  const text =
    error instanceof Error
      ? `${(error as NodeJS.ErrnoException).code ?? ''} ${error.message}`
      : String(error);
  for (const { match, hint } of HINTS) {
    if (match.test(text)) return hint;
  }
  return {
    code: 'UNKNOWN',
    message: text.trim() || 'the connection failed without a message',
    fixes: [
      /[-.]pooler\./.test(url)
        ? 'Try the direct (non-pooler) host for migrations'
        : 'Try the pooled host, or check the provider dashboard for the project status',
      'Run `npm run doctor` for the full picture',
    ],
  };
}

export interface DriverOptions {
  /** Connection string with the sslmode parameter removed. */
  url: string;
  /** Passed straight to the pg pool, or undefined to keep the driver default. */
  ssl?: { rejectUnauthorized: boolean };
}

/**
 * Map libpq's `sslmode` onto node-postgres' own `ssl` option.
 *
 * pg 8.13+ prints a long deprecation warning for `sslmode=require`, and its
 * current meaning ("verify the certificate") is exactly what we want, so we say
 * it directly instead of letting the user read a wall of warning text.
 */
export function driverOptions(raw: string): DriverOptions {
  const { url } = normalizeDatabaseUrl(raw);
  if (!isPostgresUrl(url)) return { url };
  const parsed = new URL(url);
  const mode = parsed.searchParams.get('sslmode');
  if (!mode) return { url };
  parsed.searchParams.delete('sslmode');
  return {
    url: parsed.toString(),
    ssl: { rejectUnauthorized: mode !== 'no-verify' && mode !== 'prefer' && mode !== 'disable' },
  };
}

/** One short, printable summary: `host/database` with the password removed. */
export function describeTarget(url: string): string {
  const trimmed = url.trim();
  if (!isPostgresUrl(trimmed)) return trimmed || 'embedded PGlite';
  try {
    const parsed = new URL(trimmed);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return trimmed.replace(/:[^:@/]+@/, ':***@');
  }
}
