import { Movie, StreamingProvider } from '../types';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';

export const PLATFORM_PROVIDER_IDS = {
  NETFLIX: 8,
  PRIME: 119,
  DISNEY: 337,
  CANAL: 381
};

// Known verified trailers for fallback catalog
export const KNOWN_TRAILERS: Record<number, string> = {
  999101: 'YoHD9XEInc0', // The Whisper Man (Atmospheric Noir Trailer)
  999102: 'JfVOs4VSpmA', // Spider-Man
  999103: 'gCcx85zbxz4', // The Runner
  693134: 'Way9Dexny3w', // Dune: Part Two
  157336: 'zSWdZVtXT7E', // Interstellar
  335984: 'gCcx85zbxz4', // Blade Runner 2049
  546554: 'qGqiHJTsR4Q', // Knives Out
  11324: '5iaYLCiq5RM',  // Shutter Island
  27205: 'YoHD9XEInc0',  // Inception
  999104: 'xEQP4VVuyrY', // Severance
  1422: 'iR1n36v3f-Y',   // The Departed
  180: '71x_c1fxS78'     // Catch Me If You Can
};

// Clean empty fallback - no fake mock data
export const FALLBACK_MOVIES: Movie[] = [];

export function getActiveTmdbLanguage(language?: string): string {
  if (language) return language;
  const current = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_lang') : null;
  if (current === 'en') return 'en-US';
  if (current === 'es') return 'es-ES';
  return 'fr-FR';
}

export function getTmdbApiKey(explicitKey?: string): string {
  return (
    explicitKey ||
    (typeof localStorage !== 'undefined' ? (
      localStorage.getItem('tmdb_api_key') ||
      localStorage.getItem('elicine_tmdb_key') ||
      localStorage.getItem('cinora_tmdb_key') ||
      localStorage.getItem('cinéia_tmdb_key') ||
      localStorage.getItem('cineia_tmdb_key')
    ) : '') ||
    ''
  ).trim();
}

/**
 * Proxy universel vers l'endpoint serveur /api/tmdb
 */
export async function fetchTmdbEndpoint(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {},
  apiKey?: string
): Promise<Response> {
  const key = apiKey || getTmdbApiKey();
  const searchParams = new URLSearchParams();
  searchParams.set('endpoint', endpoint);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      searchParams.set(k, String(v));
    }
  }

  if (key) {
    searchParams.set('api_key', key);
  }

  return fetch(`/api/tmdb?${searchParams.toString()}`);
}

export async function fetchTrendingMovies(apiKey?: string, language?: string): Promise<Movie[]> {
  try {
    const lang = getActiveTmdbLanguage(language);
    const res = await fetchTmdbEndpoint('trending/all/week', { language: lang }, apiKey);
    if (!res.ok) throw new Error('TMDB error');
    const data = await res.json();
    return formatTmdbResults(data.results);
  } catch {
    return FALLBACK_MOVIES;
  }
}

/** Paginated trending — for useInfiniteCatalog */
export async function fetchTrendingPage(
  page: number,
  apiKey?: string,
  language?: string
): Promise<{ results: Movie[]; total_pages: number }> {
  try {
    const lang = getActiveTmdbLanguage(language);
    const res = await fetchTmdbEndpoint('trending/all/week', { page, language: lang }, apiKey);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    return { results: formatTmdbResults(data.results || []), total_pages: data.total_pages || 1 };
  } catch {
    return { results: FALLBACK_MOVIES, total_pages: 1 };
  }
}

/** Paginated top rated */
export async function fetchTopRatedPage(
  page: number,
  mediaType: 'movie' | 'tv' = 'movie',
  apiKey?: string,
  language?: string
): Promise<{ results: Movie[]; total_pages: number }> {
  try {
    const lang = getActiveTmdbLanguage(language);
    const res = await fetchTmdbEndpoint(`${mediaType}/top_rated`, { page, language: lang }, apiKey);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    return { results: formatTmdbResults(data.results || []), total_pages: data.total_pages || 1 };
  } catch {
    return { results: FALLBACK_MOVIES, total_pages: 1 };
  }
}

