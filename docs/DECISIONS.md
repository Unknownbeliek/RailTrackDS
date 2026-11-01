# Decisions

Every deliberate change against PRD v2 is recorded here (section 19.1). Rules
N1 to N8 are intact in all of them.

Template:

```
## D-0xx Short title
Date: 2026-11-01
Context: what problem forced a decision
Decision: what we chose
Alternatives: what we rejected and why
Consequences: what changes in code, schema or PRD sections
```

---

## D-001 Keep one response envelope with mandatory meta
Date: 2026-11-01

**Context:** Rule N4 says every data response carries `asOf`, `source` and
`isEstimated`, and the UI shows them. A rule that is only prose drifts.

**Decision:** `metaSchema` in `packages/shared/src/schemas/api.ts` is the only
envelope, and every route parses its payload with a zod schema before it is
sent. `freshness` is computed once in `packages/domain` and also travels in
`meta`, so the web app cannot compute "old" differently from the API.

**Alternatives:** letting each route build its own meta object — rejected, it
is how one endpoint quietly loses `isEstimated`.

**Consequences:** adding an endpoint means adding a schema; the tests fail if a
route forgets the envelope.

---

## D-002 All spending goes through a proxy, not through discipline
Date: 2026-11-01

**Context:** Rule N2 needs one place that checks the cache and the monthly
ledger before any provider call.

**Decision:** `guarded(provider, deps)` in `apps/api/src/providers/guard.ts`
wraps the provider object. Every method is intercepted, so no job can call the
provider package directly even by accident. Order: cache, then ledger, then
daily allowance, then reserve.

**Alternatives:** a `spend()` helper that each job is trusted to call — the PRD
itself calls that "the only spender" in a comment, and a proxy enforces it.

**Consequences:** the guard needs a `Sql` handle and a clock; both are injected,
which is what makes `guard.test.ts` able to prove the cap with an in-memory
database.

---

## D-003 Postgres SQL that also runs on embedded PGlite
Date: 2026-11-01

**Context:** Section 15 asks for managed Postgres. A solo builder running
`npm install && npm run db:setup` on a laptop, or CI on a fresh runner, should
not need a signup, and the repository must stay reproducible.

**Decision:** `packages/db/src/sql.ts` exposes one `Sql` interface with two
adapters: `pg` when `DATABASE_URL` starts with `postgres`, and `@electric-sql/pglite`
(Postgres compiled to WASM) otherwise, storing files in `.data/pglite`. The SQL
in the migrations and repositories is plain Postgres and identical on both.

**Alternatives:** SQLite — rejected, it cannot run the Postgres DDL, `JSONB` or
`TIMESTAMPTZ` semantics the schema depends on. Docker Postgres in CI — rejected,
more moving parts than the product needs today.

**Consequences:** no Postgres-specific extensions (no PostGIS, which is Phase 3
anyway). A production deploy sets `DATABASE_URL` and changes nothing else.

---

## D-004 Corridor coordinates come from the timetable until spike S8
Date: 2026-11-01

**Context:** The provider's station lookup returns codes and names only (section
10 notes; spike S8). The map cannot place stations without coordinates.

**Decision:** `packages/db/src/seed/corridor.ts` carries `lat`/`lng` for the six
corridor stations, written with `coord_source = 'timetable'` so the origin is
auditable in the row itself. `setStationCoords` only fills columns that are
still null, so real coordinates from the live map or an open dataset take
precedence later without a migration.

**Alternatives:** blocking the map on S8 — rejected, the corridor is six known
junctions. Inventing coordinates per train — rejected, one source per fact.

**Consequences:** six hand-checked points per new corridor; the `coord_source`
column records where each one came from.

---

## D-005 Two planned snapshots a day, and the allowance measured from today
Date: 2026-11-01

**Context:** 100 requests a month with a 20-request reserve leaves 80 requests
over roughly 30 days: a daily allowance of 2. Section 7.5 also says the daily
allowance is `(remaining - reserve) / days left`.

