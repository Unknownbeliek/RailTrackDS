/**
 * F5 share page: read-only status for family, large text, language toggle.
 * No account and no user location, ever (section 13).
 */
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { AsOfBanner } from '../../components/AsOfBanner';
import { DelayPill } from '../../components/DelayPill';
import { Card, ErrorState, Loading } from '../../components/ui';
import { LanguageToggle } from '../../components/LanguageToggle';
import { currentLanguage } from '../../i18n';
import { formatClock, formatDay } from '../../lib/format';
import { useNow } from '../../lib/useNow';

export function SharePage() {
  const { code = '' } = useParams();
  const { t } = useTranslation();
  const language = currentLanguage();
  const now = useNow(30_000);

  const share = useQuery({ queryKey: ['share', code], queryFn: () => apiClient.share(code), retry: false });

  if (share.isPending) {
    return (
      <div className="rp-screen">
        <Loading />
      </div>
    );
  }
  if (share.isError) {
    return (
      <div className="rp-screen">
        <ErrorState message={t('share.error')} />
      </div>
    );
  }

  const { data, meta } = share.data;
  const journey = `${data.journeyDate}T00:00:00+05:30`;

  return (
    <div className="rp-screen" style={{ fontSize: 17 }}>
      <div className="rp-row rp-row--between" style={{ marginBottom: 'var(--rp-space-md)' }}>
        <span className="rp-eyebrow" style={{ margin: 0 }}>
          {t('share.readOnly')}
        </span>
        <LanguageToggle />
      </div>

      <AsOfBanner meta={meta} now={now} language={language} />

      <Card as="section">
        <p className="rp-eyebrow">{data.train.number}</p>
        <h1 className="rp-title" style={{ fontSize: 26 }}>
          {language === 'hi' && data.train.nameHi ? data.train.nameHi : data.train.name}
        </h1>
        <p className="rp-subtitle" style={{ fontSize: 16 }}>
          {formatDay(journey, language)} · {formatClock(journey, language)}
        </p>

        {data.position ? (
          <div style={{ marginTop: 'var(--rp-space-lg)' }}>
            <div className="rp-row" style={{ gap: 'var(--rp-space-md)', alignItems: 'baseline' }}>
              <span
                className={`rp-delay-number rp-delay-number--${data.position.delayLevel}`}
                style={{ fontSize: 48 }}
              >
                {data.position.delayMin > 0 ? `+${data.position.delayMin}` : '0'}
              </span>
              <DelayPill delayMin={data.position.delayMin} level={data.position.delayLevel} />
            </div>
            <p className="rp-subtitle" style={{ fontSize: 16 }}>
              {data.currentStationName ?? data.position.currentStation} →{' '}
              {data.nextStationName ?? data.position.nextStation}
            </p>
            <p className="rp-subtitle">{t('map.estimated')}</p>
          </div>
        ) : (
          <p className="rp-subtitle">{t('train.notRunning')}</p>
        )}
      </Card>

      <p className="rp-muted" style={{ fontSize: 12, marginTop: 'var(--rp-space-md)' }}>
        {t('about.notAffiliated')}
      </p>
    </div>
  );
}
