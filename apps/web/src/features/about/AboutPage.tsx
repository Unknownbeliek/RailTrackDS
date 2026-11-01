/**
 * About screen (section 13): credit the provider and OpenStreetMap, say
 * plainly that we are not Indian Railways, and link the protected budget page.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui';
import { LanguageToggle } from '../../components/LanguageToggle';
import { MAP_ATTRIBUTION } from '../../lib/map/style';

export function AboutPage() {
  const { t } = useTranslation();
  return (
    <div className="rp-screen">
      <div className="rp-row rp-row--between">
        <h1 className="rp-title">{t('about.title')}</h1>
        <LanguageToggle />
      </div>
      <p className="rp-subtitle">{t('app.tagline')}</p>

      <Card as="section">
        <p>{t('about.body')}</p>
        <p>{t('about.phases')}</p>
        <p>{t('about.budget')}</p>
      </Card>

      <Card as="section">
        <p className="rp-eyebrow">{t('app.about')}</p>
        <p className="rp-subtitle">{t('about.notAffiliated')}</p>
        <p
          className="rp-subtitle"
          dangerouslySetInnerHTML={{ __html: `${t('about.credits')} — ${MAP_ATTRIBUTION}` }}
        />
      </Card>

      <Card as="section">
        <p className="rp-eyebrow">{t('admin.title')}</p>
        <Link to="/admin">{t('admin.title')} →</Link>
      </Card>
    </div>
  );
}
