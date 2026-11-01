// @vitest-environment jsdom
/**
 * When WebGL is unavailable the map must say so, not leave a blank canvas.
 * jsdom has no WebGL 2, which is exactly the failure users on a VM or with GPU
 * acceleration switched off hit, so this test reproduces it for real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '../i18n';
import { MapView, supportsWebgl2 } from '../lib/map/MapView';
import { loadMaplibre, resetMaplibreForTests } from '../lib/map/maplibre';
import type { CorridorStation } from '@railpulse/shared';

const stations: CorridorStation[] = [
  {
    seq: 0,
    kmFromStart: 0,
    station: {
      code: 'NDLS',
      name: 'New Delhi',
      nameHi: null,
      lat: 28.6431,
      lng: 77.2197,
      zone: 'NR',
      isJunction: true,
    },
  },
];

afterEach(() => {
  cleanup();
  resetMaplibreForTests();
  vi.restoreAllMocks();
});

describe('map without WebGL', () => {
  it('reports that WebGL 2 is missing in this environment', () => {
    expect(supportsWebgl2()).toBe(false);
  });

  it('explains the failure instead of showing an empty canvas', () => {
    render(<MapView stations={stations} trains={[]} />);
    expect(screen.getByRole('alert').textContent).toMatch(/cannot start on this device/i);
    expect(screen.getByText(/WebGL 2/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('keeps the map container in place so a retry has somewhere to draw', () => {
    const { container } = render(<MapView stations={stations} trains={[]} />);
    expect(container.querySelector('.rp-map')).not.toBeNull();
  });
});

describe('map when the library cannot be loaded', () => {
  it('shows a library-specific message, not the WebGL one', async () => {
    // Pretend this browser has WebGL 2, so the component reaches the import.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
    // The UMD/ESM interop failure that blanked the whole app.
    vi.doMock('maplibre-gl', () => {
      throw new Error("does not provide an export named 'default'");
    });

    render(<MapView stations={stations} trains={[]} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/map library failed to load/i);
    expect(alert.textContent).not.toMatch(/WebGL 2/);
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();

    vi.doUnmock('maplibre-gl');
  });
});

describe('loadMaplibre', () => {
  it('unwraps a module that only has a default export', async () => {
    vi.doMock('maplibre-gl', () => ({ default: { Map: class {} } }));
    const lib = await loadMaplibre();
    expect(typeof lib.Map).toBe('function');
    vi.doUnmock('maplibre-gl');
  });

  it('accepts a namespace that already has the named exports', async () => {
    vi.doMock('maplibre-gl', () => ({ Map: class {}, Marker: class {} }));
    const lib = await loadMaplibre();
    expect(typeof lib.Map).toBe('function');
    expect(typeof lib.Marker).toBe('function');
    vi.doUnmock('maplibre-gl');
  });

  it('rejects a module that has no Map at all, with a readable message', async () => {
    vi.doMock('maplibre-gl', () => ({ default: {} }));
    await expect(loadMaplibre()).rejects.toThrow(/did not provide a Map constructor/);
    vi.doUnmock('maplibre-gl');
  });

  it('forgets a failure, so the Retry button is a real retry', async () => {
    vi.doMock('maplibre-gl', () => {
      throw new Error('boom');
    });
    await expect(loadMaplibre()).rejects.toThrow();
    vi.doUnmock('maplibre-gl');
    vi.doMock('maplibre-gl', () => ({ Map: class {} }));
    await expect(loadMaplibre()).resolves.toBeTruthy();
    vi.doUnmock('maplibre-gl');
  });
});
