import { Movie } from '../types';
import { fetchTmdbEndpoint } from './tmdb';
import { anticipationScore, rankByAnticipation, relativeBuzzByReleaseWindow } from '../../api/_anticipation.js';

export function releaseToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function releaseCountdown(date: string, now = new Date()): number {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(releaseToday(now) + 'T00:00:00Z')) / 86400000);
}

export type UpcomingMovie = Movie & {
  popularity: number;
  voteCount: number;
  /** « Degré d'attente » score, 0 to 1. */
  anticipation: number;
  /** Best position held in a TMDB trending feed, 1 being the most looked-at title. */
  trendingRank: number | null;
  daysUntilRelease: number;
  /** Popularity standing among titles at the same distance from release, 0 to 1. */
  buzzPercentile: number;
  /** Franchise weight or platform stature, 0 to 1. */
  scale: number;
};

type MediaType = 'movie' | 'tv';
type TrendingWindow = 'day' | 'week';

const DISCOVER_PAGES = [1, 2, 3, 4, 5];
const WINDOW_MONTHS = 6;

function toUpcoming(item: any, mediaType: MediaType): UpcomingMovie | null {
  const releaseDate = item?.release_date || item?.first_air_date;
  const title = item?.title || item?.name;
  if (!item?.id || !title || !releaseDate || !item.poster_path) return null;
  return {
    id: item.id, title, overview: item.overview || '',
    poster_path: item.poster_path, backdrop_path: item.backdrop_path ?? null,
    release_date: releaseDate, media_type: mediaType,
    vote_average: item.vote_average || 0, popularity: item.popularity || 0,
    voteCount: item.vote_count || 0, genres: [],
    anticipation: 0, trendingRank: null, daysUntilRelease: 0, buzzPercentile: 0.5, scale: 0
  };
}

async function tmdbPage(endpoint: string, params: Record<string, string | number | boolean>, apiKey?: string) {
  const response = await fetchTmdbEndpoint(endpoint, params, apiKey);
  if (!response.ok) throw new Error('Les prochaines sorties sont momentanément indisponibles.');
  return response.json();
}

function fromServer(payload: any): UpcomingMovie[] {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((item: any): UpcomingMovie => ({
    id: Number(item.id), title: item.title, overview: item.overview || '',
    poster_path: item.poster_path, backdrop_path: item.backdrop_path ?? null,
    release_date: item.release_date, media_type: item.media_type === 'tv' ? 'tv' : 'movie',
    vote_average: Number(item.vote_average) || 0, genres: [],
    popularity: Number(item.popularity) || 0, voteCount: Number(item.voteCount) || 0,
    anticipation: Number(item.anticipation) || 0, buzzPercentile: Number(item.buzzPercentile) || 0,
    scale: Number(item.scale) || 0, trendingRank: item.trendingRank ?? null,
    daysUntilRelease: Number(item.daysUntilRelease) || 0
  })).filter((item: UpcomingMovie) => item.id > 0 && item.title && item.poster_path && item.release_date);
}

// Independent discovery feed: this does not participate in recommendation ranking.
// Titles are ranked by how much they are awaited, never by how soon they come out.
export async function fetchUpcoming(apiKey?: string, language = 'fr-FR', now = new Date()): Promise<UpcomingMovie[]> {
  try {
    const response = await fetch(`/api/releases?language=${encodeURIComponent(language)}`, { headers: { Accept: 'application/json' } });
    if (response.ok) {
      const feed = fromServer(await response.json());
      if (feed.length) return feed;
    }
  } catch {
    // The ranking endpoint is unavailable (local dev, transient outage): fall back below.
  }
  return fetchUpcomingFromTmdb(apiKey, language, now);
}

/**
 * Fallback used when /api/releases cannot answer. It ranks with the same formula but without
 * the per-title saga/platform signal, which only the server can afford to fetch.
 */
export async function fetchUpcomingFromTmdb(apiKey?: string, language = 'fr-FR', now = new Date()): Promise<UpcomingMovie[]> {
  const today = releaseToday(now);
  const start = new Date(today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + WINDOW_MONTHS);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const discoverStacks = await Promise.all((['movie', 'tv'] as MediaType[]).flatMap(type => DISCOVER_PAGES.map(async page => {
    const dateKey = type === 'movie' ? 'primary_release_date' : 'first_air_date';
    const data = await tmdbPage(`discover/${type}`, {
      language, page, sort_by: 'popularity.desc', include_adult: false,
      ...(type === 'movie' ? { include_video: false } : { include_null_first_air_dates: false }),
      [`${dateKey}.gte`]: startDate,
      [`${dateKey}.lte`]: endDate
    }, apiKey);
    return (data.results || []).map((item: any) => toUpcoming(item, type)).filter(Boolean) as UpcomingMovie[];
  })));

  // Trending feeds are the closest thing to an explicit "I want to see this" signal.
  const trendingStacks = await Promise.all((['movie', 'tv'] as MediaType[]).flatMap(type => (['day', 'week'] as TrendingWindow[]).map(async window => {
    try {
      const data = await tmdbPage(`trending/${type}/${window}`, { language }, apiKey);
      return { type, window, results: (data.results || []) as any[] };
    } catch {
      return null;
    }
  })));

  const candidates = new Map<string, UpcomingMovie>();
  const ranks = new Map<string, { day?: number; week?: number }>();
  for (const item of discoverStacks.flat()) {
    if (item.release_date <= today || item.release_date > endDate) continue;
    candidates.set(`${item.media_type}:${item.id}`, item);
  }
  for (const stack of trendingStacks) {
    if (!stack) continue;
    stack.results.forEach((raw, index) => {
      const item = toUpcoming(raw, stack.type);
      if (!item || item.release_date <= today || item.release_date > endDate) return;
      const key = `${stack.type}:${item.id}`;
      const held = ranks.get(key) || {};
      held[stack.window] = index + 1;
      ranks.set(key, held);
      if (!candidates.has(key)) candidates.set(key, item);
    });
  }

  const pool = [...candidates.values()].map(item => ({
    ...item,
    daysUntilRelease: releaseCountdown(item.release_date, now)
  }));
  const standings = relativeBuzzByReleaseWindow(pool);

  const ranked = pool.map((item, index) => {
    const held = ranks.get(`${item.media_type}:${item.id}`) || {};
    return {
      ...item,
      buzzPercentile: standings[index],
      trendingRank: held.week ?? held.day ?? null,
      anticipation: anticipationScore({
        popularity: item.popularity, voteCount: item.voteCount,
        weekRank: held.week, dayRank: held.day, daysUntilRelease: item.daysUntilRelease,
        buzzPercentile: standings[index]
      })
    };
  });

  return rankByAnticipation(ranked);
}
