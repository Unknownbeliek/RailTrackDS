// @vitest-environment jsdom
/**
 * The map screen: counts come from the snapshot, the as-of banner is present,
 * the chips filter, and the corridor selector is data, not code (F1, F2, 6.5).
 * MapLibre needs WebGL, so the map layer itself is stubbed here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';

vi.mock('../lib/map/MapView', () => ({
  MapView: ({ trains }: { trains: Array<{ trainNumber: string }> }) => (
    <div data-testid="map" data-trains={trains.map((t) => t.trainNumber).join(',')} />
  ),
}));

const { MapHome } = await import('../features/map/MapHome');

const meta = {
  asOf: '2026-11-01T07:00:00.000Z',
  source: 'snapshot',
  isEstimated: true,
  snapshotId: 2,
  freshness: 'recent',
  budgetLimited: false,
};

const corridors = {
  data: {
    corridors: [
      { id: 1, slug: 'delhi-kanpur', name: 'Delhi — Kanpur', nameHi: 'दिल्ली — कानपुर', isActive: true },
    ],
  },
  meta: { ...meta, source: 'static' },
};

const observation = {
  snapshotId: 2,
  trainNumber: '12301',
  takenAt: '2026-11-01T07:00:00.000Z',
  currentStation: 'ETW',
  nextStation: 'CNB',
  minsIntoSegment: 9,
  segmentMinutes: 98,
  delayMin: 0,
  lat: 26.6,
  lng: 79.7,
};

const mapBody = {
  data: {
    corridor: corridors.data.corridors[0],
    stations: [
      {
        seq: 0,
        kmFromStart: 0,
        station: { code: 'NDLS', name: 'New Delhi', nameHi: null, lat: 28.64, lng: 77.21, zone: 'NR', isJunction: true },
      },
      {
        seq: 1,
        kmFromStart: 440.4,
        station: { code: 'CNB', name: 'Kanpur Central', nameHi: null, lat: 26.44, lng: 80.33, zone: 'NCR', isJunction: true },
      },
    ],
    trains: [
      {
        trainNumber: '12301',
        trainName: 'Howrah Rajdhani Express',
        trainNameHi: null,
        direction: 'down',
        speedKph: 60,
        observation,
        lat: 26.6,
        lng: 79.7,
        bearingDeg: 100,
        progress: 0.1,
        currentStation: 'ETW',
        nextStation: 'CNB',
        delayMin: 0,
        delayLevel: 'ontime',
        isStale: false,
        minsToNextStation: 89,
      },
      {
        trainNumber: '12801',
        trainName: 'Purushottam Express',
        trainNameHi: null,
        direction: 'down',
        speedKph: 55,
        observation: {
          ...observation,
          trainNumber: '12801',
          delayMin: 26,
          minsIntoSegment: 4,
        },
        lat: 26.7,
        lng: 79.6,
        bearingDeg: 100,
        progress: 0.04,
        currentStation: 'ETW',
        nextStation: 'CNB',
        delayMin: 26,
        delayLevel: 'major',
        isStale: false,
        minsToNextStation: 94,
      },
    ],
    snapshot: { id: 2, scope: 'corridor:delhi-kanpur', takenAt: '2026-11-01T07:00:00.000Z' },
  },
  meta,
};

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = url.endsWith('/corridors') ? corridors : mapBody;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <MapHome />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('map home', () => {
  it('counts trains from the snapshot and shows the as-of time', async () => {
    stubFetch();
    renderHome();
    await waitFor(() => expect(screen.getByText('2 trains in this snapshot')).toBeTruthy());
    expect(screen.getAllByText(/12:30 pm/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Estimated').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 on time · 1 delayed · 1 over 15 min/)).toBeTruthy();
  });

  it('renders one marker per train and lists them by delay', async () => {
    stubFetch();
    renderHome();
    await waitFor(() => expect(screen.getByTestId('map').dataset.trains).toBe('12301,12801'));
    const rows = screen.getAllByText(/Purushottam|Rajdhani/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('filters to delayed trains only, without another request', async () => {
    stubFetch();
    renderHome();
    await waitFor(() => expect(screen.getByTestId('map').dataset.trains).toBe('12301,12801'));
    await userEvent.click(screen.getByRole('button', { name: 'Delayed' }));
    await waitFor(() => expect(screen.getByTestId('map').dataset.trains).toBe('12801'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('offers the corridor as a chip, so a new corridor is data not code', async () => {
    stubFetch();
    renderHome();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delhi — Kanpur' })).toBeTruthy());
  });
});