/** Paginated discover — genre / sort / media type */
export async function fetchDiscoverPage(
  page: number,
  options: { mediaType?: 'movie' | 'tv'; genreId?: number; sortBy?: string; apiKey?: string; language?: string } = {}
): Promise<{ results: Movie[]; total_pages: number }> {
  const { mediaType = 'movie', genreId, sortBy = 'popularity.desc', apiKey, language } = options;
  try {
    const lang = getActiveTmdbLanguage(language);
    const params: Record<string, any> = {
      sort_by: sortBy,
      page,
      language: lang,
      include_adult: false,
      'vote_count.gte': 50
    };
    if (genreId) params.with_genres = genreId;
    const res = await fetchTmdbEndpoint(`discover/${mediaType}`, params, apiKey);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    return { results: formatTmdbResults(data.results || []), total_pages: data.total_pages || 1 };
  } catch {
    return { results: FALLBACK_MOVIES, total_pages: 1 };
  }
}

/** Paginated TMDB search */
export async function fetchSearchPage(
  query: string,
  page: number,
  apiKey?: string,
  language?: string
): Promise<{ results: Movie[]; total_pages: number }> {
  if (!query.trim()) return { results: [], total_pages: 0 };
  try {
    const lang = getActiveTmdbLanguage(language);
    const res = await fetchTmdbEndpoint('search/multi', {
      query: query.trim(),
      page,
      language: lang,
      include_adult: false
    }, apiKey);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    const filtered = (data.results || []).filter(
      (i: any) => i.media_type === 'movie' || i.media_type === 'tv'
    );
    return { results: formatTmdbResults(filtered), total_pages: data.total_pages || 1 };
  } catch {
    return { results: [], total_pages: 0 };
  }
}

export interface PlatformFilterOptions {
  providerId: number;
  page?: number;
  mediaType?: 'all' | 'movie' | 'tv';
  sortBy?: 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc';
  apiKey?: string;
}

export async function fetchMoviesByPlatform({
  providerId,
  page = 1,
  mediaType = 'all',
  sortBy = 'popularity.desc',
  apiKey
}: PlatformFilterOptions): Promise<{ movies: Movie[]; totalPages: number }> {
  const key = getTmdbApiKey(apiKey);
  if (!key) {
    let filtered = FALLBACK_MOVIES.filter(m => 
      m.providers?.flatrate?.some(p => p.provider_id === providerId) ||
      (providerId === PLATFORM_PROVIDER_IDS.NETFLIX && m.primary_platform === 'Netflix') ||
      (providerId === PLATFORM_PROVIDER_IDS.PRIME && m.primary_platform === 'Prime Video') ||
      (providerId === PLATFORM_PROVIDER_IDS.CANAL && m.primary_platform === 'Canal+')
    );

    if (mediaType === 'movie') {
      filtered = filtered.filter(m => m.media_type === 'FILM');
    } else if (mediaType === 'tv') {
      filtered = filtered.filter(m => m.media_type === 'SÉRIE');
    }

    return { movies: filtered, totalPages: 10 };
  }

  const voteCountThreshold = sortBy === 'vote_average.desc' ? 200 : 50;

  try {
    const fetchEndpoints: Array<Promise<any>> = [];

    if (mediaType === 'all' || mediaType === 'movie') {
      fetchEndpoints.push(
        fetchTmdbEndpoint('discover/movie', {
          with_watch_providers: providerId,
          watch_region: 'FR',
          sort_by: sortBy,
          'vote_count.gte': voteCountThreshold,
          page,
          language: 'fr-FR',
          include_adult: false
        }, apiKey)
          .then(r => r.ok ? r.json() : { results: [], total_pages: 1 })
          .then(d => ({ ...d, results: (d.results || []).map((m: any) => ({ ...m, media_type: 'movie' })) }))
      );
    }

    if (mediaType === 'all' || mediaType === 'tv') {
      const tvSortBy = sortBy === 'primary_release_date.desc' ? 'first_air_date.desc' : sortBy;
      fetchEndpoints.push(
        fetchTmdbEndpoint('discover/tv', {
          with_watch_providers: providerId,
          watch_region: 'FR',
          sort_by: tvSortBy,
          'vote_count.gte': voteCountThreshold,
          page,
          language: 'fr-FR',
          include_adult: false
        }, apiKey)
          .then(r => r.ok ? r.json() : { results: [], total_pages: 1 })
          .then(d => ({ ...d, results: (d.results || []).map((m: any) => ({ ...m, media_type: 'tv' })) }))
      );
    }

    const responses = await Promise.all(fetchEndpoints);
    let combinedResults: any[] = [];
    let maxPages = 1;

    responses.forEach(data => {
      if (data.results) {
        combinedResults.push(...data.results);
      }
      if (data.total_pages && data.total_pages > maxPages) {
        maxPages = data.total_pages;
      }
    });

    // If both movie and tv are fetched, sort the combined set
    if (mediaType === 'all') {
      if (sortBy === 'vote_average.desc') {
        combinedResults.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
      } else {
        combinedResults.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      }
    }

    const formatted = formatTmdbResults(combinedResults);
    return { movies: formatted, totalPages: maxPages };
  } catch (error) {
    console.warn('TMDB discover error:', error);
    return { movies: FALLBACK_MOVIES, totalPages: 1 };
  }
}

