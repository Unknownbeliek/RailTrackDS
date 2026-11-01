/**
 * One MapView component. Each concern is its own layer: the corridor line,
 * the station dots, the train markers (section 12). A layer takes data and
 * draws it; it computes nothing.
 *
 * Degrading honestly, twice over:
 *
 * - MapLibre needs WebGL 2. If this device or browser cannot provide it — a VM,
 *   a remote session, GPU acceleration switched off — we say so in words
 *   instead of leaving a blank canvas, because everything else is still true.
 * - MapLibre is loaded lazily through `./maplibre`, so a library that fails to
 *   load (interop, blocked asset, bad cache) costs the user a map, not the app.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CorridorStation, DelayLevel } from '@railpulse/shared';
import { loadMaplibre, type MaplibreModule } from './maplibre';
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

/** How long we wait for the style before telling the user tiles are slow. */
const STYLE_WARNING_MS = 8000;

/** One probe, used by the fallback and by the tests. */
export function supportsWebgl2(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/** `[[west, south], [east, north]]`, or null when nothing has coordinates. */
function boundsOf(stations: CorridorStation[]): [[number, number], [number, number]] | null {
  const points = stations.filter((s) => s.station.lat !== null && s.station.lng !== null);
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const point of points) {
    const lng = point.station.lng as number;
    const lat = point.station.lat as number;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [
    [west, south],
    [east, north],
  ];
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

/** A triangle rotated to the direction of travel, coloured by delay. */
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

type FailureKind = 'webgl' | 'library' | null;

export function MapView({ stations, trains, onSelectTrain, fitKey, interactive = true }: MapViewProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const lib = useRef<MaplibreModule | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; element: HTMLButtonElement }>());
  const stationMarkers = useRef<Marker[]>([]);
  const ready = useRef(false);
  const [attempt, setAttempt] = useState(0);
  // Bumped when an instance appears, so the data effects re-run against it
  // (the library arrives asynchronously, after their first pass).
  const [generation, setGeneration] = useState(0);
  const [failure, setFailure] = useState<FailureKind>(null);
  const [slow, setSlow] = useState(false);

  // The map is created once per attempt; everything else is data on top of it.
  useEffect(() => {
    if (!container.current || map.current) return;
    setFailure(null);
    setSlow(false);

    if (!supportsWebgl2()) {
      setFailure('webgl');
      return;
    }

    let cancelled = false;
    let instance: MapLibreMap | undefined;
    let warningTimer: number | undefined;

    const start = async () => {
      let maplibregl: MaplibreModule;
      try {
        maplibregl = await loadMaplibre();
      } catch {
        if (!cancelled) setFailure('library');
        return;
      }
      if (cancelled || !container.current) return;
      lib.current = maplibregl;

      try {
        instance = new maplibregl.Map({
          container: container.current,
          style: baseStyle(),
          center: [78.5, 27.6],
          zoom: 6.4,
          attributionControl: { compact: true },
          interactive,
        });
      } catch {
        // MapLibre throws here when WebGL cannot be initialised at all.
        if (!cancelled) setFailure('webgl');
        return;
      }
      map.current = instance;
      setGeneration((value) => value + 1);

      warningTimer = window.setTimeout(() => {
        if (!ready.current) setSlow(true);
      }, STYLE_WARNING_MS);

      // Tile or style problems are reported, never fatal: the local layers below
      // are drawn from our own data and stay useful.
      instance.on('error', (event: { error?: Error }) => {
        const message = event.error?.message ?? 'unknown map error';
        if (/webgl/i.test(message)) setFailure('webgl');
      });

      instance.on('load', () => {
        if (!instance) return;
        ready.current = true;
        setSlow(false);
        if (!instance.getSource('corridor')) {
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
        }

        const bounds = boundsOf(stations);
        if (bounds) instance.fitBounds(bounds, { padding: 56, duration: 0 });
      });
    };

    void start();

    const trainMarkers = markers.current;
    return () => {
      cancelled = true;
      if (warningTimer) window.clearTimeout(warningTimer);
      trainMarkers.clear();
      stationMarkers.current = [];
      ready.current = false;
      instance?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Corridor line and station labels follow the data, not the map lifecycle.
  useEffect(() => {
    const instance = map.current;
    const maplibregl = lib.current;
    if (!instance || !maplibregl) return;

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
  }, [stations, generation]);

  // Train markers: moved, never recreated, so the triangle glides.
  useEffect(() => {
    const instance = map.current;
    const maplibregl = lib.current;
    if (!instance || !maplibregl) return;

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
  }, [trains, onSelectTrain, generation]);

  // Re-fit when the corridor changes.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !fitKey) return;
    const bounds = boundsOf(stations);
    if (!bounds) return;
    const run = () => instance.fitBounds(bounds, { padding: 56, duration: 600 });
    if (ready.current) run();
    else instance.once('load', run);
  }, [fitKey, stations, generation]);

  const copy =
    failure === 'library'
      ? {
          title: t('map.libraryTitle'),
          body: t('map.libraryBody'),
          hint: t('map.libraryHint'),
        }
      : { title: t('map.webglTitle'), body: t('map.webglBody'), hint: t('map.webglHint') };

  return (
    <div className="rp-map-wrap">
      <div ref={container} className="rp-map" aria-label={t('map.mapLabel')} role="application" />

      {failure ? (
        <div className="rp-map-fallback" role="alert">
          <p className="rp-map-fallback__title">{copy.title}</p>
          <p className="rp-map-fallback__body">{copy.body}</p>
          <p className="rp-map-fallback__hint">{copy.hint}</p>
          <button
            type="button"
            className="rp-button rp-button--small"
            onClick={() => {
              setAttempt((value) => value + 1);
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {!failure && slow ? (
        <div className="rp-map-note" role="status">
          {t('map.tilesSlow')}
        </div>
      ) : null}
    </div>
  );
}
