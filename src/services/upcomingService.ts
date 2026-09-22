import { Movie } from '../types';
import { fetchTmdbEndpoint } from './tmdb';

export function releaseToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function releaseCountdown(date: string, now = new Date()): number {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(releaseToday(now) + 'T00:00:00Z')) / 86400000);
}

export type UpcomingMovie = Movie & { popularity: number };

// Independent discovery feed: this does not participate in recommendation ranking.
export async function fetchUpcoming(apiKey?: string, language = 'fr-FR'): Promise<UpcomingMovie[]> {
  const today = releaseToday();
  const start = new Date(today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 6);
  const results = await Promise.all((['movie', 'tv'] as const).flatMap(type => [1, 2, 3].map(async page => {
    const dateKey = type === 'movie' ? 'primary_release_date' : 'first_air_date';
    const response = await fetchTmdbEndpoint(`discover/${type}`, {
      language, page, sort_by: 'popularity.desc', include_adult: false,
      ...(type === 'movie' ? { include_video: false } : { include_null_first_air_dates: false }),
      [`${dateKey}.gte`]: start.toISOString().slice(0, 10),
      [`${dateKey}.lte`]: end.toISOString().slice(0, 10)
    }, apiKey);
    if (!response.ok) throw new Error('Les prochaines sorties sont momentanément indisponibles.');
    const data = await response.json();
    return (data.results || []).map((item: any): UpcomingMovie => ({
      id: item.id, title: item.title || item.name, overview: item.overview || '',
      poster_path: item.poster_path, backdrop_path: item.backdrop_path,
      release_date: item.release_date || item.first_air_date, media_type: type,
      vote_average: item.vote_average || 0, popularity: item.popularity || 0, genres: []
    }));
  })));
  const unique = new Map<string, UpcomingMovie>();
  for (const item of results.flat()) {
    if (item.release_date > today && item.release_date <= end.toISOString().slice(0, 10) && item.title && item.poster_path) unique.set(`${item.media_type}:${item.id}`, item);
  }
  return [...unique.values()].sort((a, b) => a.release_date.localeCompare(b.release_date) || b.popularity - a.popularity);
}
