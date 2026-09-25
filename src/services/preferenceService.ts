import { Movie } from '../types';

/**
 * Enregistre une préférence rattachée au compte : une œuvre gardée dans « Ma
 * liste » ou une alerte de sortie. Ces gestes sont les signaux les plus fiables
 * dont dispose Éliciné pour adapter les propositions suivantes.
 *
 * L'appel est silencieux, sans état de chargement ni message : enregistrer une
 * préférence ne doit jamais gêner l'action de l'utilisateur, et un échec n'a
 * aucune conséquence visible.
 */

const ENDPOINT = '/api/preferences';

export type PreferenceSignalKind = 'watchlist' | 'alert';

/** Jeton Supabase de la session, quand il est disponible. */
function sessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.access_token) return String(parsed.access_token);
        }
      }
    }
    return localStorage.getItem('supabase_access_token') || null;
  } catch {
    return null;
  }
}

const isSeries = (mediaType?: string) => mediaType === 'SÉRIE' || mediaType === 'tv' || mediaType === 'series';

/** Charge utile envoyée au serveur : des identifiants, aucune donnée personnelle. */
export function preferenceSignalPayload(kind: PreferenceSignalKind, movie: Movie) {
  const genreIds = Array.isArray(movie?.genres)
    ? movie.genres.map(genre => Number(genre?.id)).filter(id => Number.isSafeInteger(id) && id > 0)
    : [];
  return {
    signal: { kind },
    work: {
      genreIds,
      mediaType: isSeries(movie?.media_type) ? 'tv' : 'movie',
      originalLanguage: (movie as any)?.original_language || null,
      themes: Array.isArray((movie as any)?.themes) ? (movie as any).themes : [],
      moods: Array.isArray((movie as any)?.moods) ? (movie as any).moods : []
    }
  };
}

export function recordPreferenceSignal(kind: PreferenceSignalKind, movie: Movie): void {
  if (typeof window === 'undefined' || !movie) return;
  const token = sessionToken();
  // Sans compte identifié, il n'y a pas de préférences à enregistrer : rien
  // n'est deviné ni partagé entre appareils.
  if (!token) return;
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-supabase-token': token
      },
      body: JSON.stringify(preferenceSignalPayload(kind, movie)),
      keepalive: true
    }).catch(() => { /* personnalisation silencieuse */ });
  } catch {
    /* personnalisation silencieuse */
  }
}
