/**
 * Every threshold, cap and magic number lives here (PRD v2 section 9.1).
 * If a number appears in two places, it belongs in this file.
 */

/* ---------------------------------------------------------------- budget -- */

/** Free plan of the provider: 100 requests a month (section 3). */
export const MONTHLY_CAP_DEFAULT = 100;

/** Never spend the reserve (section 3.2). */
export const RESERVE_DEFAULT = 20;

/** Log a warning at 80 percent of the cap (section 15). */
export const BUDGET_WARN_RATIO = 0.8;

/** Cache lifetime per provider method (section 7.5), in milliseconds. */
export const CACHE_TTL_MS = {
  listStations: 30 * 24 * 60 * 60 * 1000,
  listTrains: 30 * 24 * 60 * 60 * 1000,
  getTrainDetails: 24 * 60 * 60 * 1000,
  getLiveMap: 5 * 60 * 1000,
  getStationBoard: 5 * 60 * 1000,
} as const;

/* ------------------------------------------------------------- freshness -- */

/** Under 15 minutes is Recent (section 7.5). */
export const FRESH_RECENT_MS = 15 * 60 * 1000;
/** 15 minutes to 3 hours is Aged. */
export const FRESH_AGED_MS = 3 * 60 * 60 * 1000;

/* ------------------------------------------------------------ estimation -- */

/** Hold a train at the next station after this much lateness (section 7.2). */
export const STALE_HOLD_MIN = 15;

/** A snapshot older than this is labelled Stale in the UI (section 6.5). */
export const STALE_SNAPSHOT_MS = 3 * 60 * 60 * 1000;

/** Marker animation tick (section 12). */
export const MARKER_TICK_MS = 1000;

/** Client refetch of cached endpoints. Costs zero provider requests. */
export const CLIENT_POLL_MS = 60 * 1000;

/* ----------------------------------------------------------------- delay -- */

/** Delay bands in minutes: on time < slight < major (section 6.3). */
export const DELAY_SLIGHT_MIN = 5;
export const DELAY_MAJOR_MIN = 15;

/* ---------------------------------------------------------------- nearby -- */

/** Trains within 50 km along the corridor count as nearby (F6, section 7.3). */
export const NEARBY_RADIUS_KM = 50;

/* ---------------------------------------------------------------- reason -- */

/** Reason rules need two snapshots no more than 30 minutes apart (F9, 7.4). */
export const REASON_MAX_GAP_MIN = 30;

/** "A higher-priority train is behind it within 25 km" (rule R1). */
export const REASON_MAKING_WAY_KM = 25;

/** Fog rule: visibility under 500 m (rule R2). */
export const REASON_FOG_VISIBILITY_M = 500;

/* ----------------------------------------------------------------- share -- */

/** Share links expire after 7 days (F5). */
export const SHARE_TTL_DAYS = 7;

/** Share codes are random strings of at least 10 characters (section 13). */
export const SHARE_CODE_LENGTH = 10;

/* ------------------------------------------------------------- corridors -- */

/** The Phase 1 corridor. Adding another one is data, not code (F2). */
export const DEFAULT_CORRIDOR_SLUG = 'delhi-kanpur';

/* ---------------------------------------------------------------- limits -- */

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_LIMIT = 20;
export const SNAPSHOT_LIST_LIMIT = 500;
export const RECENT_CALLS_LIMIT = 20;
export const REQUEST_BODY_LIMIT_BYTES = 32 * 1024;

/* ------------------------------------------------------------- train meta -- */

/**
 * Priority per train category: 1 is highest (section 10). One mapping only.
 */
export const TRAIN_PRIORITY: Record<string, number> = {
  RAJ: 1,
  VANDE_BHARAT: 1,
  SHATABDI: 2,
  DURONTO: 3,
  TEJAS: 3,
  HUMSAFAR: 4,
  SF: 4,
  MAIL: 5,
  EXPRESS: 5,
  PASSENGER: 6,
  MEMU: 7,
};

export const DEFAULT_TRAIN_PRIORITY = 5;

/** Categories faster than this (km/h average) can overtake lower priority ones. */
export const OVERTAKE_SPEED_RATIO = 1.1;

/* --------------------------------------------------------------- caching -- */

export const HTTP_CACHE_SECONDS = {
  static: 3600,
  map: 60,
} as const;
