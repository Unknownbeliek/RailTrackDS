/**
 * Rule N4, made visible: every screen that shows data shows how old it is,
 * where it came from and whether it is an estimate (section 6.5).
 */
import { useTranslation } from 'react-i18next';
import type { Meta } from '@railpulse/shared';
import { formatAge, formatClock, type Language } from '../lib/format';

export interface AsOfBannerProps {
  meta: Meta;
  now: Date;
  language: Language;
  compact?: boolean;
}

export function AsOfBanner({ meta, now, language, compact }: AsOfBannerProps) {
  const { t } = useTranslation();
  const isStale = meta.freshness === 'old' || meta.budgetLimited;
  const tone = meta.budgetLimited || meta.freshness === 'old' ? 'old' : meta.freshness === 'aged' ? 'aged' : '';

  return (
    <div className={`rp-asof ${tone ? `rp-asof--${tone}` : ''}`}>
      <span>
        <strong>{formatClock(meta.asOf, language)}</strong>{' '}
        <span className="rp-muted">
          · {t(`freshness.${meta.freshness}`)} ({formatAge(meta.asOf, now)})
        </span>
      </span>
      <span className="rp-row" style={{ gap: 6 }}>
        {/* Replay already means "a recording, re-derived", so one badge is enough. */}
        {meta.source === 'replay' ? (
          <span className="rp-badge rp-badge--replay">{t('replay.label')}</span>
        ) : meta.source !== 'static' && meta.isEstimated ? (
          <span className="rp-badge rp-badge--estimated">{t('map.estimated')}</span>
        ) : null}
        {isStale && !compact ? <span className="rp-badge rp-badge--stale">{t('freshness.stale')}</span> : null}
      </span>
    </div>
  );
}

/** Extra sentence when the snapshot is very old, plus the budget note (6.5). */
export function StaleNote({ meta }: { meta: Meta }) {
  const { t } = useTranslation();
  if (meta.budgetLimited) {
    return <p className="rp-subtitle">{t('freshness.budgetLimited')}</p>;
  }
  if (meta.freshness !== 'old') return null;
  return (
    <p className="rp-subtitle" style={{ color: 'var(--rp-delay-bad-deep)' }}>
      {t('freshness.staleBody')}
    </p>
  );
}
