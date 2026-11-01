/**
 * A delay is always colour *and* words, in one component, so no screen can
 * show a colour without a label (section 6.1: colour is never the only signal).
 */
import { useTranslation } from 'react-i18next';
import type { DelayLevel } from '@railpulse/shared';

export function delayLabelKey(level: DelayLevel): string {
  return level === 'ontime' ? 'delay.ontime' : level === 'slight' ? 'delay.slight' : 'delay.major';
}

export function DelayPill({ delayMin, level }: { delayMin: number; level: DelayLevel }) {
  const { t } = useTranslation();
  return (
    <span className={`rp-pill rp-pill--${level}`}>
      <span className="rp-dot" style={{ background: `var(--rp-delay-${level === 'major' ? 'bad' : level})` }} aria-hidden />
      {t(delayLabelKey(level))}
      {delayMin > 0 ? ` · ${t('delay.minutes', { count: delayMin })}` : null}
    </span>
  );
}

/** The big number on the train detail card. */
export function DelayNumber({ delayMin, level }: { delayMin: number; level: DelayLevel }) {
  const { t } = useTranslation();
  return (
    <div className={`rp-delay-number rp-delay-number--${level}`}>
      {delayMin > 0 ? `+${delayMin}` : '0'}
      <span style={{ fontSize: 'var(--rp-font-label)', display: 'block', fontWeight: 500 }}>
        {delayMin > 0 ? t('delay.unit') : t('delay.ontime')}
      </span>
    </div>
  );
}