**Decision:** `SNAPSHOT_PLAN_IST = ['09:30', '18:30']`. The scheduler fires only
in a five-minute window at those times, only if that slot has no snapshot, and
only if the guard allows it. `todayAllowance()` measures the day's share from
`remaining + usedToday`, so spending during the day cannot shrink its own
allowance (a ratchet that halved the usable budget in tests).

**Alternatives:** polling every two minutes (v1.1) — 21,600 requests a month;
four slots a day — 120 requests, over the cap.

**Consequences:** a corridor snapshot is a recording of two moments a day, which
is why replay, interpolation and the as-of banner matter so much.

---

## D-006 Field names are assumptions until spikes S1 and S3 run
Date: 2026-11-01

**Context:** The provider's free plan, exact paths and the meaning of
minutes-since-departure are unconfirmed (S1, S6). The build must not stall, and
the code must not lie about what it knows.

**Decision:** `packages/shared/src/schemas/provider.ts` describes the payloads we
expect, `packages/provider-railradar/src/mappers.ts` is the only place that maps
field names, and every saved fixture is parsed by those schemas in a contract
test. Segment length is read as `minutesSinceDeparture + minutesToNextStation`.

**Alternatives:** hard-coding field names in jobs and services — then a provider
rename breaks ten files instead of one mapper.

**Consequences:** one file to edit after the spikes, and fixtures must be
re-recorded; the contract test fails loudly if a shape changes.

---

## D-007 Markers are only extrapolated while the snapshot is Recent
Date: 2026-11-01

**Context:** Section 12 asks the browser to call `estimatePosition` about once a
second so markers glide. With two snapshots a day, "now" can be hours past the
data, and the function then correctly clamps every train to its next station and
marks it Stale. On a real screen that reads as "every train is at a station",
which is worse than showing the recording honestly.

**Decision:** `apps/web/src/lib/positions.ts` decides the viewing instant: `now`
while `meta.freshness === 'recent'`, otherwise `meta.asOf` (the recording). The
markers then sit exactly where the snapshot left them, the banner shows the age
and the stale note appears. Replay always uses its own simulated clock.

**Alternatives:** always extrapolating — visually wrong and quietly dishonest;
never extrapolating — the map never feels live during the minutes it can.

**Consequences:** the "live" feel exists only when the data is under 15 minutes
old, which is the honest definition. Documented in the PRD changes table.

---

## D-008 A small service worker instead of vite-plugin-pwa
Date: 2026-11-01

**Context:** Section 12 asks for an installable app that caches the shell and
the last map response.

**Decision:** `apps/web/public/sw.js` caches the shell cache-first and API reads
network-first with a cached fallback; `manifest.webmanifest` and `offline.html`
complete the install. No build plugin.

**Alternatives:** `vite-plugin-pwa` — a large dependency and a generated worker
for the same three behaviours.

**Consequences:** cache invalidation is manual (`CACHE = 'railpulse-v1'`); it is
registered only in production builds so development is never stale.

---

## D-009 The ledger is the cache
Date: 2026-11-01

**Context:** Section 7.5 wants a per-method cache; section 10 wants the raw
payload of every provider call archived so old data can be reprocessed.

**Decision:** `findCachedPayload(method, paramsHash, since)` selects a recent
`provider_calls` row whose payload is stored. There is no second cache table and
no Redis, so what is cached is exactly what was archived, with its cost and time.

**Alternatives:** an in-memory LRU — lost on restart and invisible on the admin
page; Redis — v1.1 infrastructure the PRD dropped.

**Consequences:** a cache hit is a single indexed read; the same query serves the
archive and the cache; payload size grows with call count, which the cap bounds.

---

## D-010 Playwright smoke is not wired in this environment
Date: 2026-11-01

**Context:** Section 14 asks for a Playwright smoke on three flows.

**Decision:** the flows are covered by fastify route tests and Testing Library
page tests, and CI runs those. Playwright is listed in the PRD changes table as
outstanding rather than pretended.

