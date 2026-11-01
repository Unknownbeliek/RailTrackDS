/**
 * F10: English and Hindi. Train and station names keep their official form;
 * only interface text switches, from one file per language.
 */
import { useTranslation } from 'react-i18next';
import { currentLanguage, setLanguage } from '../i18n';
import { Button } from './ui';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const current = currentLanguage();
  return (
    <Button
      small
      onClick={() => setLanguage(current === 'en' ? 'hi' : 'en')}
      aria-label={`Switch language to ${current === 'en' ? 'Hindi' : 'English'}`}
      lang={current === 'en' ? 'hi' : 'en'}
    >
      {t('common.language')}
      <span className="rp-muted" style={{ fontSize: 11 }}>
        ({i18n.language})
      </span>
    </Button>
  );
}
