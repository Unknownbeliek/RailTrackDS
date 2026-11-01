/**
 * F9 delay reason card. Labels are Likely, Possible or Unknown, never a
 * percentage, and the card says so plainly when the snapshots are too far
 * apart to guess at all.
 */
import { useTranslation } from 'react-i18next';
import type { Reason } from '@railpulse/shared';

const TONE: Record<string, string> = {
  likely: 'var(--rp-delay-bad-deep)',
  possible: 'var(--rp-delay-warn)',
  unknown: 'var(--rp-color-muted)',
};

export function ReasonCard({
  reason,
  available,
}: {
  reason: Reason | null;
  available: boolean;
}) {
  const { t } = useTranslation();

  if (!available) {
    return (
      <section className="rp-card" aria-label={t('reason.title')}>
        <p className="rp-eyebrow">{t('reason.title')}</p>
        <p className="rp-title" style={{ fontSize: 'var(--rp-font-body)' }}>
          {t('reason.noData')}
        </p>
        <p className="rp-subtitle">{t('reason.noDataBody')}</p>
      </section>
    );
  }

  if (!reason) return null;

  const evidence = reason.evidence ?? {};
  const blockedBy = typeof evidence.blockedByTrain === 'string' ? evidence.blockedByTrain : null;
  const distanceKm = typeof evidence.distanceKm === 'number' ? Math.round(evidence.distanceKm) : null;
  const gapMin = typeof evidence.gapMin === 'number' ? evidence.gapMin : null;

  return (
    <section className="rp-card" aria-label={t('reason.title')}>
      <div className="rp-row rp-row--between">
        <p className="rp-eyebrow" style={{ margin: 0 }}>
          {t('reason.title')}
        </p>
        <span
          className="rp-badge"
          style={{ color: TONE[reason.label] ?? 'inherit', borderColor: TONE[reason.label] ?? undefined }}
        >
          {t(`reason.${reason.label}`)}
        </span>
      </div>
      <p className="rp-title" style={{ fontSize: 'var(--rp-font-body)', marginTop: 6 }}>
        {t(`reason.${reason.rule}`)}
      </p>
      {blockedBy && distanceKm !== null ? (
        <p className="rp-subtitle">
          {t('reason.blockedBy', { train: blockedBy, km: distanceKm })}
          {gapMin !== null ? ` · ${gapMin} min between snapshots` : ''}
        </p>
      ) : gapMin !== null ? (
        <p className="rp-subtitle">{t('reason.evidence', { text: `${gapMin} min between snapshots` })}</p>
      ) : null}
    </section>
  );
}
