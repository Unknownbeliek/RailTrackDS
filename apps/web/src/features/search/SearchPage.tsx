/**
 * F3 search. Runs against our own database, so it costs no provider requests
 * and results appear as the user types.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { SEARCH_MIN_CHARS } from '@railpulse/shared';
import { apiClient } from '../../lib/api';
import { Card, EmptyState, ErrorState, SectionTitle } from '../../components/ui';
import { DelayPill } from '../../components/DelayPill';
import { currentLanguage } from '../../i18n';

const RECENT_KEY = 'railpulse.recentSearches';

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function SearchPage() {
  const { t } = useTranslation();
  const language = currentLanguage();
  const [term, setTerm] = useState('');
  const [recent, setRecent] = useState<string[]>(readRecent);
  const trimmed = term.trim();

  const results = useQuery({
    queryKey: ['search', trimmed],
    queryFn: () => apiClient.search(trimmed),
    enabled: trimmed.length >= SEARCH_MIN_CHARS,
  });

  useEffect(() => {
    if (trimmed.length < SEARCH_MIN_CHARS) return;
    const id = window.setTimeout(() => {
      const next = [trimmed, ...readRecent().filter((entry) => entry !== trimmed)].slice(0, 5);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      setRecent(next);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [trimmed]);

  return (
    <div className="rp-screen">
      <h1 className="rp-title">{t('search.title')}</h1>
      <p className="rp-subtitle">{t('search.hint')}</p>

      <label htmlFor="search-input" className="rp-eyebrow" style={{ display: 'block', marginTop: 'var(--rp-space-lg)' }}>
        {t('search.title')}
      </label>
      <input
        id="search-input"
        className="rp-input"
        type="search"
        autoFocus
        value={term}
        placeholder={t('search.placeholder')}
        onChange={(event) => setTerm(event.target.value)}
        enterKeyHint="search"
      />

      {trimmed.length > 0 && trimmed.length < SEARCH_MIN_CHARS ? (
        <p className="rp-subtitle">{t('search.minChars')}</p>
      ) : null}

      {recent.length > 0 && trimmed.length === 0 ? (
        <>
          <SectionTitle>{t('search.recent')}</SectionTitle>
          <div className="rp-chip-row">
            {recent.map((entry) => (
              <button key={entry} type="button" className="rp-chip" onClick={() => setTerm(entry)}>
                {entry}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {results.isError ? (
        <div style={{ marginTop: 'var(--rp-space-lg)' }}>
          <ErrorState message={(results.error as Error).message} onRetry={() => void results.refetch()} />
        </div>
      ) : null}

      {results.data ? (
        <>
          {results.data.data.trains.length > 0 ? (
            <>
              <SectionTitle>{t('search.trains')}</SectionTitle>
              <Card>
                <div className="rp-list">
                  {results.data.data.trains.map((train) => (
                    <Link key={train.number} to={`/trains/${train.number}`} className="rp-list-item">
                      <span>
                        <p className="rp-list-item__title">
                          {language === 'hi' && train.nameHi ? train.nameHi : train.name}
                        </p>
                        <p className="rp-list-item__meta">
                          {train.number} · {train.category}
                          {train.sourceStation ? ` · ${train.sourceStation.code} → ${train.destinationStation?.code ?? ''}` : ''}
                        </p>
                      </span>
                      <span aria-hidden>›</span>
                    </Link>
                  ))}
                </div>
              </Card>
            </>
          ) : null}

          {results.data.data.stations.length > 0 ? (
            <>
              <SectionTitle>{t('search.stations')}</SectionTitle>
              <Card>
                <div className="rp-list">
                  {results.data.data.stations.map((station) => (
                    <div key={station.code} className="rp-list-item">
                      <span>
                        <p className="rp-list-item__title">
                          {language === 'hi' && station.nameHi ? station.nameHi : station.name}
                        </p>
                        <p className="rp-list-item__meta">
                          {station.code}
                          {station.zone ? ` · ${station.zone}` : ''}
                        </p>
                      </span>
                      {station.corridorSlug ? <span className="rp-badge">{t('map.corridor')}</span> : null}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : null}

          {results.data.data.trains.length + results.data.data.stations.length === 0 ? (
            <div style={{ marginTop: 'var(--rp-space-lg)' }}>
              <EmptyState title={t('search.noResults', { term: trimmed })} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Small helper kept here so the map screen and this page agree on filtering. */
export function SearchHint({ delayMin }: { delayMin: number }) {
  return <DelayPill delayMin={delayMin} level={delayMin >= 15 ? 'major' : delayMin >= 5 ? 'slight' : 'ontime'} />;
}
