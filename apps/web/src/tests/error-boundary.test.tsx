// @vitest-environment jsdom
/**
 * A broken screen must not become a white page. The screenshot that prompted
 * this showed nothing at all — no tab bar, no message — because one import
 * failed and took the module graph with it. The boundary is the floor: whatever
 * else goes wrong inside the app, the user gets words and a way back.
 */
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../i18n';
import { ErrorBoundary } from '../components/ErrorBoundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('maplibre-gl has no default export');
  return <p>the app is fine</p>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('the app is fine')).toBeTruthy();
  });

  it('shows what happened instead of an empty page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/Something on this screen broke/i);
    expect(alert.textContent).toMatch(/maplibre-gl has no default export/);
    expect(screen.getByRole('button', { name: /reload the page/i })).toBeTruthy();
  });

  it('renders the screen again when the user asks to try again', async () => {
    const crashLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const crashes = () => crashLog.mock.calls.filter((call) => String(call[0]).includes('RailPulse')).length;

    function AlwaysBoom(): ReactElement {
      throw new Error('still broken');
    }

    render(
      <ErrorBoundary>
        <AlwaysBoom />
      </ErrorBoundary>,
    );
    const before = crashes();
    expect(before).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    // Retry means "render it again", not "pretend it worked": the same fault
    // reports itself a second time and the panel stays, with the message.
    expect(crashes()).toBeGreaterThan(before);
    expect(screen.getByRole('alert').textContent).toMatch(/still broken/);
  });
});
