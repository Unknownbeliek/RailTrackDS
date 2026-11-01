/**
 * One map style, built from the tokens (section 12). Free OSM raster tiles,
 * with a plain background so the map still reads if tiles cannot load.
 */
import { color, map as mapColors } from '@railpulse/ui-tokens';
import type { StyleSpecification } from 'maplibre-gl';

export const MAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'railpulse-light',
    glyphs: undefined,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: MAP_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': mapColors.land },
      },
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        paint: {
          'raster-opacity': 0.62,
          'raster-saturation': -0.75,
          'raster-contrast': 0.05,
        },
      },
    ],
  };
}

export const corridorPaint = {
  halo: mapColors.corridorHalo,
  line: mapColors.corridor,
  station: mapColors.station,
  ring: color.ink,
} as const;
