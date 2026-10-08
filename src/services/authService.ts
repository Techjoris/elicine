import { createEmailAuth, validateNewPassword, isAuthEmail } from '../lib/emailAuth';
import { readAccountAccess } from './accountAccessService';
import { UserProfile, Movie, AdminUserData } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mergeWatchlists } from './watchlistService';

interface StoredAccount {
  id: string;
  username?: string;
  email: string;
  name: string;
  avatar?: string;
  provider?: 'google' | 'credentials';
  role?: 'admin' | 'user';
  isPro: boolean;
  proPlanType?: 'monthly' | 'yearly' | 'free' | string;
  proPlanExpiresAt?: string | null;
  expires_at?: string | null;
  daysRemaining?: number | null;
  referralCode: string;
  createdAt: string;
  myList?: Movie[];
  token?: string;
}

const ACCOUNTS_STORAGE_KEY = 'cineia_registered_accounts';
const SESSION_TOKEN_KEY = 'cineia_session_token';

const emailAuth = createEmailAuth(supabase, () => typeof window !== 'undefined' ? window.location.origin : 'https://elicine.com');

function getStoredAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    const accounts = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(accounts)) return [];
    const clean = accounts.map(({ passwordHash, password, token, ...account }) => account);
    if (accounts.some(account => 'passwordHash' in account || 'password' in account || 'token' in account)) saveStoredAccounts(clean);
    return clean;
  } catch (e) {
    console.error('Erreur lecture comptes locaux:', e);
    return [];
  }
}

function saveStoredAccounts(accounts: StoredAccount[]): void {
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.error('Erreur sauvegarde comptes locaux:', e);
  }
}