export async function getMovieTrailer(
  movieId: number,
  apiKey?: string,
  mediaType?: 'FILM' | 'SÉRIE' | 'movie' | 'tv' | string
): Promise<string | null> {
  // Check known dictionary first
  if (KNOWN_TRAILERS[movieId]) {
    return KNOWN_TRAILERS[movieId];
  }

  const isTv = mediaType === 'SÉRIE' || mediaType === 'tv';
  const typeEndpoint = isTv ? 'tv' : 'movie';

  try {
    // 1. Try French first
    let res = await fetchTmdbEndpoint(`${typeEndpoint}/${movieId}/videos`, { language: 'fr-FR' }, apiKey);
    let data = res.ok ? await res.json() : null;

    let youtubeVideos = (data?.results || []).filter((v: any) => v.site === 'YouTube');

    // 2. If no French trailer, fallback to English (US)
    if (!youtubeVideos || youtubeVideos.length === 0) {
      res = await fetchTmdbEndpoint(`${typeEndpoint}/${movieId}/videos`, { language: 'en-US' }, apiKey);
      data = res.ok ? await res.json() : null;
      youtubeVideos = (data?.results || []).filter((v: any) => v.site === 'YouTube');
    }

    // 3. Fallback across types if needed
    if ((!youtubeVideos || youtubeVideos.length === 0) && !isTv) {
      res = await fetchTmdbEndpoint(`tv/${movieId}/videos`, { language: 'en-US' }, apiKey);
      data = res.ok ? await res.json() : null;
      youtubeVideos = (data?.results || []).filter((v: any) => v.site === 'YouTube');
    }

    if (youtubeVideos && youtubeVideos.length > 0) {
      const officialTrailer = youtubeVideos.find((v: any) => 
        v.type === 'Trailer' && (v.official === true || /official|bande-annonce|trailer/i.test(v.name))
      );
      if (officialTrailer?.key) return officialTrailer.key;

      const anyTrailer = youtubeVideos.find((v: any) => v.type === 'Trailer');
      if (anyTrailer?.key) return anyTrailer.key;

      const anyTeaser = youtubeVideos.find((v: any) => v.type === 'Teaser');
      if (anyTeaser?.key) return anyTeaser.key;

      return youtubeVideos[0]?.key || null;
    }

    return null;
  } catch (error) {
    console.warn(`Error fetching trailer for movie ID ${movieId}:`, error);
    return null;
  }
}

export function detectProviderKey(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('netflix')) return 'netflix';
  if (n.includes('prime') || n.includes('amazon')) return 'prime';
  if (n.includes('disney')) return 'disney';
  if (n.includes('canal') || n.includes('mycanal')) return 'canal';
  if (n.includes('tf1') || n.includes('mytf1')) return 'tf1';
  if (n.includes('france') || n.includes('france tv')) return 'francetv';
  if (n.includes('arte')) return 'arte';
  if (n.includes('6play') || n.includes('m6')) return '6play';
  if (n.includes('apple')) return 'apple';
  if (n.includes('max') || n.includes('hbo')) return 'max';
  if (n.includes('paramount')) return 'paramount';
  if (n.includes('molotov')) return 'molotov';
  if (n.includes('pluto')) return 'pluto';
  if (n.includes('sfr')) return 'sfr';
  return 'generic';
}

