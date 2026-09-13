import { AIQuota, UserProfile } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const MAX_FREE_DAILY_SEARCHES = 3;
const LOCAL_STORAGE_QUOTA_KEY = 'elicine_daily_ai_quota';
const LOCAL_STORAGE_DEVICE_ID_KEY = 'elicine_device_id';

interface LocalQuotaRecord {
  userId: string;
  searchDate: string;
  searchCount: number;
  remaining: number;
  max: number;
}

/**
 * Obtient ou génère un identifiant d'appareil persistant pour les visiteurs non connectés
 */
export const getPersistentDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server_guest';
  try {
    let deviceId = localStorage.getItem(LOCAL_STORAGE_DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem(LOCAL_STORAGE_DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch (_) {
    return 'fallback_guest';
  }
};

/**
 * Obtient la date du jour au format ISO local YYYY-MM-DD
 */
export const getLocalTodayDateString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Résout l'identifiant effectif (ID utilisateur authentifié ou device ID anonyme)
 */
export const resolveEffectiveUserId = (user: UserProfile | null): string => {
  if (user?.id) {
    return String(user.id).trim();
  }
  return getPersistentDeviceId();
};

/**
 * Lit le quota stocké localement
 */
const readLocalQuotaRecord = (effectiveUserId: string, today: string): LocalQuotaRecord => {
  const fallbackRecord: LocalQuotaRecord = {
    userId: effectiveUserId,
    searchDate: today,
    searchCount: 0,
    remaining: MAX_FREE_DAILY_SEARCHES,
    max: MAX_FREE_DAILY_SEARCHES
  };

  if (typeof window === 'undefined') return fallbackRecord;

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_QUOTA_KEY);
    if (!raw) return fallbackRecord;

    const parsed: LocalQuotaRecord = JSON.parse(raw);
    // Vérification du changement de date (nouveau jour = reset à 3)
    if (parsed.searchDate !== today || parsed.userId !== effectiveUserId) {
      return fallbackRecord;
    }

    return {
      userId: effectiveUserId,
      searchDate: today,
      searchCount: typeof parsed.searchCount === 'number' ? parsed.searchCount : 0,
      remaining: Math.max(0, MAX_FREE_DAILY_SEARCHES - (parsed.searchCount || 0)),
      max: MAX_FREE_DAILY_SEARCHES
    };
  } catch (e) {
    return fallbackRecord;
  }
};

/**
 * Sauvegarde le quota local
 */
const saveLocalQuotaRecord = (record: LocalQuotaRecord): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_QUOTA_KEY, JSON.stringify(record));
  } catch (_) {}
};

export const searchQuotaService = {
  /**
   * Récupère le quota actuel pour l'utilisateur en cours.
   * Combine la réactivité immédiate du LocalStorage avec la synchronisation Supabase.
   */
  async getQuota(user: UserProfile | null): Promise<AIQuota> {
    const today = getLocalTodayDateString();
    const effectiveUserId = resolveEffectiveUserId(user);

    // Les membres Pro ont des recherches illimitées
    if (user?.isPro) {
      return {
        remaining: 999,
        max: MAX_FREE_DAILY_SEARCHES,
        lastResetDate: today
      };
    }

    // 1. Lecture immédiate du cache local (optimiste)
    let local = readLocalQuotaRecord(effectiveUserId, today);

    // 2. Synchronisation en arrière-plan avec Supabase si connecté
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('user_searches')
          .select('search_count')
          .eq('user_id', effectiveUserId)
          .eq('search_date', today)
          .maybeSingle();

        if (!error && data && typeof data.search_count === 'number') {
          const mergedCount = Math.max(local.searchCount, data.search_count);
          local = {
            userId: effectiveUserId,
            searchDate: today,
            searchCount: mergedCount,
            remaining: Math.max(0, MAX_FREE_DAILY_SEARCHES - mergedCount),
            max: MAX_FREE_DAILY_SEARCHES
          };
          saveLocalQuotaRecord(local);
        }
      } catch (err) {
        console.warn('[searchQuotaService] Erreur non bloquante lecture Supabase :', err);
      }
    }

    return {
      remaining: local.remaining,
      max: MAX_FREE_DAILY_SEARCHES,
      lastResetDate: today
    };
  },

  /**
   * Vérifie si l'utilisateur est autorisé à effectuer une recherche IA
   */
  canSearch(user: UserProfile | null, currentQuota?: AIQuota): boolean {
    if (user?.isPro) return true;
    if (currentQuota) {
      return currentQuota.remaining > 0;
    }
    const today = getLocalTodayDateString();
    const effectiveUserId = resolveEffectiveUserId(user);
    const local = readLocalQuotaRecord(effectiveUserId, today);
    return local.remaining > 0;
  },

  /**
   * Enregistre une recherche réussie et incrémente le compteur quotidien.
   * Mis à jour en local immédiatement et synchronisé dans la table Supabase `user_searches`.
   */
  async recordSuccessfulSearch(user: UserProfile | null): Promise<AIQuota> {
    const today = getLocalTodayDateString();
    const effectiveUserId = resolveEffectiveUserId(user);

    // Si Pro : pas de décrémentation
    if (user?.isPro) {
      return {
        remaining: 999,
        max: MAX_FREE_DAILY_SEARCHES,
        lastResetDate: today
      };
    }

    // 1. Incrémenter localement
    const current = readLocalQuotaRecord(effectiveUserId, today);
    const nextCount = current.searchCount + 1;
    const nextRemaining = Math.max(0, MAX_FREE_DAILY_SEARCHES - nextCount);

    const updatedRecord: LocalQuotaRecord = {
      userId: effectiveUserId,
      searchDate: today,
      searchCount: nextCount,
      remaining: nextRemaining,
      max: MAX_FREE_DAILY_SEARCHES
    };
    saveLocalQuotaRecord(updatedRecord);

    // 2. Synchroniser vers la table Supabase `user_searches`
    if (isSupabaseConfigured()) {
      try {
        const { data: existing } = await supabase
          .from('user_searches')
          .select('id, search_count')
          .eq('user_id', effectiveUserId)
          .eq('search_date', today)
          .maybeSingle();

        if (existing?.id) {
          await supabase
            .from('user_searches')
            .update({
              search_count: (existing.search_count || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('user_searches')
            .insert({
              user_id: effectiveUserId,
              search_date: today,
              search_count: nextCount,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      } catch (err: any) {
        console.warn('[searchQuotaService] Synchronisation Supabase `user_searches` :', err?.message || err);
      }
    }

    return {
      remaining: nextRemaining,
      max: MAX_FREE_DAILY_SEARCHES,
      lastResetDate: today
    };
  }
};
