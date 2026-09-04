import React, { createContext, useContext, useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Movie,
  UserProfile,
  ApiSettings,
  AIQuota,
  AlertItem,
  SearchHistoryItem,
  Currency,
  ActiveView,
  PricingBillingCycle
} from '../types';


interface AppContextType {
  // Quota & AI
  quota: AIQuota;
  useAiQuota: () => boolean;
  resetQuota: () => void;

  // User & Auth
  user: UserProfile | null;
  login: (email: string, name: string) => void;
  logout: () => void;
  upgradeToPro: (cycle?: PricingBillingCycle) => void;

  // API Settings & Status
  apiSettings: ApiSettings;
  updateApiSettings: (settings: Partial<ApiSettings>) => void;
  clearApiSettings: () => void;
  hasApiKeysConfigured: boolean;

  // Currency
  currency: Currency;
  setCurrency: (c: Currency) => void;

  // Watchlist & Alerts
  watchlist: Movie[];
  toggleWatchlist: (movie: Movie) => void;
  isInWatchlist: (movieId: number) => boolean;

  alerts: AlertItem[];
  addAlert: (movie: Movie, email?: string) => void;
  removeAlert: (alertId: string) => void;
  isMovieAlertActive: (movieId: number) => boolean;

  // Search History
  searchHistory: SearchHistoryItem[];
  addHistoryItem: (query: string, count: number, mood?: string) => void;
  clearHistory: () => void;

  // Navigation
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  // Modals & Selected Movie
  selectedMovie: Movie | null;
  setSelectedMovie: (m: Movie | null) => void;
  isProModalOpen: boolean;
  setIsProModalOpen: (open: boolean) => void;
  isTipModalOpen: boolean;
  setIsTipModalOpen: (open: boolean) => void;
  isApiSettingsModalOpen: boolean;
  setIsApiSettingsModalOpen: (open: boolean) => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  isAlertsModalOpen: boolean;
  setIsAlertsModalOpen: (open: boolean) => void;
  isApkModalOpen: boolean;
  setIsApkModalOpen: (open: boolean) => void;

  // Mobile Menu & PWA
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  canInstallPwa: boolean;
  installPwa: () => Promise<void>;

  // Toast / Feedback
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const DEFAULT_USER: UserProfile = {
  id: 'usr_default',
  email: 'invite@cineai.app',
  name: 'Cinéphile',
  isPro: true,
  proPlanType: 'yearly',
  proPlanExpiresAt: 'Actif (Renouvellement annuel)',
  referralCode: 'CINEAI-VIP',
  createdAt: new Date().toISOString()
};

const DEFAULT_QUOTA: AIQuota = {
  remaining: 3,
  max: 3,
  lastResetDate: new Date().toISOString().split('T')[0]
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. API Settings loaded from localStorage keys with env fallbacks
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => {
    const tmdb = localStorage.getItem('cinéia_tmdb_key') || localStorage.getItem('cineia_tmdb_key') || '';
    const omdb = localStorage.getItem('cinéia_omdb_key') || '';
    const trakt = localStorage.getItem('cinéia_trakt_id') || '';
    const openai = localStorage.getItem('cinéia_openai_key') || '';
    const anthropic = localStorage.getItem('cinéia_anthropic_key') || '';
    const xai = localStorage.getItem('cinéia_xai_key') || '';
    const groq = localStorage.getItem('cinéia_groq_key') || '';
    const qwen = localStorage.getItem('cinéia_qwen_api_key') || localStorage.getItem('cinéia_qwen_key') || '';
    const preferredAi = (localStorage.getItem('cinéia_preferred_ai_provider') || 'groq') as 'qwen' | 'groq' | 'openai' | 'anthropic' | 'xai';
    const notchPk = localStorage.getItem('cinéia_notch_pk') || localStorage.getItem('cinéia_notch_key') || (import.meta as any).env?.VITE_NOTCHPAY_PUBLIC_KEY || '';
    const notchSk = localStorage.getItem('cinéia_notch_sk') || '';
    const notchHash = localStorage.getItem('cinéia_notch_hash') || localStorage.getItem('cinéia_notch_hash_key') || '';

    return {
      tmdbApiKey: tmdb,
      omdbApiKey: omdb,
      traktClientId: trakt,
      openaiApiKey: openai,
      anthropicApiKey: anthropic,
      xaiApiKey: xai,
      groqApiKey: groq,
      qwenApiKey: qwen,
      preferredAiProvider: preferredAi,
      notchPayPublicKey: notchPk,
      notchPaySecretKey: notchSk,
      notchPayHashKey: notchHash,
      apiMode: 'production'
    };
  });

  const hasApiKeysConfigured = true;

  // 2. Quota IA
  const [quota, setQuota] = useState<AIQuota>(() => {
    const saved = localStorage.getItem('cineia_quota');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_QUOTA;
  });

