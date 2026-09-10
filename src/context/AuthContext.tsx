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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Récupération synchrone immédiate depuis le LocalStorage pour éviter tout décalage visuel
  const [user, setUser] = useState<User | any | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        // A. Jeton / Session Supabase standard
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

        // B. Compte utilisateur sauvegardé localement
        const localUser = authService.getStoredUser();
        if (localUser) return localUser;

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

  useEffect(() => {
    // 2. Récupération initiale synchrone/asynchrone de la session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setSession(session);
      } else {
        const stored = authService.getStoredUser();
        if (stored) {
          setUser(stored);
        }
      }
      setLoading(false);
    }).catch(err => {
      console.warn('[AuthContext] getSession fallback to local:', err);
      const stored = authService.getStoredUser();
      if (stored) {
        setUser(stored);
      }
      setLoading(false);
    });

    // 3. Écouteur en temps réel de tous les changements d'état (login, logout, OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthContext] onAuthStateChange event:', event, session?.user?.email);
      if (session?.user) {
        setUser(session.user);
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
      setAuthUser
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
