import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
import { usePWAInstall } from '../hooks/usePWAInstall';
import { authService } from '../services/authService';
import { supabase, signInWithGoogle } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface AppContextType {
  // Quota & AI
  quota: AIQuota;
  useAiQuota: () => boolean;
  resetQuota: () => void;

  // User & Auth
  user: UserProfile | null;
  loading: boolean;
  setLoading: (l: boolean) => void;
  login: (emailOrUser: string | UserProfile, name?: string) => void;
  loginWithCredentials: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  registerWithCredentials: (username: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
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
  isThankYouModalOpen: boolean;
  setIsThankYouModalOpen: (open: boolean) => void;
  isProSuccessModalOpen: boolean;
  setIsProSuccessModalOpen: (open: boolean) => void;

  // Mobile Menu & PWA
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  canInstallPwa: boolean;
  installPwa: () => Promise<boolean | void>;

  // Toast / Feedback
  toastMessage: string | null;
  showToast: (msg: string, durationMs?: number) => void;

  // APK Download Toast / Banner
  showOpenInstallerToast: boolean;
  setShowOpenInstallerToast: (show: boolean) => void;
  triggerApkDownload: () => void;
}


const DEFAULT_QUOTA: AIQuota = {
  remaining: 999,
  max: 999,
  lastResetDate: new Date().toISOString().split('T')[0]
};

export const formatUser = (rawUser: any): UserProfile => {
  if (!rawUser) return rawUser;
  const meta = rawUser.user_metadata || {};
  const identityMeta = rawUser.identities?.[0]?.identity_data || {};
  const avatar = meta.avatar_url || meta.picture || identityMeta.avatar_url || identityMeta.picture || rawUser.avatar;
  const name = meta.full_name || meta.name || identityMeta.full_name || identityMeta.name || rawUser.name || (rawUser.email ? rawUser.email.split('@')[0] : 'Cinéphile');
  const email = rawUser.email || meta.email || identityMeta.email || '';

  return {
    ...rawUser,
    id: rawUser.id || 'usr_' + Date.now(),
    email,
    name,
    avatar: avatar || undefined,
    provider: 'google',
    role: meta.role || rawUser.role || 'user',
    isPro: rawUser.isPro ?? false,
    referralCode: rawUser.referralCode || ('CINE-' + Math.random().toString(36).substring(2, 7).toUpperCase()),
    createdAt: rawUser.created_at || rawUser.createdAt || new Date().toISOString()
  };
};

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: authUser, session: authSession, signOut: authSignOut, setAuthUser } = useAuth();

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
    const envNotchPk = ((import.meta as any).env?.VITE_NOTCHPAY_PUBLIC_KEY || '').trim();
    const storedNotchPk = (localStorage.getItem('cinéia_notch_pk') || localStorage.getItem('cinéia_notch_key') || '').trim();
    const cleanStoredNotchPk = (storedNotchPk.startsWith('pk_test_') || storedNotchPk.startsWith('test_')) ? '' : storedNotchPk;
    const notchPk = envNotchPk || cleanStoredNotchPk;
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

  // 2. Quota IA (Illimité)
  const [quota, setQuota] = useState<AIQuota>(() => {
    return DEFAULT_QUOTA;
  });

  // 3. User Profile - Lecture stricte et exclusive de la session Supabase au montage
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        // Lecture immédiate d'un token Supabase existant dans LocalStorage
        const authKey = Object.keys(localStorage).find(key => key.includes('auth-token') || key.startsWith('sb-'));
        if (authKey) {
          const raw = localStorage.getItem(authKey);
          if (raw) {
            try {
              const data = JSON.parse(raw);
              const sbUser = data?.user || data?.currentSession?.user;
              if (sbUser?.email) {
                return formatUser({
                  ...sbUser,
                  token: data?.access_token || data?.currentSession?.access_token
                });
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.error('Erreur extraction session Supabase locale:', e);
      }
    }
    return null;
  });

  // 4. Currency
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = localStorage.getItem('cineia_currency') as Currency;
    return saved || 'XAF';
  });

  // 5. Watchlist
  const [watchlist, setWatchlist] = useState<Movie[]>(() => {
    const savedUserRaw = localStorage.getItem('cineia_user');
    if (savedUserRaw) {
      try {
        const u = JSON.parse(savedUserRaw);
        if (u?.id) {
          const userList = authService.getUserWatchlist(u.id);
          if (userList && userList.length > 0) return userList;
        }
      } catch (e) {
        console.error(e);
      }
    }
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
  const [isThankYouModalOpen, setIsThankYouModalOpen] = useState(false);
  const [isProSuccessModalOpen, setIsProSuccessModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 9. PWA Deferred Prompt & Hook
  const { isInstallable: canInstallPwa, handleInstallClick: installPwa } = usePWAInstall();

  // Toast trigger (with optional custom duration)
  const toastTimeoutRef = useRef<any>(null);
  const showToast = (msg: string, durationMs: number = 4000) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, durationMs);
  };

  // 10. APK Direct Download & Open Installer Toast
  const [showOpenInstallerToast, setShowOpenInstallerToast] = useState(false);

  const triggerApkDownload = () => {
    const apkUrl = (import.meta as any).env?.VITE_APK_DOWNLOAD_URL || '/elicine.apk';
    const link = document.createElement('a');
    link.href = apkUrl;
    link.setAttribute('download', 'elicine.apk');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setShowOpenInstallerToast(true);
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
    if (user?.id) {
      authService.saveUserWatchlist(user.id, watchlist);
    }
  }, [watchlist, user]);

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

  // Helper de nettoyage sécurisé des fragments et paramètres OAuth dans l'URL
  const cleanOAuthUrl = () => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      const hasHashToken = url.hash.includes('access_token=') || url.hash.includes('error=');
      const hasCodeParam = url.searchParams.has('code') || url.searchParams.has('error');

      if (hasHashToken || hasCodeParam) {
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        url.searchParams.delete('error');
        url.searchParams.delete('error_description');
        url.hash = '';
        const cleanUrl = url.pathname + (url.search ? url.search : '');
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {
      console.warn('[cleanOAuthUrl error]', e);
    }
  };

  // Helper de synchronisation du compte utilisateur depuis la session Supabase
  const syncSupabaseUser = (session: any, eventName?: string) => {
    if (!session?.user) return;
    const sbUser = session.user;
    const meta = sbUser.user_metadata || {};
    const identityMeta = sbUser.identities?.[0]?.identity_data || {};
    const avatar = meta.avatar_url || meta.picture || identityMeta.avatar_url || identityMeta.picture || null;
    const name = meta.full_name || meta.name || identityMeta.full_name || identityMeta.name || (sbUser.email ? sbUser.email.split('@')[0] : 'Cinéphile');
    const email = sbUser.email || meta.email || identityMeta.email || '';

    const updatedUser: UserProfile = {
      id: sbUser.id,
      email,
      name,
      avatar: avatar || undefined,
      provider: 'google',
      role: (meta.role as any) || 'user',
      isPro: false,
      proPlanType: undefined,
      proPlanExpiresAt: undefined,
      referralCode: 'CINE-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      createdAt: sbUser.created_at || new Date().toISOString(),
      myList: watchlist,
      token: session.access_token
    };

    setUser(prev => {
      const merged: UserProfile = {
        ...updatedUser,
        avatar: avatar || prev?.avatar,
        isPro: prev?.isPro ?? false,
        proPlanType: prev?.proPlanType,
        proPlanExpiresAt: prev?.proPlanExpiresAt,
        referralCode: prev?.referralCode || updatedUser.referralCode,
        createdAt: prev?.createdAt || updatedUser.createdAt,
        myList: (prev?.myList && prev.myList.length > 0) ? prev.myList : watchlist
      };
      try {
        localStorage.setItem('cineia_user', JSON.stringify(merged));
      } catch (e) {
        console.error('Error saving user to localStorage:', e);
      }
      authService.saveLocalAccount(merged);
      return merged;
    });

    // Fermeture systématique de la modale de connexion
    setIsAuthModalOpen(false);

    // Notification toast si connexion explicite ou retour de callback OAuth
    const isOAuthCallback = typeof window !== 'undefined' && 
      (window.location.hash.includes('access_token=') || window.location.search.includes('code='));

    if (eventName === 'SIGNED_IN' || (eventName === 'INITIAL_SESSION' && isOAuthCallback)) {
      showToast(`👋 Bienvenue sur Éliciné, ${name} !`);
    }

    // Nettoyage de l'URL pour supprimer les fragments / codes OAuth
    cleanOAuthUrl();
  };

  // 11. Nettoyage sécurisé des fragments et paramètres OAuth au chargement
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('error') || url.hash.includes('error=')) {
        console.warn('[OAuth Callback Error]', url.searchParams.get('error_description') || url.searchParams.get('error'));
        cleanOAuthUrl();
      }
    }
  }, []);

  // 12. Synchronisation réactive avec AuthContext
  useEffect(() => {
    if (authUser) {
      setUser(prev => {
        const formatted = formatUser({
          ...authUser,
          token: authSession?.access_token || authUser.token
        });
        const updatedUser = {
          ...formatted,
          isPro: prev?.isPro || (authUser.user_metadata as any)?.isPro || (authUser as any)?.isPro || false
        };
        try {
          localStorage.setItem('cineia_user', JSON.stringify(updatedUser));
        } catch (_) {}
        return updatedUser;
      });
      setIsAuthModalOpen(false);
    } else {
      // Préserver la session locale en cas d'absence de session Supabase distante
      const stored = authService.getStoredUser();
      if (stored) {
        setUser(stored);
      } else {
        setUser(null);
      }
    }
    setLoading(false);
  }, [authUser, authSession]);

  // Quota Management
  const useAiQuota = (): boolean => {
    if ((user as any)?.isPro) return true;

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
    setQuota(DEFAULT_QUOTA);
    showToast('⚡ Quota IA illimité actif !');
  };

  // User Actions
  const login = (emailOrUser: string | UserProfile, name?: string) => {
    if (typeof emailOrUser === 'object') {
      setUser(emailOrUser);
      setAuthUser(emailOrUser);
      localStorage.setItem('cineia_user', JSON.stringify(emailOrUser));
      setIsAuthModalOpen(false);
      showToast(`👋 Bienvenue, ${emailOrUser.name || 'Cinéphile'} !`);
      return;
    }
    throw new Error("Veuillez utiliser loginWithCredentials pour vous connecter.");
  };

  const loginWithCredentials = async (identifier: string, password: string) => {
    const cleanId = (identifier || '').trim();
    const res = await authService.login(cleanId, password);
    if (res.success && res.user) {
      setUser(res.user);
      setAuthUser(res.user);
      setIsAuthModalOpen(false);
      showToast(`👋 Bon retour sur Éliciné, ${res.user.name || res.user.email} !`);
      return { success: true };
    }
    return { success: false, error: res.error || "Erreur lors de la connexion." };
  };

  const registerWithCredentials = async (username: string, email: string, password: string) => {
    const cleanUsername = (username || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const res = await authService.register(cleanUsername, cleanEmail, password);
    if (res.success && res.user) {
      setUser(res.user);
      setAuthUser(res.user);
      setIsAuthModalOpen(false);
      showToast(`✉️ Un e-mail de confirmation a été envoyé à ${res.user.email}. Bienvenue sur Éliciné !`, 7000);
      return { success: true };
    }
    return { success: false, error: res.error || "Erreur lors de l'inscription." };
  };

  const loginWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : ''
        }
      });

      if (error) {
        console.error('[Supabase OAuth error]', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      console.error('[Supabase OAuth exception]', err);
      return { success: false, error: err?.message || 'Erreur lors de la connexion Google.' };
    }
  };

  const logout = async () => {
    try {
      await authSignOut();
    } catch (e) {
      console.warn('[authSignOut error]', e);
    }
    setUser(null);
    authService.logout();
    setIsAuthModalOpen(false);
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
        if (!user) {
          showToast("Film ajouté ! Connectez-vous pour synchroniser votre liste sur tous vos appareils.");
        } else {
          showToast(`Ajouté à votre liste : ${movie.title}`);
        }
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
        loading,
        setLoading,
        login,
        loginWithCredentials,
        registerWithCredentials,
        loginWithGoogle,
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
        isThankYouModalOpen,
        setIsThankYouModalOpen,
        isProSuccessModalOpen,
        setIsProSuccessModalOpen,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        canInstallPwa,
        installPwa,
        toastMessage,
        showToast,
        showOpenInstallerToast,
        setShowOpenInstallerToast,
        triggerApkDownload
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
