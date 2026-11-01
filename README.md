# RailPulse India

Indian trains on a map, with honest labels for how old and how estimated the
data is. One corridor at a time (Delhi — Kanpur), recorded a few times a day,
built inside a budget of 100 provider requests a month.

This repository implements PRD v2 (`docs/PRD.md`): a Fastify API that reads only
our own database, a React PWA that reads only the API, and ingest jobs that are
the only code allowed to reach the provider — always through one budget guard.

```
RailRadar API  ←  budget guard (cache → ledger → daily allowance → reserve)
      ↑
ingest jobs (static load, scheduled snapshot, admin refresh)
      ↓  raw payload archived, then normalised
Postgres / PGlite  →  API (Fastify)  →  Web app (React + MapLibre)
```

## Quick start

```bash
npm install
cp .env.example .env          # optional: the defaults are fixtures mode
npm run db:setup              # migrate, seed reference data, ingest both fixtures
npm run doctor                # says what is configured, stored and missing
npm run dev                   # API on :3001, web on :5173
```

Open http://localhost:5173. Everything you see comes from saved fixtures and
spends no provider request (`PROVIDER_MODE=fixtures`).

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | API + web dev server together |
| `npm run db:setup` | migrate, seed and ingest the recorded snapshots |
| `npm run db:reset` | drop and recreate the schema |
| `npm run db:status` | counts and the latest snapshot per corridor |
| `npm run doctor` | setup check: `.env`, database, stored rows, provider ledger |
| `npm run tokens` | regenerate `apps/web/src/styles/tokens.css` |
| `npm run check` | type check, lint, boundaries, duplicate code, secret scan, tests |
| `npm test` | tests only (fixtures, in-memory database, no network) |
| `npm run build` | production build of the web app |

Going live with a real key and a managed database is a separate, step-by-step
guide: **[docs/SETUP.md](docs/SETUP.md)** (which database, where the key goes, how
to prove that everything fetched was saved).

The admin budget page lives at `/admin` and needs a token:

```bash
ADMIN_TOKEN=dev-admin-token npm run dev:api
# then open /admin and paste dev-admin-token
```

## What works today

- **Map home**: corridor line, train markers coloured by delay and labelled with
  the delay in words, floating search, filter chips, corridor selector, a sheet
  with counts computed from the chosen snapshot, and an as-of banner that says
  Estimated, Aged/Old or Stale.
- **Train detail**: delay card, reason card (Likely / Possible / Unknown with the
  evidence it used), forecast tiles, the timetable against last observed times,
  nearby trains ahead/behind/opposite within 50 km, and Share / Alert (disabled,
  "Coming later") buttons.
- **Search** on our own database, **replay** of recorded snapshots with play,
  speed and scrubber, a read-only **share page**, an **admin budget page** and an
  **about** screen with the required credits.
- **English and Hindi**, from one file per language, with a toggle.

## Request budget

The free plan allows 100 requests a month. With 20 held in reserve the daily
allowance is 2, so the scheduler plans two snapshots a day (09:30 and 18:30 IST).
Viewing the map costs nothing: the browser polls cached API endpoints, and the
API only reads Postgres.

- One live-map request covers every corridor in a snapshot.
- The cache is the archive: a recent stored payload is a free cache hit.
- The reserve is never spent, even by the admin refresh.
- When the budget runs out, read endpoints keep serving saved data with an old
  `asOf` and `budgetLimited: true` — the map never goes blank.

## Repository layout

```
apps/api/        Fastify: config.ts (only env reader), providers/guard.ts, modules/, jobs/
apps/web/        React + Vite + MapLibre: app/, features/, components/, lib/, i18n/, styles/
packages/
  shared/        zod schemas, constants, errors, budget + schedule maths
  domain/        pure functions: position, nearby, reasons, freshness, geo
  db/            migrations, repositories, corridor seed
  provider-railradar/  HTTP client, field mappers, fixtures provider
  ui-tokens/     colours, spacing, type; generates tokens.css
fixtures/railradar/    recorded provider payloads for dev, tests and demos
tools/           db CLI, fixture generator, secret scan
docs/            PRD.md, DECISIONS.md, API.md
```

Dependency direction is enforced in CI (`npm run boundaries`): the web app can
never import the database or the provider, `packages/domain` stays pure, and
`shared` and `ui-tokens` import nothing internal.

## Tests

`npm test` runs 84 tests and needs no network:

- domain unit tests (position, nearby, reasons, freshness, budget arithmetic),
- contract tests that parse every saved fixture with its shared schema,
- API tests over an in-memory Postgres seeded from fixtures,
- budget guard proofs (cache hits cost nothing, the cap is never exceeded, the
  reserve is untouchable, the ledger is written, months do not leak into each
  other),
- UI tests for the as-of banner, delay pill and reason card, page tests for train
  detail and the map screen.

## Layout

Phone first, and a real desktop layout from 1024 px: the tab bar moves to the
top, the map keeps the left two thirds and the bottom sheet becomes a fixed
panel on the right; train detail and search use two columns.

## Going live

Raise the provider questions in `docs/DECISIONS.md` first (spikes S1 to S8), then:

```bash
PROVIDER_MODE=live
RAILRADAR_API_KEY=...        # server side only, rule N1
DATABASE_URL=postgres://...  # managed Postgres; omit for embedded
ADMIN_TOKEN=<long random>
```

`npm run check` and a green CI run are the definition of done for every phase.

## Credits

Train data from RailRadar. Map tiles and data © OpenStreetMap contributors.
RailPulse is not affiliated with Indian Railways, and estimates must not be used
for safety decisions.
