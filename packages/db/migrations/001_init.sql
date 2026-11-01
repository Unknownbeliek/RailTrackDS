-- RailPulse India: initial schema (PRD v2 section 10).
-- Rule N7: the database changes only through these numbered files.
-- Four ideas: three layers (reference, observations, derived), the ledger is
-- also the archive, corridors are data, and times are offsets.

-- ------------------------------------------------------------- reference --
CREATE TABLE IF NOT EXISTS stations (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_hi TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  coord_source TEXT CHECK (coord_source IN ('live_map', 'open_dataset', 'manual', 'timetable')),
  zone TEXT,
  is_junction BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS trains (
  number TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_hi TEXT,
  category TEXT NOT NULL,
  type TEXT,
  priority SMALLINT NOT NULL,
  source_code TEXT REFERENCES stations(code),
  dest_code TEXT REFERENCES stations(code),
  run_days SMALLINT NOT NULL DEFAULT 127,
  return_train TEXT
);

CREATE TABLE IF NOT EXISTS train_stops (
  train_number TEXT NOT NULL REFERENCES trains(number) ON DELETE CASCADE,
  seq INT NOT NULL,
  station_code TEXT NOT NULL REFERENCES stations(code),
  arr_min INT,
  dep_min INT,
  arr_day SMALLINT NOT NULL DEFAULT 0,
  dep_day SMALLINT NOT NULL DEFAULT 0,
  dist_km NUMERIC(7, 1) NOT NULL DEFAULT 0,
  is_halt BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (train_number, seq)
);

-- -------------------------------------------------------------- corridors --
CREATE TABLE IF NOT EXISTS corridors (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_hi TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS corridor_stations (
  corridor_id INT NOT NULL REFERENCES corridors(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  station_code TEXT NOT NULL REFERENCES stations(code),
  km_from_start NUMERIC(6, 1) NOT NULL,
  PRIMARY KEY (corridor_id, seq)
);

CREATE TABLE IF NOT EXISTS corridor_trains (
  corridor_id INT NOT NULL REFERENCES corridors(id) ON DELETE CASCADE,
  train_number TEXT NOT NULL REFERENCES trains(number) ON DELETE CASCADE,
  PRIMARY KEY (corridor_id, train_number)
);

-- ------------------------------------------- provider spend: ledger + archive --
CREATE TABLE IF NOT EXISTS provider_calls (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  method TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  params JSONB NOT NULL,
  http_status INT,
  cost SMALLINT NOT NULL DEFAULT 1,
  cached BOOLEAN NOT NULL DEFAULT false,
  payload JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_calls_lookup ON provider_calls (method, params_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS provider_calls_time ON provider_calls (created_at);

-- ----------------------------------------------------------- observations --
CREATE TABLE IF NOT EXISTS snapshots (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL,
  call_id BIGINT REFERENCES provider_calls(id),
  UNIQUE (scope, taken_at)
);

CREATE TABLE IF NOT EXISTS train_observations (
  snapshot_id BIGINT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  train_number TEXT NOT NULL REFERENCES trains(number) ON DELETE CASCADE,
  current_station TEXT REFERENCES stations(code),
  next_station TEXT REFERENCES stations(code),
  mins_since_dep INT,
  next_arrival_min INT,
  delay_min SMALLINT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  PRIMARY KEY (snapshot_id, train_number)
);

CREATE TABLE IF NOT EXISTS stop_observations (
  snapshot_id BIGINT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  train_number TEXT NOT NULL REFERENCES trains(number) ON DELETE CASCADE,
  seq INT NOT NULL,
  act_arr_min INT,
  act_dep_min INT,
  delay_min SMALLINT,
  platform TEXT,
  PRIMARY KEY (snapshot_id, train_number, seq)
);

-- ---------------------------------------------------------------- derived --
CREATE TABLE IF NOT EXISTS delay_history (
  train_number TEXT NOT NULL REFERENCES trains(number) ON DELETE CASCADE,
  station_code TEXT NOT NULL REFERENCES stations(code),
  day_of_week SMALLINT NOT NULL,
  avg_arr_delay_min NUMERIC(5, 1),
  max_delay_min INT,
  samples INT NOT NULL DEFAULT 0,
  ontime_count INT NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ,
  PRIMARY KEY (train_number, station_code, day_of_week)
);

CREATE TABLE IF NOT EXISTS reason_results (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  train_number TEXT NOT NULL REFERENCES trains(number) ON DELETE CASCADE,
  rule TEXT NOT NULL,
  label TEXT NOT NULL CHECK (label IN ('likely', 'possible', 'unknown')),
  evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, train_number)
);

-- --------------------------------------------------------------- sharing --
CREATE TABLE IF NOT EXISTS share_links (
  code TEXT PRIMARY KEY,
  train_number TEXT NOT NULL REFERENCES trains(number) ON DELETE CASCADE,
  journey_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS share_links_expiry ON share_links (expires_at);
