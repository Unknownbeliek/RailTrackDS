// @vitest-environment jsdom
/**
 * Page test: the train detail screen renders real API shapes, including the
 * "not running" state, the disabled alert button and the share flow.
 * The network is stubbed with a saved shape, so no test hits a server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { TrainDetailResponse } from '@railpulse/shared';
import '../i18n';
import { TrainDetailPage } from '../features/train-detail/TrainDetailPage';

const meta = {
  asOf: '2026-11-01T07:00:00.000Z',
  source: 'snapshot' as const,
  isEstimated: true,
  snapshotId: 2,
  freshness: 'old' as const,
  budgetLimited: false,
};

const trainResponse: TrainDetailResponse = {
  data: {
    train: {
      number: '64101',
      name: 'Kanpur MEMU',
      nameHi: 'कानपुर मेमू',
      category: 'MEMU',
      priority: 7,
    },
    stations: { source: null, destination: null },
    stops: [
      {
        seq: 0,
        stationCode: 'NDLS',
        stationName: 'New Delhi',
        arrivalMin: null,
        departureMin: 680,
        arrivalDay: 0,
        departureDay: 0,
        distanceKm: 0,
        isHalt: false,
        platform: null,
        actualArrivalMin: null,
        actualDepartureMin: null,
        delayMin: null,
      },
      {
        seq: 1,
        stationCode: 'GZB',
        stationName: 'Ghaziabad',
        arrivalMin: 714,
        departureMin: 715,
        arrivalDay: 0,
        departureDay: 0,
        distanceKm: 25.6,
        isHalt: true,
        platform: null,
        actualArrivalMin: null,
        actualDepartureMin: null,
        delayMin: null,
      },
    ],
    position: {
      trainNumber: '64101',
      lat: 28.65,
      lng: 77.33,
      bearingDeg: 84,
      progress: 0.5,
      currentStation: 'NDLS',
      nextStation: 'GZB',
      delayMin: 28,
      delayLevel: 'major',
      isStale: false,
      minsToNextStation: 16,
    },
    direction: 'down',
    speedKph: 42,
    runningInLatestSnapshot: true,
    reason: {
      rule: 'R1',
      label: 'likely',
      evidence: { blockedByTrain: '12002', distanceKm: 6.4, gapMin: 30 },
    },
    reasonAvailable: true,
    history: [
      { stationCode: 'GZB', stationName: 'Ghaziabad', avgArrDelayMin: 8.4, samples: 12, onTimeRatio: 0.25 },
    ],
  },
  meta,
};

function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const key = Object.keys(routes).find((candidate) => url.includes(candidate));
      if (!key) {
        return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'no' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(routes[key]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/trains/64101']}>
        <Routes>
          <Route path="/trains/:number" element={<TrainDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stubFetch({ '/trains/64101': trainResponse });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('train detail page', () => {
  it('shows the delay, the reason and the as-of time together', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Kanpur MEMU')).toBeTruthy());
    expect(screen.getByText('+28')).toBeTruthy();
    expect(screen.getByText('Likely')).toBeTruthy();
    expect(screen.getByText(/Waiting for a faster train/)).toBeTruthy();
    expect(screen.getByText(/Stale data/)).toBeTruthy();
    expect(screen.getByText('New Delhi')).toBeTruthy();
    expect(screen.getAllByText('Ghaziabad').length).toBeGreaterThan(0);
  });

  it('disables the alert button and says it comes later', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Set alert')).toBeTruthy());
    const alert = screen.getByText('Set alert').closest('button');
    expect(alert?.disabled).toBe(true);
    expect(screen.getByText('Coming later')).toBeTruthy();
  });

  it('creates a share link and confirms it to the user', async () => {
    stubFetch({
      '/trains/64101': trainResponse,
      '/share': {
        data: {
          code: 'ABCDEFGHJK',
          url: 'https://railpulse.test/share/ABCDEFGHJK',
          expiresAt: '2026-11-08T07:00:00.000Z',
        },
        meta,
      },
    });
    renderPage();
    const shareButton = await waitFor(() => screen.getByText('Share'));
    await userEvent.click(shareButton);
    await waitFor(() =>
      expect(screen.getByText('https://railpulse.test/share/ABCDEFGHJK')).toBeTruthy(),
    );
    expect(screen.getByText(/Links expire after 7 days/)).toBeTruthy();
  });

  it('says the train is not in the latest snapshot instead of guessing', async () => {
    stubFetch({
      '/trains/64101': {
        ...trainResponse,
        data: {
          ...trainResponse.data,
          position: null,
          direction: null,
          speedKph: null,
          runningInLatestSnapshot: false,
          reason: null,
          reasonAvailable: false,
        },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Not running in the latest snapshot')).toBeTruthy(),
    );
  });
});
