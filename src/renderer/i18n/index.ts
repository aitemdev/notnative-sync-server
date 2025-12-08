
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';

// Get stored language from localStorage or use default
const getStoredLanguage = (): string => {
  try {
    const stored = localStorage.getItem('notnative-language');
    if (stored && (stored === 'en' || stored === 'es')) {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  return 'es'; // Default to Spanish
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: getStoredLanguage(),
    fallbackLng: 'es',
    debug: false,
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'notnative-language',
      caches: ['localStorage'],
    },
  });

// Function to change language and persist it
export const changeLanguage = (lang: string) => {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem('notnative-language', lang);
  } catch {
    // Ignore localStorage errors
  }
};

// Get current language
export const getCurrentLanguage = (): string => {
  return i18n.language || 'es';
};

export default i18n;
