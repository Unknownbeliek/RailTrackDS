/**
 * Formatting helpers. Plain functions so every screen shows the same thing:
 * a delay is always "+8 min", never "8" or "0:08".
 */

export type Language = 'en' | 'hi';

const LOCALES: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN' };
const TIME_ZONE = 'Asia/Kolkata';

export function formatClock(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDate(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDay(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** Timetable offsets are minutes from the origin's midnight. */
export function formatOffset(minutes: number | null): string {
  if (minutes === null) return '—';
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatDelay(delayMin: number): string {
  if (delayMin <= 0) return 'On time';
  return `+${delayMin} min`;
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km)} km`;
}

/** "12 min ago" style age, used next to the as-of time. */
export function formatAge(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
