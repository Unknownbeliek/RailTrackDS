/**
 * Design tokens (section 6.3). Colours, spacing and type are defined once
 * here and exported to CSS variables and TypeScript, so a colour is never
 * typed twice and never picked by hand in a component.
 */

export const color = {
  ink: '#0B2540',
  inkSoft: '#3D5773',
  muted: '#6B7F94',
  primary: '#2457D6',
  primarySoft: '#E7EEFD',
  primaryPressed: '#1B44AC',
  ok: '#1E8E5A',
  okSoft: '#E4F4EB',
  warn: '#C77700',
  warnSoft: '#FDF0DC',
  bad: '#D23B2E',
  badDeep: '#B42318',
  badSoft: '#FBE7E5',
  surface: '#FFFFFF',
  page: '#F3F6F8',
  border: '#DFE6EC',
  borderStrong: '#C3CFD9',
  focus: '#7BA0F2',
  white: '#FFFFFF',
} as const;

export const map = {
  land: '#E9EEF1',
  water: '#BFDDEA',
  rail: '#C3CBD2',
  corridor: '#2457D6',
  corridorHalo: '#B8C9F2',
  station: '#FFFFFF',
  stationRing: '#0B2540',
  label: '#0B2540',
} as const;

/** Delay bands, always paired with text so colour is never the only signal. */
export const delayColor = {
  ontime: color.ok,
  slight: color.warn,
  major: color.bad,
} as const;

export const delayTint = {
  ontime: color.okSoft,
  slight: color.warnSoft,
  major: color.badSoft,
} as const;

export const space = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
} as const;

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '18px',
  pill: '999px',
} as const;

export const shadow = {
  card: '0 1px 2px rgba(11, 37, 64, 0.06), 0 8px 24px rgba(11, 37, 64, 0.08)',
  sheet: '0 -8px 32px rgba(11, 37, 64, 0.14)',
  marker: '0 2px 8px rgba(11, 37, 64, 0.28)',
} as const;

export const font = {
  family: "'Inter', 'Noto Sans Devanagari', system-ui, -apple-system, 'Segoe UI', sans-serif",
  body: '15px',
  bodySmall: '14px',
  label: '12px',
  labelSmall: '11px',
  delayNumber: '40px',
  title: '20px',
  sheetTitle: '17px',
  weightRegular: 400,
  weightMedium: 500,
  weightSemibold: 600,
  weightBold: 700,
} as const;

/** 44 px minimum touch target (section 6.6). */
export const touchTarget = '44px';

export const layout = {
  maxWidth: '560px',
  tabBarHeight: '60px',
  sheetPeek: '132px',
  sheetHalf: '46vh',
  sheetFull: '88vh',
} as const;

export const tokens = { color, map, delayColor, delayTint, space, radius, shadow, font, touchTarget, layout };
export type Tokens = typeof tokens;
