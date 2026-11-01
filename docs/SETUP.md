# Setup guide

Three things need deciding before you see live trains on screen:

1. a **database** (or none, for a quick start),
2. **where your RailRadar key goes** (never in git),
3. **which trains to spend requests on**.

Then one command fills the database from the provider, and one shows you the
proof that everything fetched was saved.

---

## 0. First: is anything configured?

```bash
npm install
cp .env.example .env      # then edit .env
npm run doctor
```

`npm run doctor` prints, in order: whether `.env` was found, node version,
provider mode, whether the key is set (masked — it never prints the key), the
admin token length, the database target, what is already stored, and the
provider ledger. At the end it prints the next command to run.

---

## 1. Which database?

You have three options. All three run **the same SQL and the same migrations**;
only `DATABASE_URL` changes.

| Option | `DATABASE_URL` | Good for | Cost |
| --- | --- | --- | --- |
| **Embedded (default)** | *(leave empty)* | first run, a demo, CI | free |
| **Neon** (managed Postgres) | `postgres://…@ep-….neon.tech/neondb?sslmode=require` | the deployed API, the scheduler | free tier |
| **Supabase** (managed Postgres) | `postgres://postgres.…:…@aws-0-….pooler.supabase.com:6543/postgres` | same, if you already use Supabase | free tier |
| Local Postgres (Docker) | `postgres://railtrack:railtrack@localhost:5432/railtrack` | working offline with a real server | free |

### Option A — nothing to sign up for (start here)

Leave `DATABASE_URL=` empty. The app uses **PGlite**, Postgres compiled to
WebAssembly, storing its files in `.data/pglite` (gitignored). That is a real
Postgres engine, not a fake — same SQL, same constraints, same `JSONB`.

```bash
npm run db:setup
npm run dev
```

Good for: getting the app on screen in two minutes, and for CI. Not good for a
deployed server: the data lives on that one machine's disk.

### Option B — Neon (recommended free managed Postgres)

Why Neon: the free tier never expires, it needs no credit card, it autosuspends
when idle and wakes on the first query, and it gives you a connection string
with `?sslmode=require` already in it.

1. Go to **https://neon.com** and sign up with GitHub.
2. **Create project**: name `railtrack`, Postgres 16+, region
   `AWS ap-southeast-1 (Singapore)` (lowest latency from India).
3. On the dashboard press **Connect**. Neon shows **two** strings:

   | | host | use it for |
   | --- | --- | --- |
   | **Pooled** | `ep-xxx-pooler.c-2.ap-southeast-1.aws.neon.tech` | the API, the scheduler |
   | Direct | `ep-xxx.c-2.ap-southeast-1.aws.neon.tech` | migrations, `psql`, `pg_dump` |

   They look like this (the password is only shown here — copy it now):

   ```
   postgresql://neondb_owner:npg_XXXXXXXX@ep-xxx-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

4. Paste the **pooled** one into `.env`:

   ```env
   DATABASE_URL="postgresql://neondb_owner:npg_XXXX@ep-xxx-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
   ```

   Three details that decide whether it works:

   - **Keep the quotes.** The URL contains `&`, which a shell would otherwise
     split into a background command.
   - **`channel_binding=require` is fine.** It is a `psql` option;
     node-postgres does not implement channel binding, so it is dropped for you
     (with a note in `npm run doctor`). TLS and SCRAM authentication still apply.
   - **`DATABASE_URL_POOLED` works too.** Past the string under that name and
     the app picks it up when `DATABASE_URL` is blank.

5. Create the tables and check:

   ```bash
   npm run db:migrate     # 13 tables + schema_migrations
   npm run db:seed        # reference data from the saved fixtures, no requests
   npm run doctor         # target, row counts, ledger
   ```

   If a migration stalls through the pooler, run `npm run db:migrate` once with
   the **direct** host in `DATABASE_URL`, then put the pooled one back.

**`28P01` — "the server rejected that user and password".** In order:

1. **You rotated the password.** Neon → Connect again and copy a fresh string;
   the old one stops working the moment the role's password changes. The same
   applies if you reset it because it appeared in a screenshot.
2. **The string arrived mangled.** Chat apps and wiki pages escape `&` as
   `&amp;` and wrap URLs as `[user:pass@host](mailto:…)`. `&amp;` is decoded for
   you; a `mailto:` wrapper cannot be, so copy the plain string again. Paste
   only what is inside the quotes on the Neon panel.
3. **A special character in the password.** `@` → `%40`, `#` → `%23`,
   `:` → `%3A`, `/` → `%2F`.
