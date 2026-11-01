# RailPulse India — PRD v2

This is the product document this repository is built from. It is kept here so
the PRD and the code never disagree (section 19.1, item 4). The only edits to
the original text are the removal of page footers and the "Built in this
repository" notes collected at the end.

Source: `RailTrackPRD v2 (full).pdf`, Nov 1 2026, @Raj.

---

RailPulse India PRD v2 (full)
Nov 1, 2026  ·  @Raj
RailPulse shows Indian trains on a map and explains delays. It is built one rail corridor at a
time on a budget of 100 provider requests a month. This version replaces v1.1 (the
previous tab) after a cross-check against the real RailRadar limits.
1. Read this first
Purpose of this document: one source of truth that a human or an AI coding assistant can
build from, section by section. The build order is in section 16 and ready-made AI prompts
are in section 19.
Non-negotiable rules. Everything else in this PRD may be changed by the builder or the AI
(see section 19). These eight may not.
ID Rule Why
N1 The API key lives only in the backend
environment. Never in browser code, git
or logs.
A leaked key burns the monthly quota
and the account.
N2 Every provider call goes through one
budget guard that checks the cache and
the monthly ledger first.
100 requests a month leaves no room for
accidents.
N3 No duplicated logic. Each rule, type,
constant, token and query has exactly
one home (section 9).
Duplicates drift apart and cause bugs.
N4 Every data response carries asOf, source
and isEstimated, and the UI shows them.
Users must know how old and how exact
the data is.
N5 Only the licensed provider API is used.
No scraping of NTES or other sites.
Legal and reliability risk.
N6 Development and tests run on saved
fixtures. Tests never call the live
provider.
Tests would eat the request budget.
2. Cross-check: what changed from v1.1
Each row is a place where the earlier plan did not survive contact with the real data limits.
ID Rule Why
N7 Database changes happen only through
migration files.
Reproducible setup on any machine.
N8 Anything that costs money or provider
requests needs a human's approval.
The budget is tiny.
Area v1.1 said v2 decision Reason
Live data volume Poll all trains every 2
minutes
Record scheduled
snapshots of one
corridor, then replay
and interpolate
between them
100 requests a month
is about 3 a day
Real-time
delivery
WebSocket plus
Redis
Plain REST, Postgres
cache, client polling of
cached endpoints
There is no live
stream to push
Alerts and push P0 feature Moved to Phase 3 Change detection
needs frequent
polling
Accounts Phone OTP login in
MVP
No accounts.
Anonymous share
codes only
Less code and less
privacy risk
Train position NTES plus GPS fusion Interpolation between
stations from the last
snapshot, labelled
Estimated. GPS later
No GPS users yet
Spatial database PostGIS required Plain latitude and
longitude columns.
PostGIS optional from
Phase 3
A corridor has
dozens of stations,
not millions of points
Area v1.1 said v2 decision Reason
Delay reasons ML plus rules with
confidence
percentages
Deterministic rules
with labels Likely,
Possible or Unknown.
No percentages
No labelled data
exists
Reasons with
sparse data
Always shown Shown only when two
snapshots are close
enough in time,
otherwise a clear Not
enough fresh data
message
Stoppages cannot be
detected from 3
snapshots a day
Map provider Mapbox MapLibre GL with free
tiles
Cost
Mobile Kotlin Android, then
iOS
Installable web app
(PWA) first, React
Native later
One codebase for a
solo builder
Scope All India, 12,000 trains One corridor at a time,
configured in the
database
Budget and focus
Data sources NTES scraping,
RailDrishti
RailRadar API only.
Others need a spike
Rule N5 and
unverified claims
Infrastructure AWS EKS, Kafka,
Timescale,
OpenSearch
One small host plus
managed Postgres
Scale was imaginary
Success metrics 500K monthly users,
ETA within 10 minutes
for 80%
Beta targets in section
18
Not measurable with
this data
Mockup
numbers
India-wide counts
such as 12,847 trains
Counts computed
from the chosen
snapshot, shown with
its time
The old figures were
invented
Terms of use Not considered Spike S5: confirm that
storing and showing
provider data is
allowed
Snapshots and
replay depend on it
3. Data reality and request budget
The only data source is the RailRadar API. Its docs describe a free sandbox tier of 100
requests a month and a 429 error when the quota is exceeded. Auth is a Bearer key in the
Authorization header. Every response uses one envelope: success, data and meta.
3.1 Endpoints we plan to use
Endpoint (RailRadar
docs name)
Used for Requests Notes
Stations lookup
(compressed)
All station codes and
names, loaded once
1 Static data
Trains lookup
(compressed)
All train numbers and
names, loaded once
1 Static data
Train details Route, timetable, coach
layout and live delay per
stop for one train
1 per train Static part saved for
good, live part saved as an
observation
Live map Current and next station,
coordinates and minutes
since departure for
running trains
1 per
snapshot
Free-plan access and
exact path unconfirmed
(spike S1)
Live station board Trains around one station
with delay and platform
1 per
station
Backup if live map is not
on the free plan
Journey overlay Historical average delay
and cancel rate per train
and station
Unknown Spike S3
Train search and
filter
Not needed 0 Search runs on our own
database
3.2 Monthly budget
The budget lives in one config object and in the database ledger (section 9), not in
anyone's head. Policy: never spend the reserve, and never spend more in one day than the
remaining requests divided by the remaining days.
3.3 Spikes to run in Phase 0, before any feature work
Use Requests
Test each endpoint once and save the raw JSON as
fixtures
10
Station and train lists 2
Train details for about 12 corridor trains 12
Station boards (three stations, twice) 6
Live snapshots at different times of day 50
Safety reserve 20
ID Question What it decides
S1 Is live map on the free plan, what is its
exact path, and what do the minutes-
since-departure and next-arrival fields
mean?
Whether position interpolation (7.2)
works as designed
S2 Does the limit reset monthly, and do
failed or cached calls count?
Budget guard rules
S3 Does journey overlay take many train and
station pairs in one call?
Cost of the history feature
S4 How old is the live data compared with
real time?
Stale-data labels and thresholds
S5 Do the provider terms allow storing and
redisplaying responses, and is attribution
required?
Whether snapshots and replay are
allowed (section 13)
If S5 fails, the fallback is short-lived caching only. Replay is dropped and everything else
stays.
4. Scope and phases
ID Question What it decides
S6 Which base URL is current? Docs
examples use api.railradar.in, while one
open-source project uses api.railradar.org
Provider config
S7 Do the free map tiles allow our expected
usage?
Map hosting
S8 Where do station coordinates come from,
since the lookup endpoints return only
codes and names?
Whether the map can place stations
(section 10)
Phase Weeks Outcome Provider requests
0 Spike 1 Fixtures saved, spikes S1 to
S8 answered, repo scaffold
About 10
1 Corridor
MVP
2 to 5 One corridor: map with
estimated positions, search,
train detail, share link
About 14 static plus
first snapshots
2 Intelligence 6 to 9 Nearby trains, replay mode,
history overlay, reason rules
when data is fresh, Hindi
Snapshots
3 Live After funding or
a paid plan
Scheduled polling, alerts,
more corridors, optional
PostGIS, GPS opt-in
Paid plan
4 Native and
API
Later React Native app, public API Paid plan
ID Feature Phase Provider cost at view time
F1 Corridor map 1 0
Design rule behind the zeros: users never trigger provider calls. Only scheduled ingest
jobs and a protected admin refresh do.
5. Functional requirements
F1 Corridor map
Full-screen map showing the corridor's stations in order and every train from the chosen
snapshot at its estimated position.
Marker colour follows delay (on time, slight, major) and the delay is also written as text.
A banner shows the snapshot time and the word Estimated.
Tapping a marker opens the train detail sheet.
Loads in under 3 seconds on 4G from the cache, with zero provider calls.
F2 Corridor selector
A chip row lists the active corridors. Adding Delhi to Patna later is a data change in the
database, not a code change.
ID Feature Phase Provider cost at view time
F2 Corridor selector 1 0
F3 Search 1 0
F4 Train detail 1 0
F5 Share link 1 0
F6 Nearby trains 2 0
F7 Replay 2 0
F8 History overlay 2 0
F9 Delay reason card 2 0
F10 Hindi and English 2 0
F11 Admin budget page 1 0
F12 Alerts 3 Many
F3 Search
Search by train number, train name or station name against the local database. Results
appear as the user types and cost no provider requests.
F4 Train detail
Shows delay, current and next station, speed band, the station list with scheduled time
against last observed time, and the as-of time. A train that is not in the latest snapshot
shows Not running in the latest snapshot.
F5 Share link
Creates an anonymous code. The shared page shows the train status, the as-of time and a
Hindi toggle, with large text. Links expire after 7 days. No account and no user location.
F6 Nearby trains
For the selected train, lists trains ahead, behind and on the opposite direction within 50
km, ordered by distance along the corridor. Computed from one snapshot, so it carries the
Estimated label.
F7 Replay
Choose a day, press play, and trains move between recorded snapshots at 1x, 10x or 60x
speed with a scrubber. Replay makes sparse data feel live and is clearly labelled Replay.
F8 History overlay
Shows how this train usually runs at a station, for example usually +8 min here, from
journey overlay data saved in the database.
F9 Delay reason card
Rule-based and honest. Labels are Likely, Possible or Unknown. It appears only when two
snapshots are no more than 30 minutes apart. Otherwise it says Not enough fresh data to
estimate a reason.
F10 Languages
English and Hindi. All strings live in one file per language. Train and station names stay in
their official form.
F11 Admin budget page
Protected page showing requests used and left this month, the last 20 provider calls, and
the next planned snapshot.
F12 Alerts
Deferred to Phase 3. Alerts need frequent polling, which the free plan cannot give.
6. UI specification
Mockups for the map home and train detail screens are on the design canvas. This section
is the contract those screens follow and the checklist for the screens still to design.
6.1 Principles
Map first. The map fills the screen and everything else floats above it, as in the
trainTracker24 reference.
Few controls. One floating search bar, filter chips, two map buttons, one bottom sheet,
four tabs.
Say why, not only how late. A delay always has a reason line, or an honest Unknown.
Honest data. Every screen shows the as-of time. Positions say Estimated. Replay says
Replay.
Calm and legible. Large numbers, plain words, 44 px touch targets, colour never the
only signal.
6.2 Screens
Screen Contents Status
Map home Map, search bar, chips (All, Delayed,
Express, My trip), corridor selector,
layers and locate buttons, bottom
sheet with corridor counts and the
snapshot time, tab bar
Mockup done, needs the
changes in 6.5
Train detail Delay card, reason card, forecast tiles,
station list, Share and Alert buttons
Mockup done, needs the
changes in 6.5
6.3 Design tokens
Font: Inter plus Noto Sans Devanagari for Hindi. Body 14 to 15 px, labels 11 to 13 px, the
delay number 40 px bold. Tokens live in one package (section 8) and are exported to CSS
variables and TypeScript, so a colour is never typed twice.
Screen Contents Status
Search Recent searches, results for trains and
stations
To design
Nearby trains Sheet with Ahead, Behind and
Opposite groups
To design
Replay Map plus a bottom control bar: play,
speed, scrubber, day picker
To design
Share page Read-only status for family, large text,
language toggle
To design
Admin budget Used and left, recent calls, next
snapshot
To design, plain table
Empty and error
states
No snapshot yet, budget exhausted,
provider down, offline
To design
Token Value Use
ink #0B2540 Text, delay card, selected chip
primary #2457D6 Selected train, primary buttons, active
tab
ok #1E8E5A On time
warn #C77700 Slight delay
bad #D23B2E and #B42318 Major delay (marker and text)
surface and page #FFFFFF on #F3F6F8 Cards and background
map land, water,
rail
#E9EEF1, #BFDDEA,
#C3CBD2
Light map style
6.4 Components
Delay pill, train marker (triangle rotated to bearing, three delay colours, larger and blue
when selected), reason card, forecast tile, station row, filter chip, bottom sheet with peek,
half and full states, floating search, tab bar, as-of banner, replay control bar.
6.5 Changes needed in the current mockups
1. Replace the India-wide count with counts computed from the snapshot, and add the
snapshot time and an Estimated tag.
2. Add the corridor selector chip.
3. Remove the fake precision: no percentages, and the reason tag reads Likely, Possible
or Unknown.
4. Show Set alert as disabled with a Coming later note until Phase 3.
5. Add a stale-data state when the snapshot is older than the threshold in 7.5.
6.6 Accessibility and language
Touch targets of at least 44 px. Text contrast of at least 4.5 to 1. Real buttons and labels,
not clickable divs. Reduced-motion setting respected for marker movement. Hindi layout
tested for longer strings.
7. Architecture and algorithms
7.1 Data flow
The rule that protects the budget: the frontend talks only to our API, and our API reads
only our database. Only ingest jobs reach the provider, and only through the guard.
RailRadar API
     ^
     |  (only via budget guard: cache, ledger, cap)
