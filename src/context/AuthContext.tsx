import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, signInWithGoogle } from '../lib/supabase';
import { authService } from '../services/authService';

export interface AuthContextType {
  user: User | any | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: (redirectTo?: string) => Promise<any>;
  signInWithPassword: (email: string, password: string) => Promise<{ data?: any; error?: any }>;
  signUpWithPassword: (email: string, password: string, fullName?: string) => Promise<{ data?: any; error?: any }>;
  setAuthUser: (user: any) => void;
  refreshProfile: () => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Récupération synchrone immédiate depuis le LocalStorage pour éviter tout décalage visuel
  const [user, setUser] = useState<User | any | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        // A. Compte utilisateur sauvegardé localement
        const localUser = authService.getStoredUser();
        if (localUser) return localUser;

        // B. Jeton / Session Supabase standard
        const authKey = Object.keys(localStorage).find(
          key => key.includes('auth-token') || key.startsWith('sb-')
        );
        if (authKey) {
          const raw = localStorage.getItem(authKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            const u = parsed?.user || parsed?.currentSession?.user;
            if (u?.email || u?.id) return u;
          }
        }
      } catch (_) {}
    }
    return null;
  });

  const [session, setSession] = useState<Session | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const authKey = Object.keys(localStorage).find(
          key => key.includes('auth-token') || key.startsWith('sb-')
        );
        if (authKey) {
          const raw = localStorage.getItem(authKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            return parsed?.currentSession || parsed || null;
          }
        }
      } catch (_) {}
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(true);

  // Helper pour enrichir l'utilisateur avec son profil Supabase (is_pro, role, pass_status, expires_at)
  const enrichUserWithProfile = async (rawUser: any) => {
    if (!rawUser) return rawUser;
    const email = (rawUser.email || '').trim().toLowerCase();
    const userId = rawUser.id;
    const isMaster = email === 'ivanjoris959@gmail.com';
    let isPro = isMaster || Boolean(rawUser.isPro || rawUser.is_pro || rawUser.user_metadata?.is_pro || rawUser.pass_status === 'pro');
    let passStatus = isMaster ? 'pro' : (rawUser.pass_status || (isPro ? 'pro' : 'free'));
    let role = isMaster ? 'admin' : (rawUser.role || 'user');
    let fullName = rawUser.user_metadata?.full_name || rawUser.name;
    let expiresAt: string | null = rawUser.expires_at || rawUser.pro_expires_at || rawUser.expiresAt || null;
    let daysRemaining: number | null = null;
    // Statut « Supporter » (soutiens ponctuels Paddle) : indépendant du Pass Pro.
    let isSupporter = Boolean(rawUser.is_supporter || rawUser.user_metadata?.is_supporter);
    let supporterTotalCents = Number(rawUser.supporter_total_cents) || 0;

    try {
      const isUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));
      let prof: any = null;
      if (email) {
        const { data } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
        if (data) prof = data;
      }
      if (!prof && userId && isUuid(userId)) {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (data) prof = data;
      }
      if (prof) {
        const profExpiry = prof.expires_at || prof.pro_expires_at || prof.subscription_ends_at;
        if (profExpiry) expiresAt = profExpiry;

        const isExpired = !isMaster && profExpiry && new Date(profExpiry).getTime() < Date.now();

        if (isExpired) {
          isPro = false;
          passStatus = 'free';
          daysRemaining = 0;
        } else {
          isPro = isMaster || prof.is_pro === true || prof.pass_status === 'pro' || prof.role === 'admin';
          passStatus = prof.pass_status || (isPro ? 'pro' : 'free');
          if (profExpiry) {
            daysRemaining = Math.max(1, Math.ceil((new Date(profExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
          }
        }
        role = isMaster ? 'admin' : (prof.role || role);
        if (prof.full_name) fullName = prof.full_name;
        if (prof.is_supporter === true) isSupporter = true;
        if (Number.isFinite(Number(prof.supporter_total_cents))) supporterTotalCents = Number(prof.supporter_total_cents) || 0;
      }
    } catch (err) {
      console.warn('[AuthContext] enrichUserWithProfile warning:', err);
    }

    // Repli serveur via Service Role (bypasse les restrictions RLS Supabase client)
    if (!isPro && (email || userId) && !isMaster) {
      try {
        const checkRes = await fetch(`/api/activate-pro?action=check-status&userId=${encodeURIComponent(userId || '')}&email=${encodeURIComponent(email)}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData?.isPro) {
            isPro = true;
            passStatus = 'pro';
            if (checkData.expiresAt) expiresAt = checkData.expiresAt;
            if (checkData.daysRemaining !== undefined) daysRemaining = checkData.daysRemaining;
          }
        }
      } catch (_) {}
    }

    if (isMaster) {
      isPro = true;
      passStatus = 'pro';
      role = 'admin';
      expiresAt = 'Illimité (Fondateur)';
      daysRemaining = 9999;
    }

    return {
      ...rawUser,
      isPro,
      is_pro: isPro,
      pass_status: passStatus,
      expires_at: expiresAt,
      pro_expires_at: expiresAt,
      expiresAt,
      daysRemaining,
      is_supporter: isSupporter,
      supporter_total_cents: supporterTotalCents,
      role,
      name: fullName || email.split('@')[0] || 'Cinéphile',
      user_metadata: {
        ...(rawUser.user_metadata || {}),
        isPro,
        is_pro: isPro,
        pass_status: passStatus,
        expires_at: expiresAt,
        daysRemaining,
        is_supporter: isSupporter,
        full_name: fullName
      }
    };
  };

  const refreshProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      if (session?.user) {
        const enriched = await enrichUserWithProfile(session.user);
        setUser(enriched);
        setSession(session);
        return enriched;
      }
    } catch (err) {
      console.warn('[AuthContext] refreshProfile error:', err);
    }

    const currentUser = user || authService.getStoredUser();
    if (currentUser) {
      const enriched = await enrichUserWithProfile(currentUser);
      setUser(enriched);
      return enriched;
    }
    return null;
  };

  useEffect(() => {
    // 2. Récupération initiale synchrone/asynchrone de la session et enrichissement du profil
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const enriched = await enrichUserWithProfile(session.user);
        setUser(enriched);
        setSession(session);
      } else {
        const stored = authService.getStoredUser();
        if (stored) {
          const enriched = await enrichUserWithProfile(stored);
          setUser(enriched);
        }
      }
      setLoading(false);
    }).catch(async err => {
      console.warn('[AuthContext] getSession fallback to local:', err);
      const stored = authService.getStoredUser();
      if (stored) {
        const enriched = await enrichUserWithProfile(stored);
        setUser(enriched);
      }
      setLoading(false);
    });

    // 3. Écouteur en temps réel de tous les changements d'état (login, logout, OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] onAuthStateChange event:', event, session?.user?.email);
      if (session?.user) {
        const enriched = await enrichUserWithProfile(session.user);
        setUser(enriched);
        setSession(session);
        
        // Nettoyage de l'URL après un callback OAuth réussi
        if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          if (url.hash.includes('access_token=') || url.searchParams.has('code')) {
            url.hash = '';
            url.searchParams.delete('code');
            window.history.replaceState({}, document.title, url.pathname + url.search);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
        authService.logout();
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const setAuthUser = (newUser: any) => {
    setUser(newUser);
    if (newUser) {
      localStorage.setItem('cineia_user', JSON.stringify(newUser));
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    const cleanEmail = (email || '').trim();
    const res = await authService.login(cleanEmail, password);
    if (res.success && res.user) {
      setUser(res.user);
      const mockSession: any = {
        access_token: res.token || `tok_${Date.now()}`,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: '',
        user: res.user
      };
      setSession(mockSession);
      return { data: { user: res.user, session: mockSession }, error: null };
    }
    return { data: null, error: { message: res.error || 'Erreur de connexion.' } };
  };

  const signUpWithPassword = async (email: string, password: string, fullName?: string) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const res = await authService.register(fullName || cleanEmail.split('@')[0], cleanEmail, password);
    if (res.success && res.user) {
      setUser(res.user);
      const mockSession: any = {
        access_token: res.token || `tok_${Date.now()}`,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: '',
        user: res.user
      };
      setSession(mockSession);
      return { data: { user: res.user, session: mockSession }, error: null };
    }
    return { data: null, error: { message: res.error || "Erreur d'inscription." } };
  };

  const signOut = async () => {
    try {
      authService.logout();
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[AuthContext] signOut error:', err);
    }
    setUser(null);
    setSession(null);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      signOut, 
      signInWithGoogle,
      signInWithPassword,
      signUpWithPassword,
      setAuthUser,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
