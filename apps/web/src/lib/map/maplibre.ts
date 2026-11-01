/**
 * The only place maplibre-gl is loaded.
 *
 * Two problems this solves:
 *
 * 1. **Interop.** The package publishes a single UMD bundle (`main` only, no
 *    `module` or `exports` field), so what Vite hands back depends on how it
 *    pre-bundled it: sometimes the namespace, sometimes `{ default: ns }`. A
 *    static `import maplibregl from 'maplibre-gl'` therefore works on one
 *    machine and fails on another with
 *    "does not provide an export named 'default'" — which is exactly the failure
 *    that blanked the whole app, because a broken static import takes the entire
 *    module graph down with it.
 *
 * 2. **Blast radius.** Loading it lazily means a map library that cannot load is
 *    a map that cannot load. The list, the search, the detail screen and the
 *    budget page all keep working, and MapView shows its fallback panel.
 */
import type * as MapLibreNamespace from 'maplibre-gl';

export type MaplibreModule = typeof MapLibreNamespace;

let pending: Promise<MaplibreModule> | null = null;

/**
 * Reads a property that may legitimately be absent. Module namespaces can be
 * proxies that throw on unknown keys (Vitest's mock namespace does), and a
 * missing export must read as `undefined`, not crash the map.
 */
function read(target: unknown, key: string): unknown {
  if (!target) return undefined;
  try {
    return (target as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function unwrap(mod: unknown): MaplibreModule {
  // A UMD build comes back as { default: namespace }; an interop-aware
  // pre-bundle adds the named exports alongside it. Either shape is fine.
  for (const candidate of [read(mod, 'default'), mod]) {
    if (typeof read(candidate, 'Map') === 'function') return candidate as MaplibreModule;
  }
  throw new Error('maplibre-gl loaded, but it did not provide a Map constructor');
}

/** Loads once and caches, including the failure, so a retry is a real retry. */
export function loadMaplibre(): Promise<MaplibreModule> {
  if (!pending) {
    pending = import('maplibre-gl').then(unwrap);
    pending.catch(() => {
      // Forget the rejection: the next attempt (Retry button) starts clean.
      pending = null;
    });
  }
  return pending;
}

/** Test/seam helper: forget the cached module. */
export function resetMaplibreForTests(): void {
  pending = null;
}
