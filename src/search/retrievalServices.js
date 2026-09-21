import { candidateMediaType } from './retrievalCandidate.js';
import { normalizeTerm } from './tmdbRetrievalParams.js';
import { expandSemanticTerms, SEMANTIC_EXPANSION_LIMIT } from './semanticExpansion.js';

export const TMDB_REQUEST_LIMIT = 30;
export const TMDB_TIMEOUT_MS = 3500;

/** Shared Phase 4/5 request-scoped Promise cache, including failed requests. */
export function createTmdbRetrievalClient({ apiKey, cache = new Map(), telemetry = {}, fetchImpl = globalThis.fetch, timeoutMs = TMDB_TIMEOUT_MS } = {}) {
  const entities = new Map();
  let calls = 0;
  async function get(path, params = {}, { signal } = {}) {
    if (!apiKey) throw new Error('TMDB_UNAVAILABLE');
    const url = new URL(`https://api.themoviedb.org/3/${path}`);
    for (const [key, value] of Object.entries({ language: 'fr-FR', page: 1, ...params })) {
      if (value != null) url.searchParams.set(key, String(value));
    }
    if (!apiKey.startsWith('eyJ')) url.searchParams.set('api_key', apiKey);
    url.searchParams.sort();
    const key = `url:${url}`;
    if (cache.has(key)) {
      telemetry.retrievalTmdbCacheHits = (telemetry.retrievalTmdbCacheHits || 0) + 1;
      return cache.get(key);
    }
    if (signal?.aborted) throw new Error('RETRIEVAL_TIMEOUT');
    if (calls >= TMDB_REQUEST_LIMIT) throw new Error('TMDB_BUDGET_EXHAUSTED');
    calls += 1;
    telemetry.tmdbCalls = (telemetry.tmdbCalls || 0) + 1;
    const controller = new AbortController();
    let timer;
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const pending = (async () => {
      try {
        return await Promise.race([
          (async () => {
            const response = await fetchImpl(String(url), {
              method: 'GET', signal: controller.signal,
              headers: apiKey.startsWith('eyJ') ? { Authorization: `Bearer ${apiKey}` } : {}
            });
            if (!response.ok) throw new Error('TMDB_HTTP_ERROR');
            const data = await response.json();
            if (!Array.isArray(data?.results)) throw new Error('TMDB_INVALID_RESPONSE');
            const typedEndpoint = path.match(/^(?:search|discover)\/(movie|tv)$|^(movie|tv)\/\d+\//);
            const type = typedEndpoint?.[1] || typedEndpoint?.[2] || null;
            const rows = data.results.map(row => {
              const actualType = candidateMediaType(row, type);
              if (!actualType || path === 'search/keyword') return row;
              const typed = { ...row, media_type: actualType };
              entities.set(`${actualType}:${row.id}`, typed);
              return typed;
            });
            return rows;
          })(),
          new Promise((_, reject) => { timer = setTimeout(() => {
            controller.abort(); reject(new Error('RETRIEVAL_TIMEOUT'));
          }, timeoutMs); })
        ]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    })();
    cache.set(key, pending);
    return pending;
  }
  return {
    get,
    entity: (type, id) => entities.get(`${type}:${id}`),
    search: (title, type, options) => get(`search/${type || 'multi'}`, { query: title.trim(), include_adult: false }, options),
    discover: (type, params, options) => get(`discover/${type}`, params, options),
    keyword: (term, options) => get('search/keyword', { query: term }, options),
    similar: (seed, options) => get(`${seed.mediaType}/${seed.tmdbId}/similar`, {}, options),
    recommendations: (seed, options) => get(`${seed.mediaType}/${seed.tmdbId}/recommendations`, {}, options)
  };
}

/** The historical one-title/one-hit candidate source; no provider interpretation. */
export async function retrieveLegacyHints(hints, resolvedContext, client, { signal } = {}) {
  const settled = await Promise.allSettled(hints.slice(0, 10).map(async hint => {
    if (!hint?.title) return null;
    const normalized = normalizeTerm(hint.title);
    const resolved = (resolvedContext.resolvedTitles || []).find(seed =>
      [seed.inputTitle, seed.canonicalTitle, seed.originalTitle].some(t => normalizeTerm(t) === normalized) &&
      (!hint.type || hint.type === seed.mediaType));
    if (resolved) return client.entity(resolved.mediaType, resolved.tmdbId) || null;
    const hits = await client.search(hint.title, ['movie', 'tv'].includes(hint.type) ? hint.type : null, { signal });
    // Historical exact-title + votes selection; copy to avoid mutating cached arrays.
    const ordered = hits.filter(row => row.poster_path && candidateMediaType(row)).sort((a, b) => {
      const exact = row => [row.title, row.name, row.original_title, row.original_name].some(t => normalizeTerm(t) === normalized);
      return Number(exact(b)) - Number(exact(a)) || Number(b.vote_count || 0) - Number(a.vote_count || 0);
    });
    const year = Number(hint.release_year);
    return (year && ordered.find(row => Number((row.release_date || row.first_air_date || '').slice(0, 4)) === year)) || ordered[0] || null;
  }));
  if (settled.length && settled.every(r => r.status === 'rejected')) throw new Error('LEGACY_SOURCE_FAILED');
  return settled.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
}

/** Reuses existing ILIKE catalog retrieval, not the misleadingly named vector path.
 * Only columns shared by the checked-in schemas; genres is INT[] in one schema.
 */
export function createSupabaseLexicalSource(client) {
  if (!client) return null;
  return async (intent, { signal } = {}) => {
    const expansion = expandSemanticTerms(intent);
    const termLimit = expansion.applied ? SEMANTIC_EXPANSION_LIMIT : 5;
    const terms = [...new Set([...(intent.knownTitles || []), ...expansion.addedTerms,
      ...expansion.sourceTerms].map(value => String(value).replace(/[^\p{L}\p{N}\s-]/gu, '').trim())
      .filter(t => t.length >= 3))].slice(0, termLimit);
    if (!terms.length) return [];
    const filter = terms.flatMap(t => [`original_title.ilike.%${t}%`, `overview.ilike.%${t}%`]).join(',');
    let lastError = null;
    for (const table of ['movies', 'movies_embeddings']) {
      if (signal?.aborted) throw new Error('RETRIEVAL_TIMEOUT');
      const { data, error } = await client.from(table).select('*').or(filter)
        .order('vote_average', { ascending: false }).limit(16).abortSignal(signal);
      if (error) { lastError = error; continue; }
      // These tables are film catalogs. Never invent a TV identity from a film row.
      const rows = (data || []).filter(row => Number.isSafeInteger(Number(row.tmdb_id)) && Number(row.tmdb_id) > 0)
        .map(row => ({ ...row, media_type: row.media_type || 'movie' }));
      if (rows.length) return rows;
    }
    if (lastError) throw new Error('LEXICAL_SOURCE_FAILED');
    return [];
  };
}
