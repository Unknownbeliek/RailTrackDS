/**
 * A ticking clock. Markers move by recomputing estimatePosition once a second
 * from the same observation, which costs no requests (section 12).
 * Reduced-motion users get a slower tick and no animation (6.6).
 */
import { useEffect, useState } from 'react';
import { MARKER_TICK_MS } from '@railpulse/shared';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useNow(intervalMs: number = MARKER_TICK_MS, enabled = true): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);

  return now;
}
