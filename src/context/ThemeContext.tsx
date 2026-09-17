import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: ThemeMode;
  effectiveTheme: 'dark' | 'light';
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  showThemeOnboarding: boolean;
  dismissThemeOnboarding: () => void;
}

export const THEME_STORAGE_KEY = 'elicine-theme';
export const THEME_ONBOARDING_KEY = 'onboarding_theme_popup_seen';
export const INSTALL_ONBOARDING_KEY = 'onboarding_install_popup_seen';


const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. THÈME PAR DÉFAUT : 'light' pour tous les nouveaux visiteurs (sans préférence enregistrée)
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {}
    return 'light';
  });

  // 2. ÉTAT ONBOARDING : affiché uniquement si l'utilisateur n'a jamais cliqué sur le bouton de thème
  const [showThemeOnboarding, setShowThemeOnboarding] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const seen = localStorage.getItem(THEME_ONBOARDING_KEY);
      return seen !== 'true';
    } catch {
      return false;
    }
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Listen for system theme changes if theme === 'system'
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const effectiveTheme: 'dark' | 'light' = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const body = document.body;

    if (effectiveTheme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      body.classList.remove('dark');
      body.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      body.classList.remove('light');
      body.classList.add('dark');
    }

    // Update meta theme-color for mobile address bar
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', effectiveTheme === 'light' ? '#f8f9fc' : '#07090e');
    }
  }, [effectiveTheme]);

  // Fermeture et persistance du flag d'onboarding (uniquement au clic sur le bouton thème)
  const dismissThemeOnboarding = () => {
    try {
      localStorage.setItem(THEME_ONBOARDING_KEY, 'true');
    } catch (e) {
      console.error('Erreur sauvegarde onboarding thème:', e);
    }
    setShowThemeOnboarding(false);
  };

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (e) {
      console.error('Erreur sauvegarde thème:', e);
    }
    // Toute modification explicite du thème valide et ferme l'onboarding
    dismissThemeOnboarding();
  };

  const toggleTheme = () => {
    const nextTheme: ThemeMode = effectiveTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      effectiveTheme, 
      setTheme, 
      toggleTheme, 
      showThemeOnboarding, 
      dismissThemeOnboarding 
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    // Graceful fallback for components outside ThemeProvider
    return {
      theme: 'light' as ThemeMode,
      effectiveTheme: 'light' as 'dark' | 'light',
      setTheme: () => {},
      toggleTheme: () => {},
      showThemeOnboarding: false,
      dismissThemeOnboarding: () => {}
    };
  }
  return context;
};

export default ThemeContext;