4. **Wrong user for the host.** Supabase's pooler wants
   `postgres.<project-ref>`, not `postgres`; Neon's user is `neondb_owner` (or
   whatever the project was created with).

`npm run doctor` prints the user and the **password length**, never the
password — so a truncated paste (12 characters where the dashboard shows 28) is
visible without anyone printing the secret.

**"Connection terminated unexpectedly" / ETIMEDOUT?** The TCP connection opens
and the TLS handshake never finishes. In order of likelihood:

1. A firewall, antivirus or corporate proxy blocks outgoing **port 5432**.
   Mobile hotspot or a different network usually proves it. Managed hosts only
   listen on 5432; there is no HTTPS fallback for node-postgres.
2. Containers, CI runners and some sandboxes have the same block. Run the
   migration from your own machine, not from inside the container.
3. A suspended project wakes on the first query — retry once after a second.

`npm run doctor` names the cause it recognises and what to try, instead of
printing the driver's stack trace.

**Backups.** `provider_calls` is the valuable table (raw payloads). Weekly:

```bash
pg_dump "$DATABASE_URL" -t provider_calls -f ledger-$(date +%F).sql
```

### Option C — Supabase

1. **https://supabase.com** → sign up with GitHub → **New project**.
2. Choose a region near India, set a database password, wait ~2 minutes.
3. **Project settings → Database → Connection string → URI**, and copy it. Use
   the **Session pooler** string on port `5432` and replace `[YOUR-PASSWORD]`
   with the password you set:

   ```
   postgresql://postgres.abcdefghijklmnop:YOUR-PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```

4. Put it in `.env` as `DATABASE_URL=`, then `npm run db:migrate`.

If the connection hangs, append `?sslmode=require` (or `?sslmode=no-verify` if
your network inspects TLS).

### Option D — local Postgres in Docker

```bash
docker run -d --name railtrack-pg \
  -e POSTGRES_USER=railtrack -e POSTGRES_PASSWORD=railtrack -e POSTGRES_DB=railtrack \
  -p 5432:5432 postgres:16
# .env
DATABASE_URL=postgres://railtrack:railtrack@localhost:5432/railtrack
```

---

## 2. Where the RailRadar key goes

**Only** in `.env` on the machine that runs the API (rule N1). `.env` and
`.env.local` are gitignored; `npm run secrets` fails CI if a key-shaped string
is ever committed, and the guard redacts the `Authorization` header from logs.

```env
RAILRADAR_API_KEY=rr_your_key_here
RAILRADAR_BASE_URL=https://api.railradar.in
PROVIDER_MODE=live
```

- The browser never sees it: the web app calls `/api/v1/...` on our own API.
- If you deploy, set these as environment variables on the host (Render,
  Railway, Fly.io) — never in a committed file.
- `PROVIDER_MODE=live` refuses to start without a key, so you cannot half-configure it.
- **Rotate the key if it has ever been pasted into a chat, a screenshot or a
  commit.** Treat the one in your screenshot as burned.

---

## 3. Which trains to spend requests on

100 requests a month is about 3 a day. The plan in `docs/DECISIONS.md` (D-005)
spends:

| Purpose | Requests | Frequency |
| --- | --- | --- |
| `listStations` + `listTrains` | 2 | once, cached 30 days |
| train details for the corridor | 1 per train, capped | once, then a day of cache |
| live snapshots | 1 per snapshot | twice a day (09:30, 18:30 IST) |
| reserve | 20 | never spent |

So the static load is the expensive part, and there are two ways to bound it:

```env
# 1. Pin the trains you care about (recommended, predictable)
CORRIDOR_TRAINS=12301,12302,12004,12055,12559
MAX_TRAIN_DETAILS=12

# 2. Or leave CORRIDOR_TRAINS empty and let it discover them:
#    one station board per corridor station, then details for trains that stop
#    at two or more of them — still capped by MAX_TRAIN_DETAILS.
```

---

## 4. Fill the database from the provider

```bash
npm run ingest:static       # stations, trains, timetables  (~2 + N requests)
npm run ingest:snapshot     # one live-map snapshot now     (1 request)
npm run db:status           # what is stored, and what the ledger recorded
npm run doctor              # the same, plus configuration checks
```

