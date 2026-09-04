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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>('fr');

  useEffect(() => {
    async function initLanguage() {
      // 1. Préférence manuelle enregistrée ?
      const savedLang = localStorage.getItem('elicine_lang') as Language | null;
      if (savedLang && ['fr', 'en', 'es'].includes(savedLang)) {
        setLang(savedLang);
        document.documentElement.lang = savedLang;
        return;
      }

      // 2. Détection par pays d'émission (IP)
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
        // Fallback navigateur
        const navLang = navigator.language?.slice(0, 2) as Language;
        if (['fr', 'es', 'en'].includes(navLang)) {
          setLang(navLang);
          document.documentElement.lang = navLang;
        } else {
          setLang('fr');
          document.documentElement.lang = 'fr';
        }
      }
    }

    initLanguage();
  }, []);

  const changeLanguage = (newLang: Language) => {
    if (['fr', 'en', 'es'].includes(newLang)) {
      setLang(newLang);
      localStorage.setItem('elicine_lang', newLang);
      document.documentElement.lang = newLang;
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
