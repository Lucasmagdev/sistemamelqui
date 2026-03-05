import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale, TranslationKey } from '@/i18n/messages';
import { messages } from '@/i18n/messages';

type I18nContextValue = {
  locale: Locale;
  t: (key: TranslationKey) => string;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function getBrowserLocale(): Locale {
  const languages = (navigator.languages ?? [])
    .map((lang) => lang.toLowerCase())
    .filter(Boolean);

  const primary = languages[0] ?? (navigator.language || '').toLowerCase();
  const hasEnglish = primary.startsWith('en') || languages.some((lang) => lang.startsWith('en'));
  return hasEnglish ? 'en' : 'pt';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getBrowserLocale());

  const setLocale = (value: Locale) => {
    setLocaleState(value);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => messages[locale][key] ?? messages.pt[key] ?? key,
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
