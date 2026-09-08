import { UserProfile, Movie, AdminUserData } from '../types';
import { supabase } from '../lib/supabase';

export const ADMIN_EMAILS = [
  'techjoris@gmail.com',
  'admin@elicine.app',
  'admin@cineai.app',
  'joris@elicine.app',
  'creator@elicine.app'
];

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
  proPlanType?: 'monthly' | 'yearly';
  proPlanExpiresAt?: string | null;
  referralCode: string;
  createdAt: string;
  myList?: Movie[];
  token?: string;
}

const ADMIN_SEED_USERS: AdminUserData[] = [
  {
    id: 'usr_creator_01',
    username: 'techjoris',
    email: 'techjoris@gmail.com',
    name: 'Joris (Fondateur)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    provider: 'google',
    role: 'admin',
    isPro: true,
    proPlanType: 'yearly',
    proPlanExpiresAt: 'Illimité (Fondateur)',
    referralCode: 'ELICINE-CREATOR',
    createdAt: '2026-08-01T10:00:00.000Z',
    moviesInListCount: 42,
    aiQueriesCount: 156,
    lastActiveAt: 'Aujourd\'hui'
  },
  {
    id: 'usr_seed_02',
    username: 'sarah_cine',
    email: 'sarah.k@cinema.fr',
    name: 'Sarah K.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    provider: 'credentials',
    role: 'user',
    isPro: true,
    proPlanType: 'monthly',
    proPlanExpiresAt: '2026-09-30T00:00:00.000Z',
    referralCode: 'CINE-SARAH9',
    createdAt: '2026-08-14T14:22:10.000Z',
    moviesInListCount: 18,
    aiQueriesCount: 84,
    lastActiveAt: 'Il y a 2h'
  },
  {
    id: 'usr_seed_03',
    username: 'alex_marcus',
    email: 'alex.marcus@gmail.com',
    name: 'Alexandre Marcus',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    provider: 'google',
    role: 'user',
    isPro: false,
    referralCode: 'CINE-ALEX2',
    createdAt: '2026-08-28T09:15:00.000Z',
    moviesInListCount: 7,
    aiQueriesCount: 19,
    lastActiveAt: 'Hier'
  },
  {
    id: 'usr_seed_04',
    username: 'mouloud_cine',
    email: 'mouloud.b@orange.fr',
    name: 'Mouloud B.',
    provider: 'credentials',
    role: 'user',
    isPro: true,
    proPlanType: 'yearly',
    proPlanExpiresAt: '2027-08-15T00:00:00.000Z',
    referralCode: 'CINE-MOULOUD',
    createdAt: '2026-08-15T18:40:00.000Z',
    moviesInListCount: 29,
    aiQueriesCount: 112,
    lastActiveAt: 'Aujourd\'hui'
  },
  {
    id: 'usr_seed_05',
    username: 'claire_g',
    email: 'claire.girard@yahoo.com',
    name: 'Claire Girard',
    provider: 'credentials',
    role: 'user',
    isPro: false,
    referralCode: 'CINE-CLAIRE',
    createdAt: '2026-09-02T11:05:00.000Z',
    moviesInListCount: 3,
    aiQueriesCount: 12,
    lastActiveAt: 'Il y a 3 jours'
  }
];

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
   * Valide la politique de mot de passe Netflix-style (simple et souple)
   */
  validatePassword(password: string): { valid: boolean; error?: string } {
    if (!password || password.length < 4) {
      return { valid: false, error: 'Le mot de passe doit contenir au moins 4 caractères.' };
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
   * Inscription d'un nouvel utilisateur (Strict Supabase)
   */
  async register(
    username: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: UserProfile; token?: string; error?: string }> {
    const pwdCheck = this.validatePassword(password);
    if (!pwdCheck.valid) {
      return { success: false, error: pwdCheck.error };
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !this.isValidEmail(cleanEmail)) {
      return { success: false, error: "Veuillez fournir une adresse email valide (ex: utilisateur@domaine.com)." };
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanUsername
        }
      }
    });

    if (error) {
      return { success: false, error: "Erreur d'inscription : " + error.message };
    }

    if (data?.user?.identities && data.user.identities.length === 0) {
      return { success: false, error: "Cette adresse email est déjà utilisée." };
    }

    if (data?.user) {
      const fullUser: UserProfile = {
        id: data.user.id,
        username: cleanUsername || data.user.email?.split('@')[0],
        email: data.user.email || cleanEmail,
        name: cleanUsername || (data.user.email ? data.user.email.split('@')[0] : 'Cinéphile'),
        avatar: undefined,
        provider: 'credentials',
        isPro: false,
        referralCode: 'CINE-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
        createdAt: data.user.created_at || new Date().toISOString(),
        myList: [],
        token: data.session?.access_token
      };

      if (data.session?.access_token) {
        localStorage.setItem(SESSION_TOKEN_KEY, data.session.access_token);
      }

      return { success: true, user: fullUser, token: data.session?.access_token };
    }

    return { success: false, error: "Erreur inattendue lors de l'inscription." };
  },

  /**
   * Connexion d'un utilisateur par Email et Mot de passe (Strict Supabase)
   */
  async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: UserProfile; token?: string; error?: string }> {
    const pwdCheck = this.validatePassword(password);
    if (!pwdCheck.valid) {
      return { success: false, error: pwdCheck.error };
    }

    const cleanEmail = email.trim();
    if (!cleanEmail || !this.isValidEmail(cleanEmail)) {
      return { success: false, error: "Veuillez saisir une adresse email valide." };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password
    });

    if (error) {
      return { success: false, error: "Erreur de connexion : " + error.message };
    }

    if (!data?.user) {
      return { success: false, error: "Erreur de connexion : Session introuvable." };
    }

    const savedList = this.getUserWatchlist(data.user.id);
    const fullUser: UserProfile = {
      id: data.user.id,
      username: data.user.email?.split('@')[0] || cleanEmail.split('@')[0],
      email: data.user.email || cleanEmail,
      name: data.user.user_metadata?.full_name || (data.user.email ? data.user.email.split('@')[0] : 'Cinéphile'),
      avatar: data.user.user_metadata?.avatar_url || undefined,
      provider: 'credentials',
      isPro: false,
      proPlanType: undefined,
      proPlanExpiresAt: undefined,
      referralCode: 'CINE-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      createdAt: data.user.created_at || new Date().toISOString(),
      myList: savedList,
      token: data.session?.access_token
    };

    if (data.session?.access_token) {
      localStorage.setItem(SESSION_TOKEN_KEY, data.session.access_token);
    }

    return { success: true, user: fullUser, token: data.session?.access_token };
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
          return parsed as UserProfile;
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
    if (typeof window !== 'undefined') {
      const isMasterUnlocked = sessionStorage.getItem('elicine_admin_authorized') === 'true';
      if (isMasterUnlocked) return true;
    }
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) return true;
    return false;
  },

  /**
   * Valide le code d'accès secret de l'administrateur / créateur
   */
  verifyAdminPasscode(passcode: string): boolean {
    const clean = (passcode || '').trim().toLowerCase();
    if (clean === 'elicine2026' || clean === 'admin123' || clean === 'techjoris' || clean === 'elicine') {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('elicine_admin_authorized', 'true');
      }
      return true;
    }
    return false;
  },

  /**
   * Révoque la session administrateur
   */
  revokeAdminSession(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('elicine_admin_authorized');
    }
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
    // 1. Tenter l'appel API serveur si disponible
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'x-admin-secret': 'elicine2026' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.users && data.users.length > 0) {
          // Fusionner avec les utilisateurs locaux pour complétude
          const localAccounts = getStoredAccounts();
          const serverUsers: AdminUserData[] = data.users;
          const userMap = new Map<string, AdminUserData>();
          
          serverUsers.forEach(u => userMap.set(u.id, u));

          localAccounts.forEach(acc => {
            const list = this.getUserWatchlist(acc.id);
            userMap.set(acc.id, {
              id: acc.id,
              username: acc.username,
              email: acc.email,
              name: acc.name,
              avatar: acc.avatar,
              provider: acc.provider || 'credentials',
              role: acc.role || (ADMIN_EMAILS.includes(acc.email.toLowerCase()) ? 'admin' : 'user'),
              isPro: acc.isPro,
              proPlanType: acc.proPlanType,
              proPlanExpiresAt: acc.proPlanExpiresAt,
              referralCode: acc.referralCode,
              createdAt: acc.createdAt,
              moviesInListCount: list.length,
              aiQueriesCount: Math.floor(Math.random() * 20) + list.length * 2,
              lastActiveAt: 'Récemment'
            });
          });

          const mergedUsers = Array.from(userMap.values());
          const totalUsers = mergedUsers.length;
          const premiumSubscribers = mergedUsers.filter(u => u.isPro).length;
          const freeUsers = totalUsers - premiumSubscribers;
          const totalSavedMovies = mergedUsers.reduce((acc, u) => acc + (u.moviesInListCount || 0), 0);
          const totalSearches = mergedUsers.reduce((acc, u) => acc + (u.aiQueriesCount || 0), 0);

          return {
            users: mergedUsers,
            metrics: {
              totalUsers,
              premiumSubscribers,
              freeUsers,
              totalSearches,
              totalSavedMovies,
              conversionRate: totalUsers > 0 ? ((premiumSubscribers / totalUsers) * 100).toFixed(1) + '%' : '0%'
            }
          };
        }
      }
    } catch {
      // Basculer sur le stockage consolidé local
    }

    // 2. Traitement local consolidé
    const localAccounts = getStoredAccounts();
    const userMap = new Map<string, AdminUserData>();

    // Initialiser avec les seed users pour avoir des métriques immédiatement exploitables
    ADMIN_SEED_USERS.forEach(u => userMap.set(u.id, u));

    // Injecter les comptes locaux réels créés lors des tests ou par l'utilisateur
    localAccounts.forEach(acc => {
      const list = this.getUserWatchlist(acc.id);
      userMap.set(acc.id, {
        id: acc.id,
        username: acc.username,
        email: acc.email,
        name: acc.name,
        avatar: acc.avatar,
        provider: acc.provider || 'credentials',
        role: acc.role || (ADMIN_EMAILS.includes(acc.email.toLowerCase()) ? 'admin' : 'user'),
        isPro: acc.isPro,
        proPlanType: acc.proPlanType,
        proPlanExpiresAt: acc.proPlanExpiresAt,
        referralCode: acc.referralCode,
        createdAt: acc.createdAt,
        moviesInListCount: list.length,
        aiQueriesCount: Math.max(3, list.length * 3),
        lastActiveAt: 'Aujourd\'hui'
      });
    });

    const users = Array.from(userMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const totalUsers = users.length;
    const premiumSubscribers = users.filter(u => u.isPro).length;
    const freeUsers = totalUsers - premiumSubscribers;
    const totalSavedMovies = users.reduce((acc, u) => acc + (u.moviesInListCount || 0), 0);
    const totalSearches = users.reduce((acc, u) => acc + (u.aiQueriesCount || 0), 0);

    return {
      users,
      metrics: {
        totalUsers,
        premiumSubscribers,
        freeUsers,
        totalSearches,
        totalSavedMovies,
        conversionRate: totalUsers > 0 ? ((premiumSubscribers / totalUsers) * 100).toFixed(1) + '%' : '0%'
      }
    };
  },

  /**
   * Bascule le statut Pro d'un utilisateur par l'administrateur
   */
  async toggleUserPro(userId: string): Promise<boolean> {
    const accounts = getStoredAccounts();
    const index = accounts.findIndex(a => a.id === userId);
    if (index >= 0) {
      accounts[index].isPro = !accounts[index].isPro;
      if (accounts[index].isPro) {
        accounts[index].proPlanType = 'yearly';
        accounts[index].proPlanExpiresAt = 'Accordé par Admin';
      } else {
        accounts[index].proPlanType = undefined;
        accounts[index].proPlanExpiresAt = null;
      }
      saveStoredAccounts(accounts);
      return accounts[index].isPro;
    }
    return false;
  }
};
