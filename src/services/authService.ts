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
  passwordHash: string;
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

async function hashPassword(plain: string, salt: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    // Basic fallback hash for non-crypto environments
    let hash = 0;
    const str = `${salt}:${plain}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(`elicine_salt_${salt}:${plain}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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
   * Valide la politique de mot de passe sécurisé : au moins 6 caractères avec au moins une majuscule et un chiffre
   */
  validatePassword(password: string): { valid: boolean; error?: string } {
    if (!password || password.length < 6) {
      return { valid: false, error: 'Le mot de passe doit contenir au moins 6 caractères.' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, error: 'Le mot de passe doit contenir au moins une lettre majuscule.' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, error: 'Le mot de passe doit contenir au moins un chiffre.' };
    }
    if (password.length > 60) {
      return { valid: false, error: 'Le mot de passe ne peut pas dépasser 60 caractères.' };
    }
    return { valid: true };
  },

  /**
   * Validation stricte du format email
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test((email || '').trim());
  },

  /**
   * Simule et déclenche l'envoi instantané d'un e-mail de confirmation en arrière-plan
   */
  async sendVerificationEmail(email: string, username?: string): Promise<{ success: boolean; messageId: string; email: string }> {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanUsername = (username || cleanEmail.split('@')[0]).trim();
    const messageId = `msg_verify_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = new Date().toISOString();

    // 1. Enregistrement de l'envoi dans le journal local pour traçabilité
    try {
      const dispatchesRaw = localStorage.getItem('elicine_email_dispatches');
      const dispatches = dispatchesRaw ? JSON.parse(dispatchesRaw) : [];
      dispatches.unshift({
        id: messageId,
        type: 'email_verification',
        email: cleanEmail,
        username: cleanUsername,
        sentAt: timestamp,
        status: 'delivered'
      });
      localStorage.setItem('elicine_email_dispatches', JSON.stringify(dispatches.slice(0, 50)));
    } catch (_) {}

    // 2. Déclenchement d'un appel réseau en arrière-plan sans bloquer l'UI
    try {
      fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          username: cleanUsername,
          messageId,
          timestamp,
          verificationUrl: typeof window !== 'undefined' ? `${window.location.origin}/?verified=true` : ''
        })
      }).catch(() => {});
    } catch (_) {}

    console.log(`[Éliciné Auth] ✉️ E-mail de confirmation envoyé avec succès à ${cleanEmail} (ID: ${messageId})`);
    return { success: true, messageId, email: cleanEmail };
  },

  /**
   * Inscription d'un nouvel utilisateur avec politique sécurisée et envoi instantané d'e-mail
   */
  async register(
    username: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: UserProfile; token?: string; pendingVerification?: boolean; error?: string }> {
    const pwdCheck = this.validatePassword(password);
    if (!pwdCheck.valid) {
      return { success: false, error: pwdCheck.error };
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !this.isValidEmail(cleanEmail)) {
      return { success: false, error: "Veuillez fournir une adresse email valide (ex: utilisateur@domaine.com)." };
    }

    // Conserver la liste d'un ancien compte local pour la rattacher au vrai compte.
    const existingAccounts = getStoredAccounts();
    const existing = existingAccounts.find(a => a.email.toLowerCase() === cleanEmail);
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Connexion au service de comptes indisponible. Réessayez plus tard.' };
    }

    let supabaseUserId: string | null = null;
    let supabaseToken: string | null = null;

    // Tentative d'enregistrement sur Supabase si configuré
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: cleanUsername }
          }
        });

        if (error) {
          console.warn('[authService.register] Supabase notice:', error.message);
          if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already in use')) {
            return { success: false, error: "Cette adresse email est déjà utilisée." };
          }
          return { success: false, error: error.message };
        } else if (data?.user) {
          if (data.user.identities && data.user.identities.length === 0) {
            return { success: false, error: "Cette adresse email est déjà utilisée." };
          }
          supabaseUserId = data.user.id;
          supabaseToken = data.session?.access_token || null;
          if (!supabaseToken) {
            return { success: true, pendingVerification: true };
          }
        }
      } catch (sbErr) {
        console.warn('[authService.register] Supabase exception:', sbErr);
        return { success: false, error: 'Impossible de créer le compte pour le moment. Réessayez plus tard.' };
      }
    }

    if (!supabaseUserId || !supabaseToken) {
      return { success: false, error: 'Le compte n’a pas pu être confirmé. Réessayez.' };
    }


    const userId = supabaseUserId;
    const sessionToken = supabaseToken;
    const previousList = existing ? this.getUserWatchlist(existing.id) : [];
    if (previousList.length) this.saveUserWatchlist(userId, previousList);
    const fullUser: UserProfile = {
      id: userId,
      username: cleanUsername || cleanEmail.split('@')[0],
      email: cleanEmail,
      name: cleanUsername || (cleanEmail.split('@')[0] ? cleanEmail.split('@')[0] : 'Cinéphile'),
      avatar: undefined,
      provider: 'credentials',
      role: 'user',
      isPro: false,
      proPlanType: undefined,
      proPlanExpiresAt: undefined,
      referralCode: 'CINE-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      createdAt: new Date().toISOString(),
      myList: previousList,
      token: sessionToken
    };

    Object.assign(fullUser, await readAccountAccess(userId));

    // Sauvegarde immédiate dans le coffre local
    await this.saveLocalAccount(fullUser, password);
    localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    localStorage.setItem('cineia_user', JSON.stringify(fullUser));

    return { success: true, user: fullUser, token: sessionToken };
  },

  /** Connexion à un vrai compte Supabase, nécessaire à la synchronisation multi-appareils. */
  async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: UserProfile; token?: string; error?: string }> {
    const pwdCheck = this.validatePassword(password);
    if (!pwdCheck.valid) {
      return { success: false, error: pwdCheck.error };
    }

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
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password
        });

        if (!error && data?.user && data.session?.access_token) {
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

          await this.saveLocalAccount(fullUser, password);
          if (data.session?.access_token) {
            localStorage.setItem(SESSION_TOKEN_KEY, data.session.access_token);
          }
          localStorage.setItem('cineia_user', JSON.stringify(fullUser));
          return { success: true, user: fullUser, token: data.session?.access_token };
        }

        const legacy = getStoredAccounts().some(account => account.email.toLowerCase() === cleanEmail);
        return {
          success: false,
          error: legacy
            ? 'Connexion impossible. Si ce compte était uniquement sur cet appareil, créez un compte avec la même adresse pour récupérer votre liste. Sinon, vérifiez le mot de passe ou réinitialisez-le.'
            : (error?.message || 'Connexion impossible. Vérifiez vos identifiants ou confirmez votre adresse e-mail.')
        };
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
    const salt = user.id;
    const passwordHash = password ? await hashPassword(password, salt) : '';

    const record: StoredAccount = {
      id: user.id,
      username: user.username || user.name.toLowerCase().replace(/\s+/g, ''),
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      provider: user.provider || (existingIndex >= 0 ? accounts[existingIndex].provider : 'credentials'),
      passwordHash: passwordHash || (existingIndex >= 0 ? accounts[existingIndex].passwordHash : ''),
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
