/**
 * F7 replay: choose a day, press play, and trains move between recorded
 * snapshots. Clearly labelled Replay everywhere, because it is a recording.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import { AsOfBanner } from '../../components/AsOfBanner';
import { Chip, EmptyState, ErrorState, Loading } from '../../components/ui';
import { MapView } from '../../lib/map/MapView';
import { toMarkers, type MapTrainResponse } from '../../lib/positions';
import { currentLanguage } from '../../i18n';
import { formatClock, formatDay, todayIso } from '../../lib/format';

const SPEEDS = [1, 10, 60] as const;
/** 1x plays a recorded minute per second, so a 30 minute gap takes 30 s. */
const BASE_RATE = 60;

export function ReplayPage() {
  const { t } = useTranslation();
  const language = currentLanguage();
  const [date, setDate] = useState(() => todayIso());
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(10);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);

  const corridors = useQuery({ queryKey: ['corridors'], queryFn: () => apiClient.corridors() });
  const [slug, setSlug] = useState<string | null>(null);
  const activeSlug = slug ?? corridors.data?.data.corridors[0]?.slug ?? null;

  const snapshots = useQuery({
    queryKey: ['snapshots', activeSlug, date],
    queryFn: () => apiClient.snapshots(activeSlug as string, date),
    enabled: Boolean(activeSlug),
  });

  const list = snapshots.data?.data.snapshots ?? [];
  const first = list[0];
  const last = list[list.length - 1];

  // Start at the first recorded instant of the chosen day.
  useEffect(() => {
    if (first && cursor === null) setCursor(new Date(first.takenAt).getTime());
  }, [first, cursor]);

  // Playback: walk the simulated clock between the first and last snapshot.
  useEffect(() => {
    if (!playing || !first || !last) return;
    let raf = 0;
    let previous = performance.now();
    const tick = (time: number) => {
      const deltaMs = time - previous;
      previous = time;
      setCursor((current) => {
        const base = current ?? new Date(first.takenAt).getTime();
        const next = base + deltaMs * BASE_RATE * speed;
        const end = new Date(last.takenAt).getTime();
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, first, last, speed]);

  const cursorDate = cursor ? new Date(cursor) : first ? new Date(first.takenAt) : new Date();
  const activeSnapshot = useMemo(() => {
    const eligible = list.filter((snapshot) => new Date(snapshot.takenAt).getTime() <= cursorDate.getTime());
    return eligible[eligible.length - 1] ?? first;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, cursorDate.getTime()]);

  const map = useQuery({
    queryKey: ['replay-map', activeSlug, activeSnapshot?.id],
    queryFn: () => apiClient.map(activeSlug as string, { snapshot: String(activeSnapshot?.id) }),
    enabled: Boolean(activeSlug && activeSnapshot),
  });

  const stations = map.data?.data.stations ?? [];
  const trains = (map.data?.data.trains ?? []) as MapTrainResponse[];
  const markers = useMemo(
    () => toMarkers(trains, stations, cursorDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trains, stations, cursorDate.getTime()],
  );

  const start = first ? new Date(first.takenAt).getTime() : 0;
  const end = last ? new Date(last.takenAt).getTime() : 0;

  return (
    <div className="rp-app" style={{ position: 'relative' }}>
      <div className="rp-map-wrap">
        <MapView stations={stations} trains={markers} fitKey={activeSlug ?? undefined} />
      </div>

      <div className="rp-map-overlay">
        <div className="rp-floating" style={{ padding: 'var(--rp-space-md)' }}>
          <div className="rp-row rp-row--between">
            <p className="rp-eyebrow" style={{ margin: 0 }}>
              {t('replay.title')} · {t('replay.label')}
            </p>
            <span className="rp-badge rp-badge--replay">{t('replay.label')}</span>
          </div>
          <p className="rp-title" style={{ fontSize: 'var(--rp-font-body)' }}>
            {list.length ? formatDay(list[0]!.takenAt, language) : formatDay(new Date().toISOString(), language)}
          </p>
          <p className="rp-subtitle">
            {snapshots.isPending ? `${t('common.loading')}…` : t('replay.positions', { count: list.length })}
          </p>
        </div>

        <div className="rp-chip-row" role="group" aria-label={t('map.corridor')}>
          {(corridors.data?.data.corridors ?? []).map((corridor) => (
            <Chip key={corridor.slug} active={corridor.slug === activeSlug} onClick={() => setSlug(corridor.slug)}>
              {language === 'hi' && corridor.nameHi ? corridor.nameHi : corridor.name}
            </Chip>
          ))}
        </div>

        {snapshots.data ? (
          <AsOfBanner meta={snapshots.data.meta} now={new Date()} language={language} compact />
        ) : null}
      </div>

      <div className="rp-replay-bar">
        {snapshots.isError ? (
          <ErrorState message={(snapshots.error as Error).message} onRetry={() => void snapshots.refetch()} />
        ) : null}
        {snapshots.data && list.length === 0 ? (
          <EmptyState title={t('replay.noRecording')} />
        ) : null}
        {map.isPending && list.length > 0 ? <Loading /> : null}

        <label className="rp-row rp-row--between" htmlFor="replay-scrubber">
          <span className="rp-eyebrow" style={{ margin: 0 }}>
            {t('replay.day')}
          </span>
          <input
            id="replay-day"
            type="date"
            className="rp-input"
            style={{ width: 'auto', minHeight: 36 }}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setCursor(null);
              setPlaying(false);
            }}
          />
        </label>

        <input
          id="replay-scrubber"
          className="rp-scrubber"
          type="range"
          min={start}
          max={end || start + 1}
          step={1000}
          value={cursorDate.getTime()}
          disabled={!first || !last || start === end}
          aria-valuetext={formatClock(cursorDate.toISOString(), language)}
          onChange={(event) => {
            setPlaying(false);
            setCursor(Number(event.target.value));
          }}
        />

        <div className="rp-row rp-row--between" style={{ flexWrap: 'wrap' }}>
          <div className="rp-row">
            <button
              type="button"
              className="rp-button rp-button--primary rp-button--small"
              onClick={() => {
                if (!playing && last && cursorDate.getTime() >= new Date(last.takenAt).getTime()) {
                  setCursor(first ? new Date(first.takenAt).getTime() : null);
                }
                setPlaying((value) => !value);
              }}
              disabled={!first || start === end}
            >
              {playing ? `⏸ ${t('replay.pause')}` : `▶ ${t('replay.play')}`}
            </button>
            <span className="rp-muted" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
              {formatClock(cursorDate.toISOString(), language)}
            </span>
          </div>
          <div className="rp-chip-row" role="group" aria-label={t('replay.speed')}>
            {SPEEDS.map((value) => (
              <Chip key={value} active={speed === value} onClick={() => setSpeed(value)}>
                {value}×
              </Chip>
            ))}
          </div>
        </div>
        <p className="rp-muted" style={{ fontSize: 11, margin: 0 }}>
          {t('replay.subtitle')}
        </p>
      </div>
    </div>
  );
}