export const authService = {
  /**
   * Vérifie les nouveaux mots de passe. Les mots de passe existants sont vérifiés par Supabase.
   */
  validatePassword(password: string): { valid: boolean; error?: string } {
    return validateNewPassword(password);
  },

  /**
   * Validation stricte du format email
   */
  isValidEmail(email: string): boolean {
    return isAuthEmail(email);
  },

  sendVerificationEmail(email: string) { return emailAuth.resendConfirmation(email); },
  requestPasswordReset(email: string) { return emailAuth.requestPasswordReset(email); },
  updatePassword(password: string) { return emailAuth.updatePassword(password); },

  /**
   * Inscription d'un nouvel utilisateur avec politique sécurisée et envoi instantané d'e-mail
   */
  async register(
    username: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: UserProfile; token?: string; pendingVerification?: boolean; error?: string }> {
    if (!isSupabaseConfigured()) return { success: false, error: 'Connexion au service de comptes indisponible. Réessayez plus tard.' };
    return emailAuth.register(email, password, username);
  },

  /** Connexion à un vrai compte Supabase, nécessaire à la synchronisation multi-appareils. */
  async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: UserProfile; token?: string; error?: string; errorCode?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !this.isValidEmail(cleanEmail)) {
      return { success: false, error: "Veuillez saisir une adresse email valide." };
    }


    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Connexion au service de comptes indisponible. Réessayez plus tard.' };
    }

    // 1. Tenter Supabase si configuré
    if (isSupabaseConfigured()) {
      try {
        const attempt = await emailAuth.login(cleanEmail, password);
        if (!attempt.success) return attempt;
        const data = attempt.data;
        if (data?.user && data.session?.access_token) {
          const legacy = getStoredAccounts().find(account => account.email.toLowerCase() === cleanEmail);
          const savedList = mergeWatchlists(
            this.getUserWatchlist(data.user.id),
            legacy && legacy.id !== data.user.id ? this.getUserWatchlist(legacy.id) : []
          );
          if (savedList.length) this.saveUserWatchlist(data.user.id, savedList);
          const fullUser: UserProfile = {
            id: data.user.id,
            username: data.user.email?.split('@')[0] || cleanEmail.split('@')[0],
            email: data.user.email || cleanEmail,
            name: data.user.user_metadata?.full_name || (data.user.email ? data.user.email.split('@')[0] : 'Cinéphile'),
            avatar: data.user.user_metadata?.avatar_url || undefined,
            provider: 'credentials',
            role: 'user',
            isPro: false,
            proPlanType: undefined,
            proPlanExpiresAt: undefined,
            referralCode: 'CINE-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
            createdAt: data.user.created_at || new Date().toISOString(),
            myList: savedList,
            token: data.session?.access_token
          };

          Object.assign(fullUser, await readAccountAccess(data.user.id));

          await this.saveLocalAccount(fullUser);
          if (data.session?.access_token) {
            localStorage.setItem(SESSION_TOKEN_KEY, data.session.access_token);
          }
          localStorage.setItem('cineia_user', JSON.stringify(fullUser));
          return { success: true, user: fullUser, token: data.session?.access_token };
        }

        return { success: false, error: 'Connexion impossible. Vérifiez votre adresse e-mail et votre mot de passe.', errorCode: 'invalid_credentials' };
      } catch (sbErr) {
        console.warn('[authService.login] Supabase error:', sbErr);
        return { success: false, error: 'Connexion au compte indisponible. Réessayez plus tard.' };
      }
    }

    return { success: false, error: 'Connexion au compte indisponible. Réessayez plus tard.' };
  },

  /**
   * Connexion sécurisée avec Google (OAuth Supabase strict - aucun simulateur local)
   */
  async loginWithGoogle(): Promise<{ success: boolean; user?: UserProfile; token?: string; error?: string }> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : ''
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erreur lors de la connexion avec Google.' };
    }
  },

  /**
   * Sauvegarde un compte dans le registre local
   */
  async saveLocalAccount(user: UserProfile, password?: string): Promise<void> {
    const accounts = getStoredAccounts();
    const existingIndex = accounts.findIndex(a => a.id === user.id);

    const record: StoredAccount = {
      id: user.id,
      username: user.username || user.name.toLowerCase().replace(/\s+/g, ''),
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      provider: user.provider || (existingIndex >= 0 ? accounts[existingIndex].provider : 'credentials'),
      isPro: user.isPro,
      proPlanType: user.proPlanType,
      proPlanExpiresAt: user.proPlanExpiresAt,
      referralCode: user.referralCode,
      createdAt: user.createdAt,
      myList: user.myList || []
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = record;
    } else {
      accounts.push(record);
    }

    saveStoredAccounts(accounts);
  },

  /**
   * Récupère la watchlist associée à un ID utilisateur
   */
  getUserWatchlist(userId: string): Movie[] {
    try {
      const raw = localStorage.getItem(`cineia_watchlist_${userId}`);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error(e);
    }
    return [];
  },

  /**
   * Sauvegarde la watchlist pour un ID utilisateur
   */
  saveUserWatchlist(userId: string, watchlist: Movie[]): void {
    try {
      localStorage.setItem(`cineia_watchlist_${userId}`, JSON.stringify(watchlist));
    } catch (e) {
      console.error(e);
    }
  },

  /**
   * Récupère le profil utilisateur sauvegardé localement (cineia_user)
   */
  getStoredUser(): UserProfile | null {
    try {
      const raw = localStorage.getItem('cineia_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.email || parsed.id)) {
          return { ...parsed, role: 'user', is_admin: false, isPro: false } as UserProfile;
        }
      }
    } catch (e) {
      console.warn('[authService.getStoredUser] error:', e);
    }
    return null;
  },

  /**
   * Déconnexion
   */
  logout(): void {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem('cineia_user');
  },

  /**
   * Vérifie si un utilisateur dispose des privilèges administrateur
   */
  isAdmin(user: UserProfile | null): boolean {
    return Boolean(user?.id && (user as any).is_admin === true);
  },

  /**
   * Liste brute des comptes enregistrés localement
   */
  getRegisteredAccounts(): StoredAccount[] {
    return getStoredAccounts();
  },

  /**
   * Récupère la liste consolidée des utilisateurs pour le Dashboard Admin
   */
  async getAllAdminUsers(): Promise<{
    users: AdminUserData[];
    metrics: {
      totalUsers: number;
      premiumSubscribers: number;
      freeUsers: number;
      totalSearches: number;
      totalSavedMovies: number;
      conversionRate: string;
    };
  }> {
    return this.adminRequest('GET');
  },

  async adminRequest(method: string, body?: Record<string, unknown>): Promise<any> {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) throw new Error('Connectez-vous avec un compte administrateur.');
    const response = await fetch('/api/admin/users', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error || 'Accès administrateur refusé.');
    return result;
  },

  async toggleUserPro(userId: string, currentPro = false, email?: string): Promise<boolean> {
    const isPro = !currentPro;
    await this.adminRequest('PATCH', { userId, email, isPro });
    return isPro;
  },

  async deleteUser(userId: string, email?: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.adminRequest('DELETE', { userId, email });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
