import { Movie, AlertItem, UserProfile } from '../types';
import { supabase } from '../lib/supabase';

const ALERTS_STORAGE_KEY_PREFIX = 'cineia_movie_alerts_';

/**
 * Service de gestion des alertes de sorties cinématographiques (Pass Pro)
 */
export const movieAlertsService = {
  /**
   * Clé de stockage local pour le cache d'alertes
   */
  getStorageKey(userId?: string): string {
    return `${ALERTS_STORAGE_KEY_PREFIX}${userId || 'local'}`;
  },

  /**
   * Récupère les alertes depuis le cache local (immédiat)
   */
  getLocalAlerts(userId?: string): AlertItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.getStorageKey(userId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  /**
   * Sauvegarde les alertes dans le cache local
   */
  saveLocalAlerts(alerts: AlertItem[], userId?: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.getStorageKey(userId), JSON.stringify(alerts));
    } catch (e) {
      console.warn('[movieAlertsService] Erreur sauvegarde localStorage:', e);
    }
  },

  /**
   * Récupère l'ensemble des alertes actives de l'utilisateur (Supabase / API avec fallback local)
   */
  async getUserAlerts(user: UserProfile | null): Promise<AlertItem[]> {
    if (!user) {
      return this.getLocalAlerts();
    }

    const localAlerts = this.getLocalAlerts(user.id);

    // 1. Tenter l'appel API serveur (qui bypass RLS via Service Role si besoin)
    try {
      const res = await fetch(`/api/movie-alerts?userId=${encodeURIComponent(user.id)}&email=${encodeURIComponent(user.email || '')}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.alerts)) {
          const serverAlerts: AlertItem[] = data.alerts.map((row: any) => ({
            id: row.id || `alt_${row.movie_id}`,
            movieId: Number(row.movie_id),
            movieTitle: row.movie_title,
            releaseDate: row.release_date || '',
            posterPath: row.poster_path || null,
            backdropPath: row.backdrop_path || null,
            email: row.email || user.email,
            userId: row.user_id || user.id,
            mediaType: row.media_type || 'movie',
            overview: row.overview || '',
            createdAt: row.created_at || new Date().toISOString(),
            notified_j_minus_2: Boolean(row.notified_j_minus_2),
            notified_release_day: Boolean(row.notified_release_day),
            notified: Boolean(row.notified_release_day)
          }));

          this.saveLocalAlerts(serverAlerts, user.id);
          return serverAlerts;
        }
      }
    } catch (apiErr) {
      console.warn('[movieAlertsService.getUserAlerts] API notice, fallback direct:', apiErr);
    }

    // 2. Tenter la lecture directe Supabase client si configuré
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('user_movie_alerts')
          .select('*')
          .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          const mappedAlerts: AlertItem[] = data.map((row: any) => ({
            id: row.id,
            movieId: Number(row.movie_id),
            movieTitle: row.movie_title,
            releaseDate: row.release_date || '',
            posterPath: row.poster_path || null,
            backdropPath: row.backdrop_path || null,
            email: row.email || user.email,
            userId: row.user_id || user.id,
            mediaType: row.media_type || 'movie',
            overview: row.overview || '',
            createdAt: row.created_at,
            notified_j_minus_2: Boolean(row.notified_j_minus_2),
            notified_release_day: Boolean(row.notified_release_day),
            notified: Boolean(row.notified_release_day)
          }));

          this.saveLocalAlerts(mappedAlerts, user.id);
          return mappedAlerts;
        }
      }
    } catch (sbErr) {
      console.warn('[movieAlertsService.getUserAlerts] Supabase direct notice:', sbErr);
    }

    return localAlerts;
  },

  /**
   * Bascule (active ou désactive) une alerte pour un film ou une série.
   * Vérifie obligatoirement que l'utilisateur a un Pass Pro actif.
   */
  async toggleMovieAlert(
    movie: Movie, 
    user: UserProfile | null
  ): Promise<{ active: boolean; alert?: AlertItem; error?: string; requirePro?: boolean }> {
    // 🛡️ 1. Vérification du statut Pass Pro
    const isPro = Boolean(
      user && (
        user.isPro || 
        user.is_pro || 
        user.pass_status === 'pro' || 
        (user.email && ['ivanjoris959@gmail.com', 'techjoris@gmail.com', 'admin@elicine.app'].includes(user.email.toLowerCase()))
      )
    );

    if (!user || !isPro) {
      return {
        active: false,
        requirePro: true,
        error: "Le suivi et les notifications de sorties par e-mail sont une exclusivité strictement réservée aux membres Pass Pro."
      };
    }

    const currentAlerts = this.getLocalAlerts(user.id);
    const existingIndex = currentAlerts.findIndex(a => a.movieId === movie.id);

    // CAS A : Désactivation de l'alerte
    if (existingIndex >= 0) {
      const targetAlert = currentAlerts[existingIndex];
      const updatedList = currentAlerts.filter(a => a.movieId !== movie.id);
      this.saveLocalAlerts(updatedList, user.id);

      // Suppression en base Supabase & API
      try {
        await fetch('/api/movie-alerts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alertId: targetAlert.id,
            userId: user.id,
            movieId: movie.id,
            email: user.email
          })
        });

        if (supabase) {
          await supabase
            .from('user_movie_alerts')
            .delete()
            .match({ user_id: user.id, movie_id: movie.id });
        }
      } catch (err) {
        console.warn('[movieAlertsService] Erreur suppression alerte serveur:', err);
      }

      return { active: false };
    }

    // CAS B : Activation de l'alerte
    const newAlert: AlertItem = {
      id: 'alt_' + Date.now(),
      movieId: movie.id,
      movieTitle: movie.title,
      releaseDate: movie.release_date || '',
      posterPath: movie.poster_path || null,
      backdropPath: movie.backdrop_path || null,
      email: user.email,
      userId: user.id,
      mediaType: movie.media_type || 'movie',
      overview: movie.overview || '',
      createdAt: new Date().toISOString(),
      notified_j_minus_2: false,
      notified_release_day: false,
      notified: false
    };

    const updatedList = [newAlert, ...currentAlerts.filter(a => a.movieId !== movie.id)];
    this.saveLocalAlerts(updatedList, user.id);

    // Enregistrement sur le backend API / Supabase
    try {
      const res = await fetch('/api/movie-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          movieId: movie.id,
          movieTitle: movie.title,
          posterPath: movie.poster_path || null,
          backdropPath: movie.backdrop_path || null,
          releaseDate: movie.release_date || null,
          mediaType: movie.media_type || 'movie',
          overview: movie.overview || ''
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData?.requirePro) {
          // Si le serveur infirme le statut Pro, rollback
          this.saveLocalAlerts(currentAlerts, user.id);
          return { active: false, requirePro: true, error: errData.error };
        }
      }
    } catch (apiErr) {
      console.warn('[movieAlertsService] Erreur enregistrement alerte API:', apiErr);
    }

    return { active: true, alert: newAlert };
  },

  /**
   * Supprime une alerte spécifique par son ID
   */
  async removeAlert(alertId: string, user: UserProfile | null): Promise<boolean> {
    const userId = user?.id;
    const currentAlerts = this.getLocalAlerts(userId);
    const target = currentAlerts.find(a => a.id === alertId);
    const updated = currentAlerts.filter(a => a.id !== alertId);
    this.saveLocalAlerts(updated, userId);

    try {
      await fetch('/api/movie-alerts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId,
          userId,
          movieId: target?.movieId,
          email: user?.email
        })
      });

      if (supabase && target) {
        await supabase.from('user_movie_alerts').delete().eq('id', alertId);
      }
    } catch (e) {
      console.warn('[movieAlertsService] Erreur suppression alerte:', e);
    }

    return true;
  }
};
