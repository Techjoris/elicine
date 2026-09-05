import { UserProfile, Movie } from '../types';

interface StoredAccount {
  id: string;
  username?: string;
  email: string;
  name: string;
  avatar?: string;
  provider?: 'google' | 'credentials';
  passwordHash: string;
  isPro: boolean;
  proPlanType?: 'monthly' | 'yearly';
  proPlanExpiresAt?: string | null;
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
   * Inscription d'un nouvel utilisateur
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

    if (!cleanUsername && !cleanEmail) {
      return { success: false, error: "Veuillez fournir un nom d'utilisateur ou un email." };
    }

    // 1. Tenter l'appel API Vercel /api/auth/register si disponible
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          email: cleanEmail,
          password
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          if (data.token) {
            localStorage.setItem(SESSION_TOKEN_KEY, data.token);
          }
          // Sauvegarder aussi localement pour persistance hors-ligne
          await this.saveLocalAccount(data.user, password);
          return { success: true, user: data.user, token: data.token };
        }
      } else {
        const errData = await res.json().catch(() => null);
        if (errData?.error && res.status !== 404) {
          return { success: false, error: errData.error };
        }
      }
    } catch {
      // Ignorer l'erreur réseau / hors-ligne pour basculer sur le stockage local
    }

    // 2. Gestion locale (Offline / Capacitor Android / Preview)
    const accounts = getStoredAccounts();
    const exists = accounts.some(
      acc =>
        (cleanEmail && acc.email.toLowerCase() === cleanEmail) ||
        (cleanUsername && acc.username.toLowerCase() === cleanUsername.toLowerCase())
    );

    if (exists) {
      return {
        success: false,
        error: 'Un compte existe déjà avec cette adresse email ou ce pseudo.'
      };
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const referralCode = `CINE-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const displayName = cleanUsername || cleanEmail.split('@')[0];
    const finalEmail = cleanEmail || `${cleanUsername.toLowerCase()}@elicine.app`;

    const salt = userId;
    const passwordHash = await hashPassword(password, salt);
    const token = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const newProfile: UserProfile = {
      id: userId,
      username: cleanUsername || cleanEmail.split('@')[0],
      email: finalEmail,
      name: displayName,
      provider: 'credentials',
      isPro: false,
      referralCode,
      createdAt: new Date().toISOString(),
      myList: [],
      token
    };

    const newAccount: StoredAccount = {
      ...newProfile,
      passwordHash
    };

    accounts.push(newAccount);
    saveStoredAccounts(accounts);
    localStorage.setItem(SESSION_TOKEN_KEY, token);

    return { success: true, user: newProfile, token };
  },

  /**
   * Connexion d'un utilisateur par Email ou Nom d'utilisateur
   */
  async login(
    identifier: string,
    password: string
  ): Promise<{ success: boolean; user?: UserProfile; token?: string; error?: string }> {
    const pwdCheck = this.validatePassword(password);
    if (!pwdCheck.valid) {
      return { success: false, error: pwdCheck.error };
    }

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      return { success: false, error: "Veuillez saisir votre email ou nom d'utilisateur." };
    }

    // 1. Tenter l'appel API Vercel /api/auth/login
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: cleanIdentifier,
          password
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          if (data.token) {
            localStorage.setItem(SESSION_TOKEN_KEY, data.token);
          }
          // Restaurer la liste locale associée à l'utilisateur
          const savedList = this.getUserWatchlist(data.user.id);
          const fullUser: UserProfile = {
            ...data.user,
            myList: savedList
          };
          return { success: true, user: fullUser, token: data.token };
        }
      } else {
        const errData = await res.json().catch(() => null);
        if (errData?.error && res.status !== 404) {
          return { success: false, error: errData.error };
        }
      }
    } catch {
      // Ignorer l'erreur réseau pour continuer vers le fallback local
    }

    // 2. Vérification locale (Offline / Capacitor)
    const accounts = getStoredAccounts();
    const match = accounts.find(
      acc =>
        acc.email.toLowerCase() === cleanIdentifier.toLowerCase() ||
        acc.username.toLowerCase() === cleanIdentifier.toLowerCase()
    );

    if (match) {
      const salt = match.id;
      const expectedHash = await hashPassword(password, salt);
      if (match.passwordHash !== expectedHash) {
        return { success: false, error: 'Mot de passe incorrect.' };
      }

      const token = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem(SESSION_TOKEN_KEY, token);

      const userProfile: UserProfile = {
        id: match.id,
        username: match.username,
        email: match.email,
        name: match.name,
        avatar: match.avatar,
        provider: match.provider || 'credentials',
        isPro: match.isPro,
        proPlanType: match.proPlanType,
        proPlanExpiresAt: match.proPlanExpiresAt,
        referralCode: match.referralCode,
        createdAt: match.createdAt,
        myList: this.getUserWatchlist(match.id),
        token
      };

      return { success: true, user: userProfile, token };
    }

    // 3. Frictionless Netflix fallback: si c'est un compte non encore inscrit,
    // création automatique ou connexion fluide si identifiant valide
    const isEmail = cleanIdentifier.includes('@');
    const autoUsername = isEmail ? cleanIdentifier.split('@')[0] : cleanIdentifier;
    const autoEmail = isEmail ? cleanIdentifier.toLowerCase() : `${cleanIdentifier.toLowerCase()}@elicine.app`;
    const autoName = autoUsername.charAt(0).toUpperCase() + autoUsername.slice(1);

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const referralCode = `CINE-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const token = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const autoUser: UserProfile = {
      id: userId,
      username: autoUsername,
      email: autoEmail,
      name: autoName,
      provider: 'credentials',
      isPro: false,
      referralCode,
      createdAt: new Date().toISOString(),
      myList: [],
      token
    };

    await this.saveLocalAccount(autoUser, password);
    localStorage.setItem(SESSION_TOKEN_KEY, token);

    return { success: true, user: autoUser, token };
  },

  /**
   * Connexion sécurisée avec Google (One-Tap / OAuth ou Fallback fluide)
   */
  async loginWithGoogle(mockGoogleUser?: {
    email?: string;
    name?: string;
    avatar?: string;
  }): Promise<{ success: boolean; user?: UserProfile; token?: string; error?: string }> {
    // 1. Tenter l'appel API Vercel /api/auth/google
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockGoogleUser || {})
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          if (data.token) {
            localStorage.setItem(SESSION_TOKEN_KEY, data.token);
          }
          const savedList = this.getUserWatchlist(data.user.id);
          const fullUser: UserProfile = {
            ...data.user,
            avatar: data.user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
            provider: 'google',
            myList: savedList
          };
          await this.saveLocalAccount(fullUser);
          return { success: true, user: fullUser, token: data.token };
        }
      }
    } catch {
      // Basculer sur le stockage local sécurisé
    }

    // 2. Traitement local / hors-ligne / Capacitor Android
    const email = (mockGoogleUser?.email || 'cinéphile.google@gmail.com').trim().toLowerCase();
    const name = (mockGoogleUser?.name || 'Cinéphile Google').trim();
    const avatar = mockGoogleUser?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80';
    const username = email.split('@')[0];

    const accounts = getStoredAccounts();
    const existing = accounts.find(a => a.email.toLowerCase() === email || a.provider === 'google');

    if (existing) {
      const token = `tok_google_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem(SESSION_TOKEN_KEY, token);

      const userProfile: UserProfile = {
        id: existing.id,
        username: existing.username || username,
        email: existing.email,
        name: existing.name || name,
        avatar: existing.avatar || avatar,
        provider: 'google',
        isPro: existing.isPro,
        proPlanType: existing.proPlanType,
        proPlanExpiresAt: existing.proPlanExpiresAt,
        referralCode: existing.referralCode,
        createdAt: existing.createdAt,
        myList: this.getUserWatchlist(existing.id),
        token
      };

      await this.saveLocalAccount(userProfile);
      return { success: true, user: userProfile, token };
    }

    const userId = `usr_google_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const referralCode = `CINE-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const token = `tok_google_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const newUser: UserProfile = {
      id: userId,
      username,
      email,
      name,
      avatar,
      provider: 'google',
      isPro: false,
      referralCode,
      createdAt: new Date().toISOString(),
      myList: [],
      token
    };

    await this.saveLocalAccount(newUser);
    localStorage.setItem(SESSION_TOKEN_KEY, token);

    return { success: true, user: newUser, token };
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
   * Déconnexion
   */
  logout(): void {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem('cineia_user');
  }
};
