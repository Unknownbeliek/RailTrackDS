// @vitest-environment jsdom
/**
 * UI tests for the pieces that carry the honesty rules: the as-of banner,
 * the delay pill and the reason card (section 14).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '../i18n';
import { setLanguage } from '../i18n';
import { AsOfBanner } from '../components/AsOfBanner';
import { DelayPill } from '../components/DelayPill';
import { ReasonCard } from '../components/ReasonCard';
import type { Meta } from '@railpulse/shared';

const baseMeta: Meta = {
  asOf: '2026-11-01T07:00:00.000Z',
  source: 'snapshot',
  isEstimated: true,
  snapshotId: 2,
  freshness: 'recent',
  budgetLimited: false,
};

afterEach(() => {
  cleanup();
  setLanguage('en');
});

describe('AsOfBanner', () => {
  it('shows the as-of clock, the freshness and the Estimated tag', () => {
    render(<AsOfBanner meta={baseMeta} now={new Date('2026-11-01T07:05:00.000Z')} language="en" />);
    expect(screen.getByText('12:30 pm')).toBeTruthy();
    expect(screen.getByText(/Recent/)).toBeTruthy();
    expect(screen.getByText('Estimated')).toBeTruthy();
  });

  it('marks an old snapshot as stale data', () => {
    render(
      <AsOfBanner
        meta={{ ...baseMeta, freshness: 'old' }}
        now={new Date('2026-11-01T12:00:00.000Z')}
        language="en"
      />,
    );
    expect(screen.getByText('Stale data')).toBeTruthy();
    expect(screen.getByText(/4 h 60 min ago|5 h/)).toBeTruthy();
  });

  it('says Replay instead of Estimated when replaying', () => {
    render(
      <AsOfBanner
        meta={{ ...baseMeta, source: 'replay' }}
        now={new Date('2026-11-01T07:05:00.000Z')}
        language="en"
      />,
    );
    expect(screen.getByText('Replay')).toBeTruthy();
    expect(screen.queryByText('Estimated')).toBeNull();
  });

  it('speaks Hindi when asked', () => {
    setLanguage('hi');
    render(<AsOfBanner meta={baseMeta} now={new Date('2026-11-01T07:05:00.000Z')} language="hi" />);
    expect(screen.getByText('अनुमानित')).toBeTruthy();
  });
});

describe('DelayPill', () => {
  it('never relies on colour alone', () => {
    render(<DelayPill delayMin={18} level="major" />);
    expect(screen.getByText(/Major delay/)).toBeTruthy();
    expect(screen.getByText(/\+18 min/)).toBeTruthy();
  });

  it('says on time without a number when there is no delay', () => {
    render(<DelayPill delayMin={0} level="ontime" />);
    expect(screen.getByText('On time')).toBeTruthy();
  });
});

describe('ReasonCard', () => {
  it('is honest when snapshots are too far apart', () => {
    render(<ReasonCard reason={null} available={false} />);
    expect(screen.getByText(/Not enough fresh data/)).toBeTruthy();
  });

  it('shows Likely with the evidence it used', () => {
    render(
      <ReasonCard
        available
        reason={{
          rule: 'R1',
          label: 'likely',
          evidence: { blockedByTrain: '12002', distanceKm: 6.4, gapMin: 30 },
        }}
      />,
    );
    expect(screen.getByText('Likely')).toBeTruthy();
    expect(screen.getByText(/Waiting for a faster train/)).toBeTruthy();
    expect(screen.getByText(/12002 is 6 km behind/)).toBeTruthy();
  });

  it('says Unknown rather than inventing a percentage', () => {
    render(<ReasonCard available reason={{ rule: 'R4', label: 'unknown', evidence: { gapMin: 30 } }} />);
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
