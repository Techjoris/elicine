import { Movie, AlertItem, UserProfile } from '../types';
import { supabase } from '../lib/supabase';

export const alertMediaType = (type?: string) => type === 'tv' || type === 'SÉRIE' ? 'tv' : 'movie';
const key = (id?: string) => `elicine_verified_alerts_${id || 'anonymous'}`;
const mapAlert = (row: any): AlertItem => ({
  id: row.id, movieId: Number(row.movie_id), movieTitle: row.movie_title,
  releaseDate: row.release_date || '', posterPath: row.poster_path, backdropPath: row.backdrop_path,
  email: row.email, userId: row.user_id, mediaType: row.media_type, overview: row.overview,
  createdAt: row.created_at, notified_j_minus_2: row.notified_j_minus_2,
  notified_release_day: row.notified_release_day
});
async function request(method = 'GET', body?: object) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (!session?.access_token) throw new Error('Reconnectez-vous pour gérer vos alertes.');
  const response = await fetch('/api/movie-alerts', {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json().catch(() => ({} as any));
  if (!response.ok || !result.success) {
    const error = new Error(result.error || 'Impossible de modifier cette alerte.');
    Object.assign(error, { requirePro: Boolean(result.requirePro) });
    throw error;
  }
  return result;
}

export const movieAlertsService = {
  getLocalAlerts(userId?: string): AlertItem[] {
    if (!userId) return [];
    try { const list = JSON.parse(localStorage.getItem(key(userId)) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; }
  },
  saveLocalAlerts(alerts: AlertItem[], userId?: string) {
    if (userId) { try { localStorage.setItem(key(userId), JSON.stringify(alerts)); } catch { /* cache is optional */ } }
  },
  async getUserAlerts(user: UserProfile | null): Promise<AlertItem[]> {
    if (!user) return [];
    const result = await request();
    const alerts = (result.alerts || []).map(mapAlert);
    this.saveLocalAlerts(alerts, user.id);
    return alerts;
  },
  async toggleMovieAlert(movie: Movie, user: UserProfile | null): Promise<{ active: boolean; alert?: AlertItem; error?: string; requirePro?: boolean }> {
    if (!user) return { active: false, requirePro: true };
    try {
      const current = await this.getUserAlerts(user);
      const existing = current.find(a => a.movieId === movie.id && alertMediaType(a.mediaType) === alertMediaType(movie.media_type));
      if (existing) {
        await this.removeAlert(existing.id, user);
        return { active: false };
      }
      const result = await request('POST', { movieId: movie.id, mediaType: alertMediaType(movie.media_type) });
      const alert = mapAlert(result.alert);
      this.saveLocalAlerts([alert, ...current.filter(a => a.id !== alert.id)], user.id);
      return { active: true, alert };
    } catch (error: any) { return { active: false, error: error.message || 'Erreur réseau. Réessayez.', requirePro: error.requirePro }; }
  },
  async removeAlert(alertId: string, user: UserProfile | null): Promise<boolean> {
    await request('DELETE', { alertId });
    this.saveLocalAlerts(this.getLocalAlerts(user?.id).filter(a => a.id !== alertId), user?.id);
    return true;
  }
};