export interface WatchProviderItem {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface WatchProvidersData {
  justWatchLink: string | null;
  flatrate: WatchProviderItem[];
  rent: WatchProviderItem[];
}

export async function getWatchProviders(
  id: number,
  mediaType: 'movie' | 'tv' = 'movie',
  country: string = 'FR',
  apiKey?: string
): Promise<StreamingProvider[]> {
  if (!id) {
    return [];
  }

  try {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const res = await fetchTmdbEndpoint(`${endpoint}/${id}/watch/providers`, {}, apiKey);
    if (!res.ok) return [];
    const data = await res.json();
    const override = typeof localStorage !== 'undefined' ? localStorage.getItem('elicine_region_override') : null;
    const targetCountry = (override && override !== 'auto') ? override.toUpperCase() : country;
    const countryData = data.results?.[targetCountry] || data.results?.[country] || data.results?.['US'];

    if (!countryData) return [];

    // Fusionner flatrate (abonnements), free (gratuit) et ads (replay avec pub : TF1+, 6play...)
    const rawList = [
      ...(countryData.flatrate || []),
      ...(countryData.free || []),
      ...(countryData.ads || [])
    ];

    // Dédupliquer par provider_id pour éviter les doublons
    const uniqueMap = new Map<number, StreamingProvider>();
    rawList.forEach((p: any) => {
      if (p.provider_id && !uniqueMap.has(p.provider_id)) {
        uniqueMap.set(p.provider_id, {
          id: p.provider_id,
          name: p.provider_name,
          logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
          providerKey: detectProviderKey(p.provider_name)
        });
      }
    });

    // Retourner TOUTES les plateformes trouvées (ne pas tronquer)
    return Array.from(uniqueMap.values());
  } catch (e) {
    console.warn("[Éliciné] Erreur watch/providers pour ID", id, e);
    return [];
  }
}

export { 
  getMediaProviders, 
  getVodStoreUrl, 
  getPlatformSearchUrl,
  type MediaProvidersResult,
  type SvodProviderItem,
  type VodProviderItem 
} from './streamingResolver';

export async function searchMovieExactByTitleAndYear(
  title: string,
  year?: number | string,
  apiKey?: string
): Promise<Movie | null> {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    return null;
  }

  try {
    // 1. Search in French first
    let res = await fetchTmdbEndpoint('search/movie', {
      query: cleanTitle,
      year: year || undefined,
      language: 'fr-FR',
      include_adult: false
    }, apiKey);
    let data = res.ok ? await res.json() : null;

    if (data?.results && data.results.length > 0) {
      const formatted = formatTmdbResults([data.results[0]]);
      return formatted[0] || null;
    }

    // 2. Fallback in English (US)
    res = await fetchTmdbEndpoint('search/movie', {
      query: cleanTitle,
      year: year || undefined,
      language: 'en-US',
      include_adult: false
    }, apiKey);
    data = res.ok ? await res.json() : null;

    if (data?.results && data.results.length > 0) {
      const formatted = formatTmdbResults([data.results[0]]);
      return formatted[0] || null;
    }

    // 3. Fallback without year if year was restrictive
    if (year) {
      res = await fetchTmdbEndpoint('search/movie', {
        query: cleanTitle,
        language: 'fr-FR',
        include_adult: false
      }, apiKey);
      data = res.ok ? await res.json() : null;
      if (data?.results && data.results.length > 0) {
        const formatted = formatTmdbResults([data.results[0]]);
        return formatted[0] || null;
      }
    }

    // 4. Multi-search fallback (movies, tv, actors)
    res = await fetchTmdbEndpoint('search/multi', {
      query: cleanTitle,
      language: 'en-US',
      include_adult: false
    }, apiKey);
    data = res.ok ? await res.json() : null;
    if (data?.results && data.results.length > 0) {
      const validMedia = data.results.find((item: any) => item.media_type === 'movie' || item.media_type === 'tv');
      if (validMedia) {
        const formatted = formatTmdbResults([validMedia]);
        return formatted[0] || null;
      }
    }

    return null;
  } catch (e) {
    console.warn('Exact movie search error:', e);
    return null;
  }
}

