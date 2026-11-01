/**
 * F1 corridor map + F2 corridor selector (sections 5 and 6).
 * Map first: the map fills the screen and everything else floats above it.
 * Counts come from the chosen snapshot, never from a mockup.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { AsOfBanner, StaleNote } from '../../components/AsOfBanner';
import { Chip, EmptyState, ErrorState, Loading } from '../../components/ui';
import { Sheet, type SheetState } from '../../components/Sheet';
import { DelayPill } from '../../components/DelayPill';
import { LanguageToggle } from '../../components/LanguageToggle';
import { MapView } from '../../lib/map/MapView';
import { positionTime, toMarkers } from '../../lib/positions';
import { useNow } from '../../lib/useNow';
import { currentLanguage } from '../../i18n';
import { formatClock, formatDelay } from '../../lib/format';

type Filter = 'all' | 'delayed' | 'express';

export function MapHome() {
  const { t } = useTranslation();
  const language = currentLanguage();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const corridorSlug = params.slug ?? search.get('corridor') ?? undefined;
  const [filter, setFilter] = useState<Filter>('all');
  const [sheet, setSheet] = useState<SheetState>('peek');
  const [fitKey, setFitKey] = useState(0);
  const now = useNow(1000);

  const corridors = useQuery({ queryKey: ['corridors'], queryFn: () => apiClient.corridors() });
  const activeSlug = corridorSlug ?? corridors.data?.data.corridors[0]?.slug;

  const map = useQuery({
    queryKey: ['map', activeSlug],
    queryFn: () => apiClient.map(activeSlug as string),
    enabled: Boolean(activeSlug),
    refetchInterval: 60_000,
  });

  const meta = map.data?.meta;
  // Wrapped so the memo below does not see a new array on every render.
  const stations = useMemo(() => map.data?.data.stations ?? [], [map.data]);
  const trains = useMemo(() => map.data?.data.trains ?? [], [map.data]);

  const visible = useMemo(() => {
    if (filter === 'delayed') return trains.filter((train) => train.delayMin >= 5);
    if (filter === 'express') {
      return trains.filter((train) => ['RAJ', 'SHATABDI', 'SF', 'DURONTO'].includes(headCategory(train.trainName)));
    }
    return trains;
  }, [filter, trains]);

  const markers = useMemo(() => {
    if (!meta) return [];
    return toMarkers(visible, stations, positionTime(meta, now), search.get('train') ?? undefined);
  }, [visible, stations, meta, now, search]);

  if (corridors.isPending) return <div className="rp-screen"><Loading /></div>;
  if (corridors.isError) {
    return (
      <div className="rp-screen">
        <ErrorState message={(corridors.error as Error).message} onRetry={() => void corridors.refetch()} />
      </div>
    );
  }

  const corridorList = corridors.data.data.corridors;
  if (corridorList.length === 0) {
    return (
      <div className="rp-screen">
        <EmptyState title={t('map.noSnapshot')} body={t('map.noSnapshotBody')} />
      </div>
    );
  }

  const counts = {
    total: trains.length,
    delayed: trains.filter((t2) => t2.delayMin >= 5).length,
    major: trains.filter((t2) => t2.delayMin >= 15).length,
    onTime: trains.filter((t2) => t2.delayMin < 5).length,
  };

  const selectCorridor = (slug: string) => {
    const next = new URLSearchParams(search);
    next.set('corridor', slug);
    setSearch(next, { replace: true });
    setFitKey((key) => key + 1);
  };

  return (
    <div className="rp-app rp-app--fill">
      <div className="rp-map-wrap">
        <MapView
          stations={stations}
          trains={markers}
          fitKey={`${activeSlug}-${fitKey}`}
          onSelectTrain={(number) => {
            const next = new URLSearchParams(search);
            next.set('train', number);
            setSearch(next, { replace: true });
            setSheet('half');
          }}
        />
      </div>

      <div className="rp-map-overlay">
        <Link to="/search" className="rp-floating rp-search" aria-label={t('map.searchPlaceholder')}>
          <span aria-hidden>🔎</span>
          <span>{t('map.searchPlaceholder')}</span>
        </Link>

        <div className="rp-chip-row" role="group" aria-label={t('chips.all')}>
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('chips.all')}
          </Chip>
          <Chip active={filter === 'delayed'} onClick={() => setFilter('delayed')}>
            {t('chips.delayed')}
          </Chip>
          <Chip active={filter === 'express'} onClick={() => setFilter('express')}>
            {t('chips.express')}
          </Chip>
        </div>

        <div className="rp-chip-row" role="group" aria-label={t('map.corridor')}>
          {corridorList.map((corridor) => (
            <Chip
              key={corridor.slug}
              active={corridor.slug === activeSlug}
              onClick={() => selectCorridor(corridor.slug)}
            >
              {language === 'hi' && corridor.nameHi ? corridor.nameHi : corridor.name}
            </Chip>
          ))}
        </div>

        {meta ? <AsOfBanner meta={meta} now={now} language={language} /> : null}

        <div className="rp-row rp-row--between">
          <span className="rp-badge" style={{ background: 'var(--rp-color-surface)' }}>
            {t('map.tapTrain')}
          </span>
          <LanguageToggle />
        </div>
      </div>

      <div className="rp-map-buttons">
        <button
          type="button"
          className="rp-map-button"
          aria-label={t('map.recentre')}
          onClick={() => setFitKey((key) => key + 1)}
        >
          <span aria-hidden>🛤️</span>
        </button>
      </div>

      <Sheet
        state={sheet}
        onToggle={() => setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek')}
        header={
          <div style={{ paddingBottom: 'var(--rp-space-sm)' }}>
            {map.isPending ? <p className="rp-subtitle">{t('common.loading')}…</p> : null}
            {map.isError ? (
              <ErrorState message={(map.error as Error).message} onRetry={() => void map.refetch()} />
            ) : null}
            {meta && !map.isError ? (
              <>
                <div className="rp-row rp-row--between">
                  <div>
                    <p className="rp-eyebrow" style={{ margin: 0 }}>
                      {t('map.snapshot')} · {formatClock(meta.asOf, language)}
                    </p>
                    <p className="rp-title" style={{ fontSize: 'var(--rp-font-sheet-title)' }}>
                      {t('map.counts', { trains: counts.total })}
                    </p>
                  </div>
                  <span className="rp-badge rp-badge--estimated">{t('map.estimated')}</span>
                </div>
                <p className="rp-subtitle">
                  {t('map.countsDetail', {
                    onTime: counts.onTime,
                    delayed: counts.delayed,
                    major: counts.major,
                  })}
                </p>
                <StaleNote meta={meta} />
              </>
            ) : null}
          </div>
        }
      >
        {trains.length === 0 && !map.isPending ? (
          <EmptyState title={t('map.noSnapshot')} body={t('map.noSnapshotBody')} />
        ) : null}

        <div className="rp-list">
          {visible
            .slice()
            .sort((a, b) => b.delayMin - a.delayMin)
            .map((train) => (
              <Link
                key={train.trainNumber}
                to={`/trains/${train.trainNumber}${activeSlug ? `?corridor=${activeSlug}` : ''}`}
                className="rp-list-item"
              >
                <span>
                  <p className="rp-list-item__title">
                    {language === 'hi' && train.trainNameHi ? train.trainNameHi : train.trainName}
                  </p>
                  <p className="rp-list-item__meta">
                    {train.trainNumber} · {formatDelay(train.delayMin)} ·{' '}
                    {t('train.toNext', { count: train.minsToNextStation })}
                    {train.isStale ? ` · ${t('train.stale')}` : ''}
                  </p>
                </span>
                <DelayPill delayMin={train.delayMin} level={train.delayLevel} />
              </Link>
            ))}
        </div>
      </Sheet>
    </div>
  );
}

/** Cheap category hint from the name, only for the "Express" filter chip. */
function headCategory(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('RAJDHANI')) return 'RAJ';
  if (upper.includes('SHATABDI')) return 'SHATABDI';
  if (upper.includes('EXPRESS')) return 'SF';
  return 'OTHER';
}