**Alternatives:** adding a Playwright job that cannot download a browser here
would make CI red for an environmental reason.

**Consequences:** add `npx playwright install --with-deps chromium` and a smoke
spec in `.github/workflows/ci.yml` when the browser is available.

---

## D-011 Fixtures mode reads files without the guard
Date: 2026-11-01

**Context:** Rule N2 says every provider call passes the guard. In fixtures mode
there is no HTTP call, and the guard's five-minute live-map cache meant two
recorded snapshots 30 minutes apart collapsed into one ingest.

**Decision:** `ProviderBundle` (apps/api/src/providers/index.ts) exposes `provider`
(the guarded one) and `ingest`. In live mode they are the same object; in
fixtures mode `ingest` is the file reader. Jobs take whatever is passed as
`TrainDataProvider`.

**Alternatives:** a cache-bypass flag on the guard — that is a hole in the one
place rule N2 depends on.

**Consequences:** in fixtures mode the admin budget page shows zero spend, which
is the truth: reading a saved file spends nothing.

---

## D-012 tsx instead of a second build step
Date: 2026-11-01

**Context:** The API, jobs and CLI tools import TypeScript sources across
workspace packages via path aliases.

**Decision:** run them with `tsx` in development and on the small host; the web
app is the only thing that is bundled (Vite). `tsc --noEmit` in CI is the type
gate.

**Alternatives:** per-package build outputs and a `tsc -b` project graph — more
moving parts for a repository this size, and source maps across five packages.

**Consequences:** one `tsx` dependency at the root; deploying means running the
same command with `NODE_ENV=production`.

---

## Still open (spikes, owner: you)

| ID | Question | Where it lands |
| --- | --- | --- |
| S1 | Is live map on the free plan, what are the exact paths, what do the minute fields mean? | `packages/provider-railradar/src/mappers.ts`, `segmentMinutesFromLive` |
| S2 | Does the monthly limit reset monthly, and do failed or cached calls count? | `apps/api/src/providers/guard.ts` |
| S3 | Does journey overlay take many pairs per call? | history ingest job (not built) |
| S4 | How old is live data compared to real time? | `FRESH_RECENT_MS`, `STALE_SNAPSHOT_MS` |
| S5 | Do the terms allow storing and redisplaying responses? | snapshots, replay (built, gated on S5) |
| S6 | Which base URL is current? | `RAILRADAR_BASE_URL` |
| S7 | Do the free tiles allow our usage? | `apps/web/src/lib/map/style.ts` |
| S8 | Where do station coordinates come from? | `seed/corridor.ts`, `setStationCoords` |

---

## D-013 `.env` is read by `config.ts`, and nothing else
Date: 2026-11-01

**Context:** The first build only read `process.env`, so a key pasted into `.env`
was silently ignored and the app stayed in fixtures mode — the most confusing
possible failure, because everything appears to work.

**Decision:** `apps/api/src/config.ts` loads `.env.local` then `.env` with
`dotenv` (`override: false`, so a shell export always wins) before reading any
variable. `tools/db.ts` calls the same `loadEnvFile()`. `.env.example` documents
every variable with an example value, and `npm run doctor` reports what was
loaded without ever printing the key.

**Alternatives:** `node --env-file` — Node 20+ only and not available to `tsx`
child processes consistently; per-package dotenv — five readers of the same file.

**Consequences:** rule N1 still holds (one reader, server side only). A wrong
`.env` now produces a clear message instead of a quiet fixtures-mode fallback.

---

## D-014 Bounded static load: explicit trains, or boards-based discovery
Date: 2026-11-01

**Context:** `loadReference` fetched train details for *every* train returned by
`listTrains`. In live mode that is thousands of requests against a monthly cap
of 100: the first live run would have burned the quota and the account.

