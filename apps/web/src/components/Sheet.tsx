/**
 * Bottom sheet with peek, half and full states (section 6.4). It floats above
 * the map and everything inside it is a real button, so the map stays the
 * background rather than the interface.
 */
import type { PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type SheetState = 'peek' | 'half' | 'full';

const HEIGHTS: Record<SheetState, string> = {
  peek: 'var(--rp-layout-sheet-peek)',
  half: 'var(--rp-layout-sheet-half)',
  full: 'var(--rp-layout-sheet-full)',
};

export function Sheet({
  state,
  onToggle,
  header,
  children,
}: PropsWithChildren<{ state: SheetState; onToggle: () => void; header: ReactNode }>) {
  const { t } = useTranslation();
  const next = state === 'peek' ? 'half' : state === 'half' ? 'full' : 'peek';
  return (
    <section className="rp-sheet" style={{ height: HEIGHTS[state] }} aria-label={t('tabs.map')}>
      <button
        type="button"
        className="rp-sheet__handle"
        onClick={onToggle}
        aria-label={next === 'peek' ? t('common.close') : t('map.tapTrain')}
      />
      <div style={{ padding: '0 var(--rp-space-lg)' }}>{header}</div>
      <div className="rp-sheet__content">{children}</div>
    </section>
  );
}
