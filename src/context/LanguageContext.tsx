import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { translations, Language, TranslationFunction, createTranslationProxy } from '../i18n/translations';
import { detectCountryLanguage } from '../i18n/countryLanguage';

export interface LanguageContextType {
  lang: Language;
  setLanguage: (newLang: Language) => void;
  t: TranslationFunction;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const SUPPORTED_LANGUAGES: Language[] = ['fr', 'en', 'es', 'de', 'it'];

function getSavedLanguage(): Language | null {
  try {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)userLanguage=([a-zA-Z]{2})/i);
      if (match && SUPPORTED_LANGUAGES.includes(match[1].toLowerCase() as Language)) {
        return match[1].toLowerCase() as Language;
      }
    }

    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('userLanguage') || localStorage.getItem('elicine_lang');
      if (saved && SUPPORTED_LANGUAGES.includes(saved.toLowerCase() as Language)) {
        return saved.toLowerCase() as Language;
      }
    }
  } catch (_) {}
  return null;
}

export function detectPreferredLanguage(): Language {
  return getSavedLanguage() || 'en';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(() => detectPreferredLanguage());
  const [ready, setReady] = useState(() => Boolean(getSavedLanguage()));

  const t = useMemo(() => {
    const schema = translations[lang] || translations.en;
    return createTranslationProxy(schema);
  }, [lang]);

  // Synchronisation dynamique du tag <title> et des métadonnées selon la locale active
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      if (t.pageTitle) {
        document.title = t.pageTitle;
      }
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && t.metaDescription) {
        metaDesc.setAttribute('content', t.metaDescription);
      }
    }
  }, [lang, t]);

  useEffect(() => {
    const savedLanguage = getSavedLanguage();
    if (savedLanguage) {
      setLang(savedLanguage);
      setReady(true);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    detectCountryLanguage(controller.signal).then(countryLanguage => {
      if (!active) return;
      // Un choix manuel effectué pendant la requête garde la priorité.
      const selectedLanguage = getSavedLanguage() || countryLanguage;
      document.documentElement.lang = selectedLanguage;
      setLang(selectedLanguage);
      setReady(true);
    }).finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const changeLanguage = (newLang: Language) => {
    if (SUPPORTED_LANGUAGES.includes(newLang)) {
      setLang(newLang);
      setReady(true);
      try {
        localStorage.setItem('userLanguage', newLang);
        localStorage.setItem('elicine_lang', newLang);
      } catch (_) {}
      if (typeof document !== 'undefined') {
        try {
          document.cookie = `userLanguage=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
        } catch (_) {}
        document.documentElement.lang = newLang;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('elicine-language-changed', { detail: { lang: newLang } }));
      }
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLanguage: changeLanguage, t }}>
      {ready ? children : (
        <div className="flex min-h-screen items-center justify-center text-2xl font-bold tracking-wide">
          Éliciné
        </div>
      )}
    </LanguageContext.Provider>
  );
}

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      lang: 'en',
      setLanguage: () => {},
      t: createTranslationProxy(translations.en)
    };
  }
  return context;
};

export { LanguageContext };
