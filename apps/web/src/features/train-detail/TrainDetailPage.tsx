/**
 * F4 train detail (section 6.2): delay card, reason card, forecast tiles,
 * the station list and Share / Alert buttons. Alerts are Phase 3, so the
 * button says "Coming later" instead of pretending (section 6.5).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { AsOfBanner, StaleNote } from '../../components/AsOfBanner';
import { ReasonCard } from '../../components/ReasonCard';
import { StationRow } from '../../components/StationRow';
import { Button, Card, EmptyState, ErrorState, Loading, SectionTitle } from '../../components/ui';
import { DelayNumber, DelayPill } from '../../components/DelayPill';
import { currentLanguage } from '../../i18n';
import { formatClock, formatDelay, formatDistance } from '../../lib/format';
import { useNow } from '../../lib/useNow';

export function TrainDetailPage() {
  const { number = '' } = useParams();
  const [search] = useSearchParams();
  const { t } = useTranslation();
  const language = currentLanguage();
  const now = useNow(5000);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const train = useQuery({ queryKey: ['train', number], queryFn: () => apiClient.train(number) });
  const nearby = useQuery({
    queryKey: ['nearby', number],
    queryFn: () => apiClient.nearby(number),
    retry: false,
  });

  const share = useMutation({
    mutationFn: () => apiClient.createShare(number, new Date().toISOString().slice(0, 10)),
    onSuccess: (response) => setShareCode(response.data.url),
  });

  if (train.isPending) {
    return (
      <div className="rp-screen">
        <Loading />
      </div>
    );
  }
  if (train.isError) {
    return (
      <div className="rp-screen">
        <ErrorState message={(train.error as Error).message} onRetry={() => void train.refetch()} />
      </div>
    );
  }

  const { data, meta } = train.data;
  const position = data.position;
  const stops = data.stops;
  const currentSeq = stops.find((stop) => stop.stationCode === position?.currentStation)?.seq ?? -1;

  return (
    <div className="rp-screen">
      <Link
        to={`/${search.get('corridor') ? `?corridor=${search.get('corridor')}` : ''}`}
        className="rp-button rp-button--ghost rp-button--small"
        style={{ marginBottom: 'var(--rp-space-md)' }}
      >
        ← {t('train.back')}
      </Link>

      <AsOfBanner meta={meta} now={now} language={language} />

      <Card className="rp-card" as="section">
        <p className="rp-eyebrow">
          {data.train.number} · {data.train.category}
        </p>
        <h1 className="rp-title">
          {language === 'hi' && data.train.nameHi ? data.train.nameHi : data.train.name}
        </h1>

        {position ? (
          <>
            <div className="rp-delay-card" style={{ marginTop: 'var(--rp-space-lg)' }}>
              <DelayNumber delayMin={position.delayMin} level={position.delayLevel} />
              <div>
                <DelayPill delayMin={position.delayMin} level={position.delayLevel} />
                <p className="rp-subtitle">
                  {t('train.current', {
                    from: stops.find((s) => s.stationCode === position.currentStation)?.stationName ?? position.currentStation,
                    to: stops.find((s) => s.stationCode === position.nextStation)?.stationName ?? position.nextStation,
                  })}
                </p>
                {position.isStale ? (
                  <p className="rp-subtitle" style={{ color: 'var(--rp-delay-bad-deep)' }}>
                    {t('train.stale')}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rp-tiles" style={{ marginTop: 'var(--rp-space-lg)' }}>
              <div className="rp-tile">
                <p className="rp-tile__label">{t('train.next')}</p>
                <p className="rp-tile__value">
                  {stops.find((s) => s.stationCode === position.nextStation)?.stationCode ?? position.nextStation}
                </p>
                <p className="rp-subtitle" style={{ margin: 0 }}>
                  {t('train.toNext', { count: position.minsToNextStation })}
                </p>
              </div>
              <div className="rp-tile">
                <p className="rp-tile__label">{t('train.speed')}</p>
                <p className="rp-tile__value">{data.speedKph ?? '—'}</p>
                <p className="rp-subtitle" style={{ margin: 0 }}>
                  km/h
                </p>
              </div>
              <div className="rp-tile">
                <p className="rp-tile__label">{t('train.direction')}</p>
                <p className="rp-tile__value" style={{ fontSize: 15 }}>
                  {data.direction === 'up' ? t('train.up') : t('train.down')}
                </p>
                <p className="rp-subtitle" style={{ margin: 0 }}>
                  {data.stations.source?.code} → {data.stations.destination?.code}
                </p>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title={t('train.notRunning')} body={t('train.notRunningBody')} />
        )}

        {!data.runningInLatestSnapshot || !position ? null : <StaleNote meta={meta} />}

        <div className="rp-row" style={{ marginTop: 'var(--rp-space-lg)', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => share.mutate()} disabled={share.isPending}>
            {t('train.share')}
          </Button>
          <Button disabled aria-describedby="alert-note">
            {t('train.alert')}
          </Button>
          <span id="alert-note" className="rp-badge">
            {t('train.alertComing')}
          </span>
        </div>

        {shareCode ? (
          <div style={{ marginTop: 'var(--rp-space-md)' }}>
            <p className="rp-subtitle">{t('share.body')}</p>
            <code
              style={{
                display: 'block',
                background: 'var(--rp-color-page)',
                padding: 'var(--rp-space-sm)',
                borderRadius: 'var(--rp-radius-sm)',
                fontSize: 12,
                overflowWrap: 'anywhere',
              }}
            >
              {shareCode}
            </code>
            <div className="rp-row" style={{ marginTop: 'var(--rp-space-sm)' }}>
              <Button
                small
                onClick={() => {
                  void navigator.clipboard?.writeText(shareCode);
                  setCopied(true);
                }}
              >
                {copied ? t('share.copied') : t('share.copy')}
              </Button>
              <span className="rp-muted" style={{ fontSize: 12 }}>
                {t('share.expires')}
              </span>
            </div>
          </div>
        ) : null}
      </Card>

      <div style={{ marginTop: 'var(--rp-space-md)' }}>
        <ReasonCard reason={data.reason} available={data.reasonAvailable} />
      </div>

      <SectionTitle
        hint={
          nearby.data ? (
            <span className="rp-badge">{formatClock(nearby.data.meta.asOf, language)}</span>
          ) : null
        }
      >
        {t('train.nearby')}
      </SectionTitle>
      <Card>
        {nearby.isError ? (
          <p className="rp-subtitle">{t('train.nearbyEmpty')}</p>
        ) : (
          <div className="rp-list">
            {(['ahead', 'behind', 'opposite'] as const).map((group) => {
              const rows = nearby.data?.data[group] ?? [];
              if (rows.length === 0) return null;
              return (
                <div key={group}>
                  <p className="rp-eyebrow" style={{ marginTop: 'var(--rp-space-sm)' }}>
                    {t(`train.${group}`)}
                  </p>
                  {rows.map((row) => (
                    <Link key={row.trainNumber} to={`/trains/${row.trainNumber}`} className="rp-list-item">
                      <span>
                        <p className="rp-list-item__title">{row.trainName}</p>
                        <p className="rp-list-item__meta">
                          {row.trainNumber} · {formatDistance(row.distanceKm)}
                          {row.overtakeHint ? ` · ${t('train.overtake')}` : ''}
                        </p>
                      </span>
                      <DelayPill delayMin={row.delayMin} level={row.delayLevel} />
                    </Link>
                  ))}
                </div>
              );
            })}
            {nearby.data &&
            nearby.data.data.ahead.length + nearby.data.data.behind.length + nearby.data.data.opposite.length ===
              0 ? (
              <p className="rp-subtitle">{t('train.nearbyEmpty')}</p>
            ) : null}
          </div>
        )}
      </Card>

      <SectionTitle>{t('train.stations')}</SectionTitle>
      <Card>
        <ol className="rp-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {stops.map((stop) => (
            <StationRow
              key={`${stop.seq}-${stop.stationCode}`}
              stop={stop}
              passed={stop.seq <= currentSeq}
              current={stop.seq === currentSeq}
            />
          ))}
        </ol>
      </Card>

      <SectionTitle>{t('history.title')}</SectionTitle>
      <Card>
        {data.history.length === 0 ? (
          <p className="rp-subtitle">{t('history.empty')}</p>
        ) : (
          <table className="rp-table">
            <thead>
              <tr>
                <th>{t('train.stations')}</th>
                <th>{t('history.title')}</th>
                <th>n</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((row) => (
                <tr key={row.stationCode}>
                  <td>{row.stationName}</td>
                  <td>{formatDelay(Math.round(row.avgArrDelayMin))}</td>
                  <td>{row.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
