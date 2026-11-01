/**
 * One timetable row: scheduled time against last observed time (F4).
 * The dot is filled once the train has passed the station.
 */
import { useTranslation } from 'react-i18next';
import type { StopTiming } from '@railpulse/shared';
import { formatOffset } from '../lib/format';

export function StationRow({
  stop,
  passed,
  current,
}: {
  stop: StopTiming;
  passed: boolean;
  current: boolean;
}) {
  const { t } = useTranslation();
  const scheduled = stop.arrivalMin ?? stop.departureMin;
  const observed = stop.actualArrivalMin ?? stop.actualDepartureMin;
  const delay = stop.delayMin;

  return (
    <li className="rp-station" aria-current={current ? 'step' : undefined}>
      <span className="rp-station__line" aria-hidden>
        <span className={`rp-station__dot ${passed ? 'rp-station__dot--passed' : ''}`} />
      </span>
      <span>
        <p className="rp-station__name" style={current ? { color: 'var(--rp-color-primary)' } : undefined}>
          {stop.stationName}
        </p>
        <p className="rp-station__meta">
          {stop.stationCode}
          {stop.platform ? ` · ${t('train.scheduled')} ${stop.platform}` : ''}
          {` · ${Math.round(stop.distanceKm)} ${t('common.km')}`}
        </p>
      </span>
      <span className="rp-station__times">
        <span style={{ fontWeight: passed ? 600 : 400 }}>{formatOffset(observed ?? scheduled)}</span>
        {observed !== null && delay !== null ? (
          <span
            className="rp-station__delay"
            style={{
              display: 'block',
              color:
                delay >= 15
                  ? 'var(--rp-delay-bad-deep)'
                  : delay >= 5
                    ? 'var(--rp-delay-warn)'
                    : 'var(--rp-delay-ontime)',
            }}
          >
            {delay > 0 ? `+${delay}` : '✓'}
          </span>
        ) : null}
        {observed === null ? (
          <span className="rp-station__delay rp-muted" style={{ display: 'block' }}>
            {formatOffset(scheduled)}
          </span>
        ) : null}
      </span>
    </li>
  );
}
