import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const TABS = [
  { to: '/', icon: '🗺️', key: 'tabs.map', end: true },
  { to: '/search', icon: '🔎', key: 'tabs.search', end: false },
  { to: '/replay', icon: '⏱️', key: 'tabs.replay', end: false },
  { to: '/about', icon: 'ℹ️', key: 'tabs.about', end: false },
];

export function TabBar() {
  const { t } = useTranslation();
  return (
    <nav className="rp-tabbar" aria-label={t('app.name')}>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className="rp-tab">
          <span className="rp-tab__icon" aria-hidden>
            {tab.icon}
          </span>
          {t(tab.key)}
        </NavLink>
      ))}
    </nav>
  );
}
