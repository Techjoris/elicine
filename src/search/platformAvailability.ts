/**
 * Vérification réelle de la disponibilité d'une œuvre sur une plateforme.
 *
 * Le catalogue TMDB renvoyé par la recherche ne porte pas de disponibilité
 * fiable (les badges de plateforme sont indicatifs). Pour qu'« un film
 * d'horreur sur Netflix » ne renvoie que des titres réellement regardables sur
 * Netflix, on interroge l'endpoint `watch/providers` de TMDB — mis en cache —
 * puis, si la sélection est trop maigre, on complète avec un `discover`
 * restreint à la plateforme et au genre demandés.
 */

import { Movie } from '../types';
import { getCachedCountryCode, MOBILE_MONEY_COUNTRIES } from '../services/geoService';
import {
  fetchTmdbEndpoint,
  formatTmdbResults,
  getActiveTmdbLanguage,
  getTmdbApiKey,
  PLATFORM_PROVIDER_IDS
} from '../services/tmdb';
import { resolveGenreFilter } from '../utils/catalogGenres';
import { PlatformIntent } from './platformIntent';
import { detectGenreKeys } from './genreIntent';

export interface PlatformAvailabilityOptions {
  region?: string;
  language?: string;
  apiKey?: string;
}

/** Cache mémoire : la disponibilité d'une œuvre ne change pas pendant la session. */
const availabilityCache = new Map<string, boolean>();

/** Région de référence pour les disponibilités (Canal+ est distribué en France). */
export function resolveWatchRegion(platform: Pick<PlatformIntent, 'id'>, regionOverride?: string): string {
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_region_override') : null;
  const base = (override && override !== 'auto')
    ? override
    : (regionOverride || getCachedCountryCode() || 'FR');
  const clean = String(base || 'FR').toUpperCase().slice(0, 2);
  if (platform.id === 'canal') return 'FR';
  return MOBILE_MONEY_COUNTRIES.includes(clean) ? 'FR' : clean;
}

const mediaEndpoint = (movie: Movie): 'movie' | 'tv' =>
  movie.media_type === 'SÉRIE' || movie.media_type === 'tv' ? 'tv' : 'movie';

interface WatchProviderOffer {
  provider_id?: number;
}

interface WatchProviderRegion {
  flatrate?: WatchProviderOffer[];
  free?: WatchProviderOffer[];
  ads?: WatchProviderOffer[];
}

/**
 * Disponibilité de l'œuvre sur la plateforme dans la région :
 *  - `true`  : vérifiée et incluse dans l'abonnement ;
 *  - `false` : vérifiée et absente ;
 *  - `null`  : vérification impossible (réseau / proxy TMDB indisponible).
 * Le résultat définitif est mis en cache ; l'échec ne l'est pas, pour permettre
 * une nouvelle tentative à la requête suivante.
 */
export async function isMovieAvailableOnPlatform(
  movie: Movie,
  platform: Pick<PlatformIntent, 'id' | 'providerId'>,
  options: PlatformAvailabilityOptions = {}
): Promise<boolean | null> {
  if (!movie?.id) return false;
  const endpoint = mediaEndpoint(movie);
  const region = resolveWatchRegion(platform, options.region);
  const cacheKey = `${endpoint}_${movie.id}_${region}_${platform.providerId}`;

  if (availabilityCache.has(cacheKey)) return availabilityCache.get(cacheKey)!;

  try {
    const response = await fetchTmdbEndpoint(`${endpoint}/${movie.id}/watch/providers`, {}, options.apiKey);
    if (!response.ok) return null;
    const data = await response.json();
    const regions: Record<string, WatchProviderRegion> = data?.results || {};
    const regionData = regions[region] || regions['FR'] || regions['US'];
    const offers = [
      ...(regionData?.flatrate || []),
      ...(regionData?.free || []),
      ...(regionData?.ads || [])
    ];
    const available = offers.some(
      (offer) => Number(offer?.provider_id) === Number(platform.providerId)
    );
    availabilityCache.set(cacheKey, available);
    return available;
  } catch (_) {
    return null;
  }
}

export interface PlatformFilterResult {
  /** Œuvres vérifiées comme disponibles sur la plateforme. */
  movies: Movie[];
  /** Nombre de vérifications réellement abouties (disponibles ou non). */
  verifiedCount: number;
  /** Nombre d'œuvres dont la disponibilité n'a pas pu être vérifiée. */
  uncheckedCount: number;
}

