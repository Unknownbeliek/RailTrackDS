// @vitest-environment jsdom
/**
 * When WebGL is unavailable the map must say so, not leave a blank canvas.
 * jsdom has no WebGL 2, which is exactly the failure users on a VM or with GPU
 * acceleration switched off hit, so this test reproduces it for real.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '../i18n';
import { MapView, supportsWebgl2 } from '../lib/map/MapView';
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

afterEach(() => cleanup());

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