**Decision:** the static load now takes `CORRIDOR_TRAINS` when set. Otherwise it
either (a) reads one station board per corridor station and keeps trains that
appear at two or more of them, or (b) in fixtures mode reads every recorded
train, which is free. Either way it never exceeds `MAX_TRAIN_DETAILS` (default
12) and logs how many it skipped. Corridor membership is still derived from the
saved timetables.

**Alternatives:** fetching everything and hoping — rejected, it is the exact
mistake rule N2 exists to prevent; hard-coding train numbers — rejected, that is
code, and corridors are data.

**Consequences:** a live static load costs about 2 + 6 + N requests where N ≤ 12,
and the admin budget page shows it before a snapshot is ever taken.

---

## D-015 The map degrades with words, not a blank canvas
Date: 2026-11-01

**Context:** MapLibre GL needs WebGL 2. On a VM, a remote session, or a machine
with GPU acceleration switched off, `new maplibregl.Map()` throws and the canvas
stayed empty — the map area looked broken while the data behind it was fine.

**Decision:** `MapView` probes for WebGL 2, wraps construction in `try/catch`,
listens for WebGL errors, and renders an explanatory panel with a retry button
when it cannot start. A style or tile failure that is not fatal gets a small
note ("tiles are not loading; trains are listed below"). The local layers — the
corridor line, station labels, train markers — are drawn from our own data and
keep working without tiles.

**Alternatives:** a static image fallback — more work, and it would not let a
user with a transient driver problem retry; silently drawing nothing — the bug
this decision fixes.

**Consequences:** the failure is testable (jsdom has no WebGL, so the fallback
test runs the real code path) and the product never shows an unexplained blank.

---

## D-016 One layout, two shapes: phone map-first, desktop map plus panel
Date: 2026-11-01

**Context:** The first build was a phone layout stretched across a desktop
window: a narrow sheet pinned to the bottom, one column of content, a tab bar
across 1900 px.

**Decision:** from 1024 px the tab bar becomes a top navigation, the map keeps
the flexible left area and the sheet becomes a fixed 420 px panel on the right
(460 px from 1440 px). Train detail lays out as card + timetable on the left and
reason + nearby on the right; search results show trains and stations side by
side; the replay control bar centres over the map. Everything below 1024 px is
unchanged, so the phone experience is identical to before.

**Alternatives:** a separate desktop app — wasted effort for the same data;
stretching the phone layout — what was there.

**Consequences:** CSS only (`apps/web/src/styles/global.css`), no component
forks, so both shapes cannot drift apart.

---

## D-017 Connection strings are normalised, and failures are explained
Date: 2026-11-01

**Context:** Pointing the app at a real Neon instance produced two things a
person cannot act on: a long `sslmode` deprecation warning from node-postgres,
and `Connection terminated unexpectedly` with no mention of what to check. Neon
also hands out a string containing `channel_binding=require`, an option
node-postgres does not implement.

**Decision:** `packages/db/src/connection.ts` owns connection strings.

- `normalizeDatabaseUrl` strips quotes, drops `channel_binding`, and adds
  `sslmode=require` when the host is a known hosted provider and the parameter
  is missing. It returns notes, which `npm run doctor` prints.
- `driverOptions` maps `sslmode` onto pg's own `ssl` option (so no deprecation
  wall) with `rejectUnauthorized` true except for an explicit `no-verify`.
- `describeConnectionFailure` turns driver errors into a code, a sentence, and
  two or three concrete fixes. `tools/db.ts` and `doctor` both use it.
- `DATABASE_URL_POOLED` is accepted when `DATABASE_URL` is blank, because that
  is the name of the second string every dashboard shows.
- `pool.on('error')` is handled, so a Neon idle-timeout cannot take the API down.

**Alternatives:** telling users to edit the URL by hand — two of the three
adjustments are invisible, so they would not know to do it; `uselibpqcompat=true`
— it would silence the warning by choosing the weaker libpq semantics.

**Consequences:** tests cover every adjustment and error mapping without any
network access. A blocked port 5432 is now a named diagnosis rather than a
stack trace.