  // 3. User Profile
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('cineia_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_USER;
  });

  // 4. Currency
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = localStorage.getItem('cineia_currency') as Currency;
    return saved || 'XAF';
  });

  // 5. Watchlist
  const [watchlist, setWatchlist] = useState<Movie[]>(() => {
    const saved = localStorage.getItem('cineia_watchlist');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  // 6. Alerts
  const [alerts, setAlerts] = useState<AlertItem[]>(() => {
    const saved = localStorage.getItem('cineia_alerts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  // 7. Search History
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>(() => {
    const saved = localStorage.getItem('cineia_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      { id: '1', query: 'Film de braquage à fin twist', timestamp: 'Hier', resultsCount: 4, mood: 'Néo-Noir' },
      { id: '2', query: 'je veux un film qui va me f...', timestamp: 'Il y a 3 jours', resultsCount: 3, mood: 'Émotion' }
    ];
  });

  // 8. Navigation & Modals
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isTipModalOpen, setIsTipModalOpen] = useState(false);
  const [isApiSettingsModalOpen, setIsApiSettingsModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 9. PWA Deferred Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstallPwa, setCanInstallPwa] = useState(false);

  // Toast trigger
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('cineia_quota', JSON.stringify(quota));
  }, [quota]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('cineia_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('cineia_user');
    }
  }, [user]);

  // Sync all 10 keys to exact localStorage names
  useEffect(() => {
    localStorage.setItem('cinéia_tmdb_key', apiSettings.tmdbApiKey || '');
    localStorage.setItem('cinéia_omdb_key', apiSettings.omdbApiKey || '');
    localStorage.setItem('cinéia_trakt_id', apiSettings.traktClientId || '');
    localStorage.setItem('cinéia_openai_key', apiSettings.openaiApiKey || '');
    localStorage.setItem('cinéia_anthropic_key', apiSettings.anthropicApiKey || '');
    localStorage.setItem('cinéia_xai_key', apiSettings.xaiApiKey || '');
    localStorage.setItem('cinéia_groq_key', apiSettings.groqApiKey || '');
    localStorage.setItem('cinéia_qwen_api_key', apiSettings.qwenApiKey || '');
    localStorage.setItem('cinéia_preferred_ai_provider', apiSettings.preferredAiProvider || 'qwen');
    localStorage.setItem('cinéia_notch_pk', apiSettings.notchPayPublicKey || '');
    localStorage.setItem('cinéia_notch_sk', apiSettings.notchPaySecretKey || '');
    localStorage.setItem('cinéia_notch_hash', apiSettings.notchPayHashKey || '');
  }, [apiSettings]);

  useEffect(() => {
    localStorage.setItem('cineia_currency', currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem('cineia_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('cineia_alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem('cineia_history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  // Handle URL Affiliate/Referral ?ref=
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      localStorage.setItem('cineia_referred_by', ref);
      showToast(`🎉 Bienvenue via le lien de parrainage de ${ref} !`);
    }
  }, []);

  // Handle PWA beforeinstallprompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstallPwa(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const installPwa = async () => {
    if (!deferredPrompt) {
      showToast('Pour installer : menu du navigateur > "Ajouter à l\'écran d\'accueil"');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('✨ Merci d\'avoir installé CinéIA !');
      setCanInstallPwa(false);
    }
    setDeferredPrompt(null);
  };

  // Quota Management
  const useAiQuota = (): boolean => {
    if (user?.isPro) return true;

    if (quota.remaining <= 0) {
      setIsProModalOpen(true);
      return false;
    }

    setQuota(prev => ({
      ...prev,
      remaining: Math.max(0, prev.remaining - 1)
    }));
    return true;
  };

  const resetQuota = () => {
    setQuota({
      remaining: 3,
      max: 3,
      lastResetDate: new Date().toISOString().split('T')[0]
    });
    showToast('⚡ Quota IA réinitialisé à 3/3 !');
  };

  // User Actions
  const login = (email: string, name: string) => {
    const refCode = 'CINE-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const referredBy = localStorage.getItem('cineia_referred_by') || undefined;
    const newUser: UserProfile = {
      id: 'usr_' + Date.now(),
      email,
      name,
      isPro: false,
      referralCode: refCode,
      referredBy,
      createdAt: new Date().toISOString()
    };
    setUser(newUser);
    setIsAuthModalOpen(false);
    showToast(`👋 Bienvenue sur CinéIA, ${name} !`);
  };

  const logout = () => {
    setUser(null);
    showToast('Déconnexion réussie.');
  };

  const upgradeToPro = (cycle: PricingBillingCycle = 'yearly') => {
    setUser(prev => {
      if (!prev) {
        return {
          id: 'usr_' + Date.now(),
          email: 'vip@cineia.com',
          name: 'Membre VIP',
          isPro: true,
          proPlanType: cycle,
          proPlanExpiresAt: cycle === 'yearly' ? 'Pass Annuel Actif' : 'Pass Mensuel Actif',
          referralCode: 'VIP-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
          createdAt: new Date().toISOString()
        };
      }
      return {
        ...prev,
        isPro: true,
        proPlanType: cycle,
        proPlanExpiresAt: cycle === 'yearly' ? 'Pass Annuel Actif' : 'Pass Mensuel Actif'
      };
    });

    setIsProModalOpen(false);
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#0ea5e9', '#2563eb', '#f59e0b', '#ffffff']
    });
    showToast(`👑 Félicitations ! Votre Pass Pro ${cycle === 'yearly' ? 'Annuel' : 'Mensuel'} est actif !`);
  };

  // API Settings update & clear
  const updateApiSettings = (settings: Partial<ApiSettings>) => {
    setApiSettings(prev => ({ ...prev, ...settings }));
    showToast('⚙️ Paramètres API enregistrés !');
  };

  const clearApiSettings = () => {
    const emptySettings: ApiSettings = {
      tmdbApiKey: '',
      omdbApiKey: '',
      traktClientId: '',
      openaiApiKey: '',
      anthropicApiKey: '',
      xaiApiKey: '',
      groqApiKey: '',
      qwenApiKey: '',
      preferredAiProvider: 'qwen',
      notchPayPublicKey: '',
      notchPaySecretKey: '',
      notchPayHashKey: '',
      apiMode: 'production'
    };
    setApiSettings(emptySettings);
    
    // Clear all keys from localStorage
    localStorage.removeItem('cinéia_tmdb_key');
    localStorage.removeItem('cinéia_omdb_key');
    localStorage.removeItem('cinéia_trakt_id');
    localStorage.removeItem('cinéia_openai_key');
    localStorage.removeItem('cinéia_anthropic_key');
    localStorage.removeItem('cinéia_xai_key');
    localStorage.removeItem('cinéia_groq_key');
    localStorage.removeItem('cinéia_qwen_api_key');
    localStorage.removeItem('cinéia_preferred_ai_provider');
    localStorage.removeItem('cinéia_notch_pk');
    localStorage.removeItem('cinéia_notch_sk');
    localStorage.removeItem('cinéia_notch_hash');
    
    showToast('Toutes les clés API ont été effacées.');
  };

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    showToast(`Devise changée en ${c}`);
  };

  // Watchlist Actions
  const toggleWatchlist = (movie: Movie) => {
    setWatchlist(prev => {
      const exists = prev.some(m => m.id === movie.id);
      if (exists) {
        showToast(`Retiré de votre liste : ${movie.title}`);
        return prev.filter(m => m.id !== movie.id);
      } else {
        showToast(`Ajouté à votre liste : ${movie.title}`);
        return [...prev, movie];
      }
    });
  };

  const isInWatchlist = (movieId: number) => {
    return watchlist.some(m => m.id === movieId);
  };

  // Alerts Actions
  const addAlert = (movie: Movie, email?: string) => {
    const alertEmail = email || user?.email || 'votre email';
    const newAlert: AlertItem = {
      id: 'alt_' + Date.now(),
      movieId: movie.id,
      movieTitle: movie.title,
      releaseDate: movie.release_date,
      posterPath: movie.poster_path,
      email: alertEmail,
      createdAt: new Date().toISOString(),
      notified: false
    };

    setAlerts(prev => [...prev, newAlert]);
    showToast(`🔔 Alerte activée pour "${movie.title}" ! Notification sur ${alertEmail}`);
  };

  const removeAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    showToast('Alerte supprimée.');
  };

  const isMovieAlertActive = (movieId: number) => {
    return alerts.some(a => a.movieId === movieId);
  };

  // Search History Actions
  const addHistoryItem = (query: string, count: number, mood?: string) => {
    const item: SearchHistoryItem = {
      id: 'h_' + Date.now(),
      query,
      timestamp: 'À l\'instant',
      resultsCount: count,
      mood
    };
    setSearchHistory(prev => [item, ...prev.slice(0, 15)]);
  };

  const clearHistory = () => {
    setSearchHistory([]);
    showToast('Historique IA vidé.');
  };

  return (
    <AppContext.Provider
      value={{
        quota,
        useAiQuota,
        resetQuota,
        user,
        login,
        logout,
        upgradeToPro,
        apiSettings,
        updateApiSettings,
        clearApiSettings,
        hasApiKeysConfigured,
        currency,
        setCurrency,
        watchlist,
        toggleWatchlist,
        isInWatchlist,
        alerts,
        addAlert,
        removeAlert,
        isMovieAlertActive,
        searchHistory,
        addHistoryItem,
        clearHistory,
        activeView,
        setActiveView,
        selectedMovie,
        setSelectedMovie,
        isProModalOpen,
        setIsProModalOpen,
        isTipModalOpen,
        setIsTipModalOpen,
        isApiSettingsModalOpen,
        setIsApiSettingsModalOpen,
        isAuthModalOpen,
        setIsAuthModalOpen,
        isAlertsModalOpen,
        setIsAlertsModalOpen,
        isApkModalOpen,
        setIsApkModalOpen,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        canInstallPwa,
        installPwa,
        toastMessage,
        showToast
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