`npm run ingest:snapshot` stores observations **and** computes the reason cards
for trains whose previous snapshot is within 30 minutes.

With `PROVIDER_MODE=live` and `SCHEDULER_ENABLED=true`, the API's own scheduler
takes the two planned snapshots a day and nothing else. The admin button
`POST /api/v1/admin/snapshot` does exactly the same thing on demand, through the
same guard.

---

## 5. Prove that everything fetched is saved

Every provider call writes its **raw payload** into `provider_calls` — the
ledger is also the archive (section 10), so nothing the provider returned is
lost, and old data can be reprocessed without spending another request.

```bash
npm run db:status
```

```
provider ledger (every call keeps its raw payload)
  calls all time: 16 (16 with a saved payload, 0 failed)
  cost this month (2026-11): 14 | used 14/30d window
  last call: 2026-11-01T13:02:11.000Z
  methods seen: getLiveMap, getTrainDetails, listStations, listTrains
```

Three ways to look at the same thing:

1. **The admin page** → `http://localhost:5173/admin` (needs `ADMIN_TOKEN`):
   used, left, today's allowance, next planned snapshot, the last 20 calls.
2. **SQL**, if you want the payload itself:
   ```sql
   SELECT id, method, params, http_status, created_at,
          payload -> 'data' -> 'trains' -> 0 AS first_train
   FROM provider_calls
   ORDER BY created_at DESC
   LIMIT 5;
   ```
3. **Mapped rows**: `snapshots`, `train_observations`, `stop_observations`,
   `reason_results` (counts in `npm run db:status`).

A failed call also keeps its row (with `error` set), because the quota was spent
either way — the ledger must not under-report.

Want the raw payloads as code you can replay later? Save files from the ledger:

```bash
# inside psql, one call per file
\copy (SELECT payload FROM provider_calls WHERE method='getLiveMap' ORDER BY created_at) TO 'live-map.json'
```

The fixtures in `fixtures/railradar/` are exactly this shape; drop recorded
payloads there and fixtures mode will replay them for free.

---

## 6. Verify the whole build

```bash
npm run check     # typecheck, lint, boundaries, duplicate code, secret scan, tests
npm run build     # production web build
```

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Admin routes are disabled. Set ADMIN_TOKEN.` | `.env` has no `ADMIN_TOKEN`. Generate one: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |
| `PROVIDER_MODE=live needs RAILRADAR_API_KEY` | key missing in `.env`, or `.env` is not in the repository root |
| `relation "provider_calls" does not exist` | `npm run db:migrate` has not run against this database |
| `password authentication failed` | special characters in the password need URL-encoding (`@` → `%40`) |
| `Connection terminated unexpectedly` (Neon/Supabase) | Port 5432 blocked by a firewall or proxy — see the note in the Neon section; run migrations outside containers |
| `timeout expired` connecting to Neon/Supabase | IPv6-only network: use the pooled host, or add `?sslmode=require` |
| `channel_binding` looks unsupported | It is: it is a psql option and is dropped automatically. Keep it or delete it, same result |
| Map is blank but the list works | WebGL 2 is unavailable — the map now says so and explains the fix |
| White page and `Uncaught SyntaxError: … does not provide an export named 'default'` | A stale Vite dependency cache. `rm -rf apps/web/node_modules/.vite` (or `rm -rf node_modules/.vite`) and reload. The app no longer goes blank when this happens: the map library is loaded lazily, so the rest of the screen still renders |
| `EADDRINUSE` on 3001/5173 | `lsof -ti:3001 \| xargs kill` |
| Two processes on one `.data/pglite` | stop the other process, or `rm -rf .data && npm run db:setup` |

---

## What to do after setup

1. Run the spikes in `docs/DECISIONS.md` (S1–S8) against the live key and write
   the answers there — they decide field names, the base URL, and whether
   snapshots may be stored at all (S5).
2. Replace `fixtures/railradar/*.json` with real recordings; the contract tests
   in `packages/shared/src/schemas/fixtures.test.ts` will fail loudly if the
   provider's shape differs from what the mappers expect.
3. When the numbers look right, deploy: the API plus scheduler on one small host,
   the web app as static files, `DATABASE_URL` pointing at Neon or Supabase.
