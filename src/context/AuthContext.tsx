import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, signInWithGoogle } from '../lib/supabase';

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

        // B. Profil local / email synchronisé
        const localUserRaw = localStorage.getItem('cineia_user');
        if (localUserRaw) {
          const parsedLocal = JSON.parse(localUserRaw);
          if (parsedLocal?.email || parsedLocal?.id) {
            return {
              id: parsedLocal.id,
              email: parsedLocal.email,
              user_metadata: {
                full_name: parsedLocal.name,
                name: parsedLocal.name,
                avatar_url: parsedLocal.avatar,
                isPro: parsedLocal.isPro
              },
              ...parsedLocal
            };
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

  useEffect(() => {
    // 2. Récupération initiale synchrone/asynchrone de la session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setSession(session);
      }
      setLoading(false);
    }).catch(err => {
      console.warn('[AuthContext] getSession error:', err);
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
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const setAuthUser = (newUser: any) => {
    setUser(newUser);
  };

  const signInWithPassword = async (email: string, password: string) => {
    const res = await supabase.auth.signInWithPassword({ email, password });
    if (res.data?.user) {
      setUser(res.data.user);
      setSession(res.data.session);
    }
    return res;
  };

  const signUpWithPassword = async (email: string, password: string, fullName?: string) => {
    const res = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: fullName ? { full_name: fullName } : undefined
      }
    });
    if (res.data?.user) {
      setUser(res.data.user);
      setSession(res.data.session);
    }
    return res;
  };

  const signOut = async () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cineia_user');
      }
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
