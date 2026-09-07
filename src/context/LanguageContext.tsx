import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language, TranslationSchema } from '../i18n/translations';
import { getUserCountry } from '../services/geoService';

export interface LanguageContextType {
  lang: Language;
  setLanguage: (newLang: Language) => void;
  t: TranslationSchema;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const SPANISH_COUNTRIES = ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR', 'GQ'];
const FRENCH_COUNTRIES = ['FR', 'CM', 'CI', 'SN', 'CD', 'MG', 'ML', 'BF', 'NE', 'GN', 'TD', 'BI', 'BJ', 'TG', 'CF', 'CG', 'GA', 'DJ', 'KM', 'BE', 'CH', 'LU', 'MC'];

export function detectPreferredLanguage(): Language {
  // 1. Cookie 'userLanguage'
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)userLanguage=([a-zA-Z]{2})/i);
    if (match && ['fr', 'en', 'es'].includes(match[1].toLowerCase())) {
      return match[1].toLowerCase() as Language;
    }
  }

  // 2. LocalStorage sauvegardé
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('userLanguage') || localStorage.getItem('elicine_lang');
    if (saved && ['fr', 'en', 'es'].includes(saved.toLowerCase())) {
      return saved.toLowerCase() as Language;
    }
  }

  // 3. Navigateur (navigator.language)
  if (typeof navigator !== 'undefined' && navigator.language) {
    const nav = navigator.language.slice(0, 2).toLowerCase();
    if (['fr', 'en', 'es'].includes(nav)) {
      return nav as Language;
    }
  }

  // 4. Défaut : 'fr'
  return 'fr';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(() => detectPreferredLanguage());

  useEffect(() => {
    async function initLanguage() {
      // 1. Préférence manuelle enregistrée ?
      const savedLang = (
        (typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)userLanguage=([a-zA-Z]{2})/i)?.[1] : null) ||
        (typeof localStorage !== 'undefined' ? (localStorage.getItem('userLanguage') || localStorage.getItem('elicine_lang')) : null)
      )?.toLowerCase() as Language | null;

      if (savedLang && ['fr', 'en', 'es'].includes(savedLang)) {
        setLang(savedLang);
        document.documentElement.lang = savedLang;
        return;
      }

      // 2. Navigateur en priorité si pas de préférence explicite
      if (typeof navigator !== 'undefined' && navigator.language) {
        const navLang = navigator.language.slice(0, 2).toLowerCase() as Language;
        if (['fr', 'en', 'es'].includes(navLang)) {
          setLang(navLang);
          document.documentElement.lang = navLang;
          return;
        }
      }

      // 3. Détection par pays d'émission (IP / Timezone)
      try {
        const country = await getUserCountry();
        const code = country?.code?.toUpperCase();

        if (code && SPANISH_COUNTRIES.includes(code)) {
          setLang('es');
          document.documentElement.lang = 'es';
        } else if (code && FRENCH_COUNTRIES.includes(code)) {
          setLang('fr');
          document.documentElement.lang = 'fr';
        } else {
          // Reste du monde : anglais par défaut
          setLang('en');
          document.documentElement.lang = 'en';
        }
      } catch (e) {
        setLang('fr');
        document.documentElement.lang = 'fr';
      }
    }

    initLanguage();
  }, []);

  const changeLanguage = (newLang: Language) => {
    if (['fr', 'en', 'es'].includes(newLang)) {
      setLang(newLang);
      localStorage.setItem('userLanguage', newLang);
      localStorage.setItem('elicine_lang', newLang);
      if (typeof document !== 'undefined') {
        document.cookie = `userLanguage=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
        document.documentElement.lang = newLang;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('elicine-language-changed', { detail: { lang: newLang } }));
      }
    }
  };

  const t = translations[lang] || translations.fr;

  return (
    <LanguageContext.Provider value={{ lang, setLanguage: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      lang: 'fr',
      setLanguage: () => {},
      t: translations.fr
    };
  }
  return context;
};

export { LanguageContext };