/** Filtre une liste d'œuvres en ne gardant que celles disponibles sur la plateforme. */
export async function filterMoviesAvailableOnPlatform(
  movies: Movie[],
  platform: Pick<PlatformIntent, 'id' | 'providerId'>,
  options: PlatformAvailabilityOptions = {}
): Promise<PlatformFilterResult> {
  if (!Array.isArray(movies) || movies.length === 0) {
    return { movies: [], verifiedCount: 0, uncheckedCount: 0 };
  }

  const kept: Array<Movie | null> = new Array(movies.length).fill(null);
  let cursor = 0;
  const concurrency = Math.min(6, movies.length);
  let verifiedCount = 0;
  let uncheckedCount = 0;

  const worker = async () => {
    while (cursor < movies.length) {
      const index = cursor++;
      const movie = movies[index];
      const availability = await isMovieAvailableOnPlatform(movie, platform, options);
      if (availability === null) uncheckedCount += 1;
      else {
        verifiedCount += 1;
        if (availability) kept[index] = movie;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return {
    movies: kept.filter((movie): movie is Movie => movie !== null),
    verifiedCount,
    uncheckedCount
  };
}

/** Borne une promesse dans le temps : renvoie `null` si elle dépasse le délai. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

interface TopUpOptions {
  platform: Pick<PlatformIntent, 'id' | 'providerId'>;
  query: string;
  mediaType?: 'Tous' | 'Films' | 'Séries TV';
  region?: string;
  language?: string;
  apiKey?: string;
  excludeIds?: Set<number>;
  limit?: number;
  sortBy?: 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc';
}

/**
 * Complète la sélection avec les œuvres du genre demandé réellement disponibles
 * sur la plateforme (via `discover` TMDB + filtre de fournisseur).
 */
export async function fetchPlatformGenreTopUp(options: TopUpOptions): Promise<Movie[]> {
  const { platform } = options;
  const genreKeys = detectGenreKeys(options.query);
  if (genreKeys.length === 0) return [];

  const region = resolveWatchRegion(platform, options.region);
  const language = getActiveTmdbLanguage(options.language);
  const apiKey = options.apiKey || getTmdbApiKey();
  const limit = options.limit ?? 8;

  const targets: Array<'movie' | 'tv'> = options.mediaType === 'Séries TV'
    ? ['tv']
    : (options.mediaType === 'Films' ? ['movie'] : ['movie', 'tv']);

  const collected: Movie[] = [];

  for (const target of targets) {
    if (collected.length >= limit) break;

    const genreFilter = resolveGenreFilter(genreKeys, target);
    if (genreFilter.ids.length === 0) continue;

    const params: Record<string, string | number> = {
      with_watch_providers: platform.providerId,
      watch_region: region,
      with_watch_monetization_types: 'flatrate',
      with_genres: genreFilter.ids.join('|'),
      sort_by: options.sortBy || 'popularity.desc',
      language,
      include_adult: 'false'
    };
    if (options.sortBy === 'vote_average.desc') {
      params['vote_count.gte'] = 50;
    }

    for (const page of [1, 2]) {
      if (collected.length >= limit) break;
      try {
        const response = await withTimeout(
          fetchTmdbEndpoint(
            target === 'tv' ? 'discover/tv' : 'discover/movie',
            { ...params, page },
            apiKey
          ),
          6000
        );
        if (!response || !response.ok) break;
        const data = await response.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        if (results.length === 0) break;
        collected.push(...formatTmdbResults(results, target));
      } catch (_) {
        break;
      }
    }
  }

  const excludeIds = options.excludeIds || new Set<number>();
  const seen = new Set<number>();
  return collected.filter((movie) => {
    if (!movie?.id || seen.has(movie.id) || excludeIds.has(movie.id)) return false;
    seen.add(movie.id);
    return true;
  }).slice(0, limit);
}

/** Fusionne deux sélections en préservant l'ordre et l'unicité par identifiant. */
export function mergeUniqueMovies(primary: Movie[], extra: Movie[]): Movie[] {
  const seen = new Set<number>();
  const merged: Movie[] = [];
  for (const movie of [...(primary || []), ...(extra || [])]) {
    if (!movie?.id || seen.has(movie.id)) continue;
    seen.add(movie.id);
    merged.push(movie);
  }
  return merged;
}

/** Identifiants connus, exposés pour les tests et la journalisation. */
export const PLATFORM_IDS = PLATFORM_PROVIDER_IDS;
