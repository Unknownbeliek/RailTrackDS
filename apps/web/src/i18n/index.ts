/**
 * All UI text lives in one file per language (F10). Train and station names
 * keep their official form.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';

export const LANGUAGES = ['en', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'railpulse.lang';

function initialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'hi' ? 'hi' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Keeps <html lang> and storage in step, so Hindi layouts are testable (6.6). */
export function setLanguage(language: Language): void {
  void i18n.changeLanguage(language);
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, language);
}

export function currentLanguage(): Language {
  return i18n.language === 'hi' ? 'hi' : 'en';
}

export default i18n;