Ingest jobs  (scheduled snapshot, static load, admin refresh)
     |
     v  raw payload saved, then normalised
Postgres  (reference data, corridors, provider_calls, snapshots, 
observations)
     ^
     |  read-only queries
API (Fastify)  ->  JSON with asOf, source, isEstimated
     ^
     |
Web app (React PWA)  ->  MapLibre map, TanStack Query cache
7.2 Estimated position (A1)
Given the latest observation at or before the viewing time, compute where the train
probably is on its current segment. The same function runs on the server and in the
browser, because it lives in the domain package.
position(obs, at):
  segment   = (obs.currentStation, obs.nextStation)
  elapsed   = minutes between obs.takenAt and at
  segMinutes = obs.nextArrivalMin - obs.departedCurrentMin      // VERIFY in 
spike S1
  t         = clamp((obs.minutesIntoSegment + elapsed) / segMinutes, 0, 1)
  return lerp(coords(segment.start), coords(segment.end), t)
If the viewing time is more than 15 minutes past the expected arrival, hold the train at the
next station and mark it Stale. A straight line between stations is acceptable for Phase 1.
Snap to real track geometry later. The field meanings above are assumptions until spike S1
confirms them with real data.
7.3 Nearby trains (A2)
Every corridor station has a distance from the corridor start (km_from_start). A train's
corridor position is that distance plus the share of the segment covered. Sort all trains by
it. For a selected train, Ahead means larger distance in the same direction, Behind means
smaller, and Opposite means the other direction. Overtake hint: a train behind with higher
priority and a higher average speed.
7.4 Delay reason rules (A3)
Rules run in order and the first match wins. No machine learning in v2.
Each result stores the evidence it used (trains, distances, snapshot ids) so a wrong guess
can be debugged. User feedback buttons come in Phase 3.
7.5 Budget guard (A4) and freshness
Cache time per method: static lookups 30 days, train details 1 day, live map 5 minutes,
station board 5 minutes.
Daily allowance = floor((remaining minus reserve) / days left in the month). Scheduled
snapshots use the allowance first. The admin refresh needs the admin token.
When the cap is reached the API keeps serving saved data and returns source:
snapshot with the old as-of time. It never fails.
Freshness labels: under 15 minutes is Recent, 15 minutes to 3 hours is Aged (shown in
amber), over 3 hours is Old (shown with a warning).
8. Folder structure
One repository (monorepo) with npm or pnpm workspaces. Apps are thin. Logic lives in
small packages that anyone can import and test alone.
Rule Condition Label
R1 Making
way
Train stopped between two snapshots no
more than 30 minutes apart, and a higher-
priority train is behind it within 25 km along
the corridor
Likely: waiting for the faster
train
R2 Fog Train delay grew between snapshots and
the weather source shows visibility under
500 m near it (optional, free weather
source)
Possible: fog speed limit
R3 Long halt Delay grew while the train sat at a station
longer than scheduled
Possible: extended halt
R4 Default None of the above Unknown
railpulse/
|-- apps/
|   |-- api/                      Fastify backend: reads the database, serves 
JSON
|   |   `-- src/
|   |       |-- server.ts         builds the app and registers modules
|   |       |-- config.ts         the ONLY file that reads process.env
|   |       |-- modules/          one folder per feature: routes.ts + 
service.ts
|   |       |   |-- corridors/
|   |       |   |-- trains/
|   |       |   |-- map/
|   |       |   |-- replay/
|   |       |   |-- share/
|   |       |   `-- admin/
|   |       |-- providers/
|   |       |   |-- index.ts      provider = guarded(railradar)
|   |       |   `-- guard.ts      budget guard, ledger and cache (the ONLY 
spender)
|   |       |-- jobs/             load-static.ts, snapshot.ts, history.ts, 
scheduler.ts
|   |       `-- plugins/          auth, rate-limit, error-handler, response-
envelope
|   `-- web/                      React + Vite installable web app
|       `-- src/
|           |-- app/              router, providers, layout
|           |-- features/         map, search, train-detail, nearby, replay, 
share, corridors
|           |                     (each: components/, hooks/, index.ts)
|           |-- components/       shared UI: Button, Chip, Sheet, DelayPill, 
AsOfBanner
|           |-- lib/              api.ts (the ONLY fetch), map/ (MapView + 
layers), format.ts
|           |-- i18n/             en.json, hi.json
|           `-- styles/           tokens.css (generated, never edited by 
hand)
|-- packages/
|   |-- shared/                   zod schemas, types, constants, error codes
|   |-- domain/                   pure functions: position, nearby, reasons, 
freshness
|   |-- db/                       migrations/, queries/ (repositories), seed/
|   |-- provider-railradar/       client.ts, mappers.ts, index.ts
|   `-- ui-tokens/                tokens.ts, build-css.ts
|-- fixtures/railradar/           saved raw provider responses for dev and 
tests
|-- tools/                        CLI scripts: record-fixture, seed-corridor
|-- docs/                         PRD.md, DECISIONS.md, API.md
|-- .github/workflows/ci.yml
|-- .env.example
|-- package.json                  workspaces
`-- README.md
8.1 Dependency rules
Enforced in CI by a boundary checker (dependency-cruiser or eslint boundaries), so a
violation fails the build.
The web app never touches the provider or the database. It sees only the API.
9. Modularity and no-duplication rules
9.1 One home for every kind of thing
Package May import Must never import
shared nothing internal everything else
ui-tokens nothing internal everything else
domain shared db, provider, apps, any I/O
provider-railradar shared db, domain, apps
db shared provider, domain, apps
apps/api shared, domain, db, provider-railradar apps/web
apps/web shared, domain, ui-tokens db, provider-railradar, apps/api
Thing Its single home Used by
Data shapes and
validation
packages/shared (zod schemas,
types inferred from them)
API validation, provider
mappers, web fetch
parsing, tests
9.2 Working rules
1. Search before writing. Before adding a helper, search the repo. If something close
exists, extend it.
2. Rule of three. Two similar pieces are tolerated. The third time, extract a shared
function.
3. Types come from schemas. Write the zod schema once and infer the TypeScript type
from it. No hand-written duplicate interfaces.
4. One file, one job. Routes parse input and call a service. Services call repositories and
domain functions. Repositories run SQL. Nothing skips a layer.
5. No logic in components. Components render. Hooks fetch. Domain functions compute.
6. Automatic checks. CI runs a duplicate-code detector (jscpd, fail above 3 percent), the
boundary checker, lint, type check and tests.
Thing Its single home Used by
Constants and
thresholds (budget, stale
limits, nearby radius)
packages/shared/constants.ts Everything
Business logic (position,
nearby, reasons)
packages/domain API and web, so the
logic exists once
SQL packages/db/queries (one function
per query)
API modules and jobs
Table definitions packages/db/migrations Everything through db
Provider calls and field
mapping
packages/provider-railradar The guard only
Spending requests apps/api/providers/guard.ts Jobs and admin refresh
Environment variables apps/api/config.ts API only
HTTP calls from the
browser
apps/web/lib/api.ts Every feature
Colours, spacing, type packages/ui-tokens CSS and TypeScript
UI text apps/web/i18n/*.json Every component
Error codes packages/shared/errors.ts API and web
9.3 Reference sketches
These show the shape of the modular code. The AI may improve them (section 19).
The provider contract, defined once in shared, implemented by the provider package, and
used by everything else:
// packages/shared/src/provider.ts
export interface TrainDataProvider {
  listStations(): Promise<StationLookup[]>;
  listTrains(): Promise<TrainLookup[]>;
  getTrainDetails(trainNumber: string): Promise<TrainDetails>;
  getLiveMap(): Promise<LiveTrain[]>;
  getStationBoard(stationCode: string): Promise<StationBoard>;
}
The budget guard wraps every method in one place, so no method repeats the cache and
ledger logic:
// apps/api/src/providers/guard.ts
export function guarded<T extends object>(inner: T, deps: GuardDeps): T {
  return new Proxy(inner, {
    get(target, method: string) {
      return async (...args: unknown[]) => {
        const key = `${method}:${stableStringify(args)}`;
        const hit = await deps.cache.get(key, deps.policy.ttlFor(method));
        if (hit) return hit;
        await deps.ledger.reserve(method);           // throws 
BudgetExhausted
        const result = await (target as any)[method](...args);
        await deps.ledger.commit(method, key, result);
        return result;
      };
    },
  });
}
The browser has one fetch function that validates every response with the shared
schema:
// apps/web/src/lib/api.ts
export async function api<S extends z.ZodTypeAny>(path: string, schema: S) {
  const res = await fetch(`/api/v1${path}`);
  if (!res.ok) throw await toApiError(res);
  return schema.parse(await res.json()) as z.infer<S>;
}
Domain functions are pure and shared, for example estimatePosition(obs, at,
stations)  in packages/domain. The API calls it for snapshots, and the web app calls it
every second to move markers smoothly. It is written and tested once.
10. Database
PostgreSQL on a managed free tier (Supabase or Neon). Plain latitude and longitude
columns, no PostGIS until Phase 3. Four ideas shape the schema:
1. Three layers. Reference data loaded once, observations that are only ever appended,
and derived results that can be rebuilt.
2. The ledger is also the archive. Every provider call stores its raw response, so we can
re-process old data without spending requests.
3. Corridors are data. Adding a corridor means inserting rows, not changing code.
4. Times are offsets. The timetable stores minutes from the origin's midnight plus a day
number, so one row serves every date.
-- REFERENCE DATA (loaded once)
CREATE TABLE stations (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, name_hi TEXT,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,          -- filled later, see 
note below
  coord_source TEXT,                                   -- live_map, 
open_dataset, manual
  zone TEXT, is_junction BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE trains (
  number TEXT PRIMARY KEY, name TEXT NOT NULL, name_hi TEXT,
  category TEXT NOT NULL, type TEXT,
  priority SMALLINT NOT NULL,                          -- 1 = highest, from 
one mapping in shared constants
  source_code TEXT REFERENCES stations, dest_code TEXT REFERENCES stations,
  run_days SMALLINT NOT NULL,                          -- weekday bitmask
  return_train TEXT
);
CREATE TABLE train_stops (
  train_number TEXT REFERENCES trains, seq INT,
  station_code TEXT REFERENCES stations,
  arr_min INT, dep_min INT, arr_day SMALLINT, dep_day SMALLINT,
  dist_km NUMERIC(7,1), is_halt BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (train_number, seq)
);
-- CORRIDORS (data, not code)
CREATE TABLE corridors (
  id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, name_hi TEXT, is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE corridor_stations (
  corridor_id INT REFERENCES corridors, seq INT,
  station_code TEXT REFERENCES stations, km_from_start NUMERIC(6,1) NOT NULL,
  PRIMARY KEY (corridor_id, seq)
);
CREATE TABLE corridor_trains (
  corridor_id INT REFERENCES corridors, train_number TEXT REFERENCES trains,
  PRIMARY KEY (corridor_id, train_number)
);
-- PROVIDER SPEND: ledger and raw archive in one table
CREATE TABLE provider_calls (
  id BIGSERIAL PRIMARY KEY, provider TEXT NOT NULL, method TEXT NOT NULL,
  params_hash TEXT NOT NULL, params JSONB NOT NULL,
  http_status INT, cost SMALLINT NOT NULL DEFAULT 1,
  payload JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_calls_lookup ON provider_calls (method, params_hash, 
created_at DESC);
CREATE INDEX provider_calls_time ON provider_calls (created_at);
-- OBSERVATIONS (append-only)
CREATE TABLE snapshots (
  id BIGSERIAL PRIMARY KEY, scope TEXT NOT NULL,       -- corridor:<slug> or 
network
  taken_at TIMESTAMPTZ NOT NULL, call_id BIGINT REFERENCES provider_calls,
  UNIQUE (scope, taken_at)
);
CREATE TABLE train_observations (
  snapshot_id BIGINT REFERENCES snapshots ON DELETE CASCADE,
  train_number TEXT REFERENCES trains,
  current_station TEXT REFERENCES stations, next_station TEXT REFERENCES 
stations,
  mins_since_dep INT, next_arrival_min INT, delay_min SMALLINT,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  PRIMARY KEY (snapshot_id, train_number)
);
CREATE TABLE stop_observations (                      -- from train details 
live data
  snapshot_id BIGINT REFERENCES snapshots ON DELETE CASCADE,
  train_number TEXT REFERENCES trains, seq INT,
  act_arr_min INT, act_dep_min INT, delay_min SMALLINT, platform TEXT,
  PRIMARY KEY (snapshot_id, train_number, seq)
);
-- DERIVED (Phase 2, can be rebuilt from the layers above)
CREATE TABLE delay_history (
  train_number TEXT REFERENCES trains, station_code TEXT REFERENCES stations,
  day_of_week SMALLINT, avg_arr_delay_min NUMERIC(5,1), max_delay_min INT,
  samples INT, ontime_count INT, fetched_at TIMESTAMPTZ,
  PRIMARY KEY (train_number, station_code, day_of_week)
);
CREATE TABLE reason_results (
  id BIGSERIAL PRIMARY KEY, snapshot_id BIGINT REFERENCES snapshots ON DELETE 
CASCADE,
  train_number TEXT REFERENCES trains, rule TEXT NOT NULL,
  label TEXT NOT NULL,                                 -- likely, possible, 
unknown
  evidence JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- SHARING (no accounts)
CREATE TABLE share_links (
  code TEXT PRIMARY KEY, train_number TEXT REFERENCES trains,
  journey_date DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
Notes
Station coordinates are a gap. The station lookup endpoints return codes and names
only. Coordinates must come from live map responses (which include them) or from an
open dataset. This is spike S8.
Store only what the corridor needs. The live map returns every running train. The
ingest job keeps the raw payload in provider_calls but writes observations only for
corridor trains.
Seed example. Delhi to Kanpur corridor stations: NDLS, GZB, ALJN, TDL, ETW, CNB,
with km_from_start from the timetable. Confirm every code against the lookup data.
Migrations. Numbered SQL files in packages/db/migrations, applied by one command.
Never edit the database by hand (rule N7).
Backups. The ledger archive is the valuable part. Dump it weekly to a file outside the
database host.
11. API specification
Base path /api/v1. JSON only. Every success response uses one envelope, and the meta
fields are rule N4.
{
  "data": { },
  "meta": {
    "asOf": "2026-11-01T10:05:00+05:30",
    "source": "snapshot",
    "isEstimated": true,
    "snapshotId": 41
  }
}
Errors use { "error": { "code": "...", "message": "..." } } with codes from packages/shared:
NOT_FOUND, VALIDATION, BUDGET_EXHAUSTED, PROVIDER_DOWN, UNAUTHORIZED,
RATE_LIMITED. When the budget is exhausted, read endpoints still return saved data with
an old asOf. They never fail because of the budget.
Method and path Purpose Provider
cost
GET /corridors List active corridors 0
Every endpoint has a zod schema for its input and output in packages/shared, and a
fixture-based test.
12. Frontend architecture
Stack: React 18, Vite, TypeScript, React Router, TanStack Query, MapLibre GL, react-
i18next, vite-plugin-pwa.
State: server data lives in TanStack Query only. Selected corridor, train and snapshot
live in the URL, so every view is shareable. Small UI state stays inside components.
Map: one MapView component. Each concern is its own layer module: corridor line,
train markers, selected train, replay trail. A layer takes data and draws it, nothing else.
Method and path Purpose Provider
cost
GET /corridors/:slug Stations in order and trains on the
corridor
0
GET /corridors/:slug/map?
snapshot=latest or an id or at=time
Trains with estimated positions
for the map
0
GET /corridors/:slug/snapshots?
date=YYYY-MM-DD
Snapshot times for replay 0
GET /search?q= Trains and stations from the local
database
0
GET /trains/:number Static data, latest observation,
stops, history and reason
0
GET /trains/:number/nearby?snapshot= Ahead, behind and opposite trains 0
POST /share Create a share code for a train
and date
0
GET /share/:code Public share page data 0
GET /health Service status 0
GET /admin/budget Used and left, recent calls (admin
token)
0
POST /admin/snapshot Spend one request now, if the
guard allows (admin token)
1
Movement: markers move by calling the shared estimatePosition function about once
per second between data refreshes. Reduced-motion users get jumps instead of
animation.
Polling: the app refetches cached API endpoints every 60 seconds. This costs no
provider requests.
Offline: the installable web app caches the shell and the last map response, and shows
the as-of banner in amber when offline.
Components: a small own set built on the tokens package. Presentational components
get data through props. Hooks fetch. No component calls fetch directly.
13. Security, privacy and legal
The provider key is stored only in the backend environment (N1). A secret scanner runs
in CI.
Admin routes need a long random token. Public routes are rate limited per IP.
Inputs are validated with the shared zod schemas. CORS allows only our own origin.
Share codes are random strings of at least 10 characters. They reveal a train and a date
and nothing about the person.
No accounts, no phone numbers and no user location in Phases 1 and 2. Analytics, if
any, count page views without identifiers.
Credit the provider and OpenStreetMap contributors in an About screen. State clearly
that the app is not affiliated with Indian Railways and that estimates must not be used
for safety decisions.
Spike S5 must pass before snapshots are stored and redisplayed.
14. Testing and quality
Level Tool What it covers
Unit Vitest Every domain function, the guard, the mappers
Contract Vitest and zod Every saved fixture parses with the shared
schema, so provider changes are caught
API Supertest Each endpoint against a test database filled from
fixtures
Set PROVIDER_MODE to fixtures for development and tests, and to live only on the
server that spends requests (N6).
15. Operations
Hosting: the API and scheduler on one small host (Render, Railway or Fly.io), the web
app on any static host, the database on Supabase or Neon. All have free tiers, to be
confirmed at signup.
Scheduler: a cron-style job inside the API runs snapshots at planned times, for
example morning peak, midday, evening peak and night.
Config: one table of environment variables in .env.example, read only by config.ts. Key
ones: RAILRADAR_API_KEY, RAILRADAR_BASE_URL, PROVIDER_MODE,
MONTHLY_CAP, RESERVE, ADMIN_TOKEN, DATABASE_URL.
Observability: structured logs (pino), the admin budget page, and a warning log at 80
percent of the cap.
Deploy: GitHub Actions run all checks, then deploy on merge to main.
16. Roadmap and definition of done
Level Tool What it covers
UI Testing Library Key components and states, including stale and
empty
Smoke Playwright Load map, open a train, open share page
Repository rules CI Lint, type check, duplicate detector under 3
percent, boundary checker, secret scan
Phase and weeks Work Done when
0 Spike, week 1 Save fixtures, answer S1 to S8,
scaffold repo, choose corridor
Fixtures committed, spike
answers written in
DECISIONS.md, CI green on an
empty repo
17. Risks
Phase and weeks Work Done when
1 Corridor MVP,
weeks 2 to 5
Schemas, provider package,
migrations, static load, guard,
snapshot job, API for corridors
and map, web map, search,
train detail, share page
Map shows the corridor from
saved data with an as-of banner,
zero provider calls at view time,
budget page works
2 Intelligence,
weeks 6 to 9
Nearby trains, replay, history
overlay, reason rules, Hindi,
offline cache
Replay of one recorded day plays,
reason card shows or says Not
enough fresh data, English and
Hindi complete
3 Live, later Paid plan or sponsor, scheduled
polling every few minutes,
alerts, more corridors, optional
PostGIS and GPS opt-in
Alerts fire within 5 minutes of a
detected change, second corridor
added with data only
4 Native and API React Native app, public API Store release
Risk Effect Mitigation
Free plan does not include
live map
No snapshots of all
trains
Use station boards and train details
for corridor trains instead
Provider terms forbid
storing data
No replay Short-lived cache only, apply for
permission, or change provider
Provider changes fields or
shuts down
Ingest breaks Contract tests on fixtures, provider
interface, raw archive
Sparse snapshots mislead
users
Wrong trust As-of banner, Estimated and Stale
labels, no false precision
Station coordinates
unavailable
Map cannot place
stations
Harvest from live map or import an
open dataset (S8)
Solo builder overload Delay One corridor, small phases, AI help
with a strict contract
18. Success metrics
The old 500K-user targets are dropped. Realistic targets for the first beta:
30 testers use the corridor map during one month.
Map loads in under 3 seconds on 4G in 90 percent of loads.
Provider requests per month never exceed the cap, and user views cost zero.
Replay plays one full recorded day without errors.
At least 60 percent of testers who open a train detail say they understood the delay
line.
Retention (day 7) is measured only after 100 users exist.
19. AI collaboration contract
19.1 Freedom to change
The AI assistant is free to change anything in this PRD, including the stack, folder layout,
schema, algorithms and UI structure, when it finds something better or when the plan is
wrong. It must:
1. Say what it is changing and why in five lines or fewer.
2. Add an entry to docs/DECISIONS.md using the template below.
3. Keep rules N1 to N8 intact.
4. Update the affected PRD section so the document and the code never disagree.
Stop and ask the human first when a change would add cost, spend provider requests,
widen the product scope, store personal data, or break a non-negotiable rule.
Decision template:
Risk Effect Mitigation
Duplicate or tangled AI-
written code
Bugs, slow progress Sections 8 and 9, CI checks, one
prompt per step
## D-014 Short title
Date: 2026-11-xx
Context: what problem forced a decision
Decision: what we chose
Alternatives: what we rejected and why
Consequences: what changes in code, schema or PRD sections
19.2 Standing instruction to paste at the start of every AI chat
You are helping build RailPulse India. Follow PRD v2 sections 1, 8 and 9.
Rules N1 to N8 are fixed. Do not duplicate code: search the repo first, put 
logic in
packages/domain, schemas in packages/shared, SQL in packages/db, and calls to 
the
provider only through the budget guard. Return complete files with their 
paths.
If you think the PRD should change, say so in five lines and write a 
DECISIONS.md
entry. Ask before anything that costs money or provider requests.
19.3 Prompt sequence
Give the AI one step at a time, with the listed inputs, and check the done condition before
moving on. Arena chats cannot see your files, so paste the inputs.
Step Ask the AI to Paste into the prompt Done when
P1 Scaffold the monorepo from
section 8 with CI, lint,
boundary and duplicate
checks
Sections 8 and 9 Install, lint, test and build
run clean
P2 Write zod schemas for
every provider response
and every API response
Saved fixtures, section
11
Every fixture parses with
its schema
P3 Build the provider package
with the interface, mappers
and a fixtures mode
Section 9.3, fixtures,
RailRadar docs pages
Contract tests pass in
fixtures mode
20. Open questions
Step Ask the AI to Paste into the prompt Done when
P4 Write migrations,
repositories and the
corridor seed
Section 10 Migrations run on an empty
database and the seed
loads
P5 Build the guard, ledger,
cache and admin budget
route
Sections 3.2, 7.5, 9.3 Tests prove the cap is
never exceeded and cache
hits cost nothing
P6 Build the static load and
snapshot jobs
Sections 3, 10 Running them on fixtures
fills the tables
P7 Write the domain functions
with tests: position, nearby,
freshness, reasons
Sections 7.2 to 7.5 Tests pass and the package
has no I/O
P8 Build the API modules and
response envelope
Section 11 Endpoint tests pass
P9 Build the web shell,
MapView, corridor line and
train markers
Sections 6, 12, design
canvas
Map shows the seeded
corridor from the API
P10 Build search, train detail
and share page
Sections 5, 6 Screens match the
mockups and states
P11 Add replay, Hindi and offline
cache
Sections 5, 12 One recorded day replays,
Hindi complete
P12 Harden: security checklist,
duplicate report, docs
update
Sections 13, 14 CI green, no duplicate
hotspots, PRD matches the
code
Question Suggested answer Owner
First corridor Delhi to Kanpur: shorter and dense with mixed
train types. Extend to Patna later
You
Product name RailPulse, after checking that it is free to use You
Question Suggested answer Owner
Hosting providers Supabase or Neon plus Render, Railway or
Fly.io
You
Paid plan or sponsor for
Phase 3
Decide after the beta shows real usage You
Provider terms for storing
data
Read the terms during spike S5 You
Station coordinate source Decide in spike S8 AI with
you

---

## Built in this repository — changes recorded against the PRD

Rules N1 to N8 are intact. Everything below is a deliberate deviation, with
the reasoning in `docs/DECISIONS.md`.

| PRD area | PRD v2 said | Built here | Why |
| --- | --- | --- | --- |
| Database | Managed Postgres (Supabase or Neon) | Same SQL, run on managed Postgres when `DATABASE_URL` is set, on embedded PGlite otherwise | A solo builder and CI need a database without a signup; the SQL is unchanged (D-003) |
| Live map | "Free-plan access unconfirmed (S1)" | Live map is the only ingest source, with station boards as the documented fallback | S1 is still a spike; the mapper isolates the field names (D-006) |
| Snapshots | About 14 static requests plus snapshots | Same, plus a scheduler limited to two planned slots a day | 100 requests with a 20 reserve and 30 days gives a daily allowance of 2 (D-005) |
| Marker movement | estimatePosition once per second | Only while the snapshot is Recent; otherwise markers stay at the recording and the banner says the age | Carrying a 5-hour-old estimate forward piles every train at its next station (D-007) |
| PWA | vite-plugin-pwa | A 30-line service worker plus a web manifest | One dependency fewer, same behaviour for the shell and the last map (D-008) |
| Station coordinates | Spike S8 | Corridor seed carries coordinates flagged `coord_source = timetable` | The map needs points before the spike runs; the source is auditable (D-004) |
| Playwright smoke | Playwright on three flows | Not wired in this environment; API + page tests cover the same flows | The browser download is unavailable here; the CI job is ready to add it (D-010) |
| Shots at percentages | None | Unchanged: labels only, Likely / Possible / Unknown |  |

### What is implemented, phase by phase

- **Phase 0 (spikes + scaffold)**: repository scaffold, CI checks, fixtures,
  and the spike questions listed in `docs/DECISIONS.md` as still open.
- **Phase 1 (corridor MVP)**: schemas, provider package, migrations, static
  load, budget guard, snapshot job, API for corridors and map, web map,
  search, train detail, share page, admin budget page.
- **Phase 2 (partly)**: nearby trains, replay, history table and reason card
  are in the schema, domain and API; Hindi and the offline cache are in place.
  Journey-overlay fetching (S3) and the history ingest job are not built.
- **Phase 3 and later**: alerts, a second corridor, PostGIS, GPS, native app.