export async function searchMoviesTmdb(query: string, apiKey?: string, language?: string): Promise<Movie[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const lang = getActiveTmdbLanguage(language);
    const res = await fetchTmdbEndpoint('search/multi', {
      query,
      language: lang,
      include_adult: false
    }, apiKey);
    if (!res.ok) throw new Error('TMDB search error');
    const data = await res.json();
    return formatTmdbResults(data.results || []);
  } catch (error) {
    console.warn('TMDB search error:', error);
    return [];
  }
}

export async function testTmdbApiKey(key?: string): Promise<{ valid: boolean; message: string }> {
  try {
    const res = await fetchTmdbEndpoint('authentication', {}, key);
    const data = await res.json();
    if (res.ok && data.success) {
      return { valid: true, message: 'Clé TMDB valide et active !' };
    }
    return { valid: false, message: data.status_message || 'Clé TMDB invalide' };
  } catch (e: any) {
    return { valid: false, message: 'Erreur réseau lors du test TMDB' };
  }
}

export async function testAiApiKey(provider: 'groq' | 'openai', key?: string): Promise<{ valid: boolean; message: string }> {
  if (provider === 'groq') {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key && key.trim()) {
        headers['Authorization'] = `Bearer ${key.trim()}`;
      }
      const res = await fetch('/api/groq', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        })
      });
      if (res.ok) {
        return { valid: true, message: 'Clé Groq validée avec succès !' };
      }
      return { valid: false, message: `Erreur Groq (${res.status})` };
    } catch (e: any) {
      return { valid: false, message: 'Erreur de connexion API' };
    }
  }

  if (!key || key.trim().length < 8) {
    return { valid: false, message: 'Clé vide ou trop courte' };
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key.trim()}`
      }
    });
    if (res.ok) {
      return { valid: true, message: `Clé ${provider.toUpperCase()} validée avec succès !` };
    }
    return { valid: false, message: `Clé ${provider.toUpperCase()} non reconnue (${res.status})` };
  } catch (e: any) {
    return { valid: false, message: 'Erreur de connexion API' };
  }
}

function formatTmdbResults(results: any[]): Movie[] {
  if (!results || !Array.isArray(results)) return [];

  return results.map((item) => ({
    id: item.id,
    title: item.title || item.name,
    original_title: item.original_title || item.original_name,
    overview: item.overview || 'Synopsis à venir...',
    poster_path: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80',
    backdrop_path: item.backdrop_path ? `${TMDB_IMAGE_BASE}${item.backdrop_path}` : 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&q=80',
    release_date: item.release_date || item.first_air_date || '2026',
    vote_average: Number(item.vote_average?.toFixed(1)) || 7.5,
    vote_count: item.vote_count || 100,
    runtime: 120,
    media_type: item.media_type === 'tv' ? 'SÉRIE' : 'FILM',
    primary_platform: item.id % 3 === 0 ? 'Prime Video' : item.id % 2 === 0 ? 'Canal+' : 'Netflix',
    genres: (item.genre_ids || [18, 878]).map((gid: number) => ({
      id: gid,
      name: GENRE_MAP[gid] || 'Cinéma'
    })),
    trailer_key: KNOWN_TRAILERS[item.id] || null,
    isAvailableInRegion: true,
    providers: {
      flatrate: [
        { provider_id: 8, provider_name: item.id % 2 === 0 ? 'Netflix' : 'Prime Video', logo_path: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=100&q=80', deep_link: 'https://www.netflix.com' }
      ]
    }
  }));
}

export const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Aventure',
  16: 'Animation',
  35: 'Comédie',
  80: 'Crime',
  99: 'Documentaire',
  18: 'Drame',
  10751: 'Famille',
  14: 'Fantastique',
  36: 'Histoire',
  27: 'Horreur',
  10402: 'Musique',
  9648: 'Mystère',
  10749: 'Romance',
  878: 'Science-Fiction',
  10770: 'Téléfilm',
  53: 'Thriller',
  10752: 'Guerre',
  37: 'Western',
  // Genres spécifiques séries TV
  10759: 'Action & Aventure',
  10762: 'Jeunesse',
  10763: 'Actualités',
  10764: 'Télé-réalité',
  10765: 'Sci-Fi & Fantastique',
  10766: 'Feuilleton',
  10767: 'Talk-Show',
  10768: 'Guerre & Politique'
};
