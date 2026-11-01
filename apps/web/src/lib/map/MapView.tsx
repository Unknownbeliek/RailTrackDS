/**
 * One MapView component. Each concern is its own layer: the corridor line,
 * the station dots, the train markers (section 12). A layer takes data and
 * draws it; it computes nothing.
 */
import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CorridorStation, DelayLevel } from '@railpulse/shared';
import { baseStyle, corridorPaint } from './style';

export interface MapTrain {
  trainNumber: string;
  lat: number;
  lng: number;
  bearingDeg: number;
  delayLevel: DelayLevel;
  label?: string;
  selected?: boolean;
}

export interface MapViewProps {
  stations: CorridorStation[];
  trains: MapTrain[];
  onSelectTrain?: (trainNumber: string) => void;
  /** Change this to re-fit the camera (for example when the corridor changes). */
  fitKey?: string;
  interactive?: boolean;
}

const DELAY_VAR: Record<DelayLevel, string> = {
  ontime: 'var(--rp-delay-ontime)',
  slight: 'var(--rp-delay-slight)',
  major: 'var(--rp-delay-major)',
};

function boundsOf(stations: CorridorStation[]): maplibregl.LngLatBounds | null {
  const points = stations.filter((s) => s.station.lat !== null && s.station.lng !== null);
  if (points.length === 0) return null;
  const bounds = new maplibregl.LngLatBounds();
  for (const point of points) {
    bounds.extend([point.station.lng as number, point.station.lat as number]);
  }
  return bounds;
}

function lineFeature(stations: CorridorStation[]): GeoJSON.Feature<GeoJSON.LineString> {
  const coordinates = stations
    .filter((s) => s.station.lat !== null && s.station.lng !== null)
    .map((s) => [s.station.lng as number, s.station.lat as number]);
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
}

/** Pixels per second are nobody's business, but a triangle must point somewhere. */
function markerElement(train: MapTrain): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rp-marker';
  button.dataset.train = train.trainNumber;
  button.setAttribute('aria-label', `${train.trainNumber} ${train.label ?? ''}`.trim());

  const body = document.createElement('span');
  body.className = `rp-marker__body${train.selected ? ' rp-marker__body--selected' : ''}`;
  body.style.background = DELAY_VAR[train.delayLevel];
  body.style.transform = train.selected ? 'scale(1.35)' : '';

  const arrow = document.createElement('span');
  arrow.className = 'rp-marker__arrow';
  arrow.style.transform = `rotate(${train.bearingDeg}deg)`;
  body.appendChild(arrow);

  if (train.label && train.selected) {
    const label = document.createElement('span');
    label.className = 'rp-marker__label';
    label.textContent = train.label;
    button.appendChild(label);
  }

  button.appendChild(body);
  return button;
}

export function MapView({ stations, trains, onSelectTrain, fitKey, interactive = true }: MapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; element: HTMLButtonElement }>());
  const stationMarkers = useRef<Marker[]>([]);
  const ready = useRef(false);

  // The map is created once; everything else is data on top of it.
  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: baseStyle(),
      center: [78.5, 27.6],
      zoom: 6.4,
      attributionControl: { compact: true },
      interactive,
    });
    map.current = instance;

    instance.on('load', () => {
      ready.current = true;
      instance.addSource('corridor', {
        type: 'geojson',
        data: lineFeature(stations),
      });
      instance.addLayer({
        id: 'corridor-halo',
        type: 'line',
        source: 'corridor',
        paint: {
          'line-color': corridorPaint.halo,
          'line-width': 8,
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      instance.addLayer({
        id: 'corridor-line',
        type: 'line',
        source: 'corridor',
        paint: {
          'line-color': corridorPaint.line,
          'line-width': 3,
          'line-dasharray': [2, 1.4],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      const bounds = boundsOf(stations);
      if (bounds) instance.fitBounds(bounds, { padding: 56, duration: 0 });
    });

    const trainMarkers = markers.current;
    return () => {
      trainMarkers.clear();
      stationMarkers.current = [];
      ready.current = false;
      instance.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Corridor line and station dots follow the data, not the map lifecycle.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const apply = () => {
      const source = instance.getSource('corridor') as maplibregl.GeoJSONSource | undefined;
      source?.setData(lineFeature(stations));

      for (const marker of stationMarkers.current) marker.remove();
      stationMarkers.current = stations
        .filter((s) => s.station.lat !== null && s.station.lng !== null)
        .map((s) => {
          const element = document.createElement('div');
          element.className = 'rp-station-label';
          element.textContent = s.station.name;
          return new maplibregl.Marker({ element, anchor: 'bottom' })
            .setLngLat([s.station.lng as number, s.station.lat as number])
            .addTo(instance);
        });
    };

    if (ready.current) apply();
    else instance.once('load', apply);
  }, [stations]);

  // Train markers: moved, never recreated, so the triangle glides.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const apply = () => {
      const seen = new Set<string>();
      for (const train of trains) {
        seen.add(train.trainNumber);
        const existing = markers.current.get(train.trainNumber);
        if (existing) {
          existing.marker.setLngLat([train.lng, train.lat]);
          const body = existing.element.querySelector('.rp-marker__body') as HTMLElement | null;
          if (body) {
            body.style.background = DELAY_VAR[train.delayLevel];
            body.classList.toggle('rp-marker__body--selected', Boolean(train.selected));
          }
          const arrow = existing.element.querySelector('.rp-marker__arrow') as HTMLElement | null;
          if (arrow) arrow.style.transform = `rotate(${train.bearingDeg}deg)`;
          existing.element.setAttribute(
            'aria-label',
            `${train.trainNumber} ${train.label ?? ''}`.trim(),
          );
          continue;
        }
        const element = markerElement(train);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelectTrain?.(train.trainNumber);
        });
        const marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([train.lng, train.lat])
          .addTo(instance);
        markers.current.set(train.trainNumber, { marker, element });
      }

      for (const [number, entry] of markers.current) {
        if (seen.has(number)) continue;
        entry.marker.remove();
        markers.current.delete(number);
      }
    };

    if (ready.current) apply();
    else instance.once('load', apply);
  }, [trains, onSelectTrain]);

  // Re-fit when the corridor changes.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !fitKey) return;
    const bounds = boundsOf(stations);
    if (!bounds) return;
    const run = () => instance.fitBounds(bounds, { padding: 56, duration: 600 });
    if (ready.current) run();
    else instance.once('load', run);
  }, [fitKey, stations]);

  return (
    <div className="rp-map-wrap">
      <div ref={container} className="rp-map" aria-label="Corridor map" role="application" />
    </div>
  );
}
