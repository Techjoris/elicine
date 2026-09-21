import { candidateMediaType } from './retrievalCandidate.js';
import { normalizeTerm } from './tmdbRetrievalParams.js';
import { expandSemanticTerms, SEMANTIC_EXPANSION_LIMIT } from './semanticExpansion.js';
import { buildNarrativeRetrievalPlan, narrativeLexicalFilter, prioritizeNarrativeRows } from './narrativeRetrieval.js';

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
            const rawRows = Array.isArray(data?.results) ? data.results
              : Array.isArray(data?.cast) ? data.cast : null;
            if (!rawRows) throw new Error('TMDB_INVALID_RESPONSE');
            const typedEndpoint = path.match(/^(?:search|discover)\/(movie|tv)$|^(movie|tv)\/\d+\//);
            const personCreditsEndpoint = path.match(/^person\/\d+\/(movie|tv)_credits$/);
            const type = typedEndpoint?.[1] || typedEndpoint?.[2] || personCreditsEndpoint?.[1] || null;
            const rows = rawRows.map(row => {
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
    remainingBudget: () => Math.max(0, TMDB_REQUEST_LIMIT - calls),
    entity: (type, id) => entities.get(`${type}:${id}`),
    search: (title, type, options) => get(`search/${type || 'multi'}`, { query: title.trim(), include_adult: false }, options),
    person: (name, options) => get('search/person', { query: String(name || '').trim(), include_adult: false }, options),
    personCredits: async (id, type = 'movie', options) => {
      const mediaType = type === 'tv' ? 'tv' : 'movie';
      const rows = await get(`person/${Number(id)}/${mediaType}_credits`, {}, options);
      return [...rows].sort((left, right) => Number(right.popularity || 0) - Number(left.popularity || 0) ||
        Number(right.vote_count || 0) - Number(left.vote_count || 0));
    },
    discover: (type, params, options) => get(`discover/${type}`, params, options),
    keyword: (term, options) => get('search/keyword', { query: term }, options),
    similar: (seed, options) => get(`${seed.mediaType}/${seed.tmdbId}/similar`, {}, options),
    recommendations: (seed, options) => get(`${seed.mediaType}/${seed.tmdbId}/recommendations`, {}, options)
  };
}

/**
 * Historical exact-title-then-votes selection of one TMDB search hit, shared by
 * every title-keyed source so they all agree on what "this title" means. A hit
 * without a poster is unusable for the grid and is discarded here.
 */
export function pickBestTitleHit(hits, title, releaseYear = null) {
  const wanted = normalizeTerm(title);
  const ordered = (Array.isArray(hits) ? hits : []).filter(row => row?.poster_path && candidateMediaType(row))
    .sort((a, b) => {
      const exact = row => [row.title, row.name, row.original_title, row.original_name]
        .some(value => normalizeTerm(value) === wanted);
      return Number(exact(b)) - Number(exact(a)) || Number(b.vote_count || 0) - Number(a.vote_count || 0);
    });
  const year = Number(releaseYear);
  return (year && ordered.find(row => Number((row.release_date || row.first_air_date || '').slice(0, 4)) === year))
    || ordered[0] || null;
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
    return pickBestTitleHit(hits, hint.title, hint.release_year);
  }));
  if (settled.length && settled.every(r => r.status === 'rejected')) throw new Error('LEGACY_SOURCE_FAILED');
  return settled.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
}

/**
 * Re-resolves model-proposed titles against TMDB: one catalogue search per
 * title, never a model call per title, and a title TMDB cannot confirm is
 * dropped. The channel can therefore only add works that really exist. It fails
 * soft on purpose: a total resolution failure returns no candidate instead of
 * raising a retrieval error, so the deterministic pool is never blamed for a
 * proposal the catalogue simply could not confirm.
 */
export async function resolveNarrativeCandidates(candidates, client, { signal, limit = 6 } = {}) {
  const wanted = (Array.isArray(candidates) ? candidates : [])
    .filter(item => item?.title).slice(0, Math.max(0, Number(limit) || 0));
  if (!wanted.length) return [];
  const settled = await Promise.allSettled(wanted.map(async (item, index) => {
    const hits = await client.search(item.title, ['movie', 'tv'].includes(item.type) ? item.type : null, { signal });
    const hit = pickBestTitleHit(hits, item.title, item.releaseYear);
    if (!hit) return null;
    return { ...hit, llm_rank: index + 1, llm_reason: String(item.reason || '') };
  }));
  return settled.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
}

/** Reuses existing ILIKE catalog retrieval, not the misleadingly named vector path.
 * Only columns shared by the checked-in schemas; genres is INT[] in one schema.
 */
export function createSupabaseLexicalSource(client) {
  if (!client) return null;
  return async (intent, { signal, context = {} } = {}) => {
    const plan = context.narrativePlan || buildNarrativeRetrievalPlan(intent, context.semanticIntentContext);
    const expansion = expandSemanticTerms(intent);
    const termLimit = expansion.applied ? SEMANTIC_EXPANSION_LIMIT : 5;
    const terms = [...new Set([...(intent.knownTitles || []), ...expansion.addedTerms,
      ...expansion.sourceTerms].map(value => String(value).replace(/[^\p{L}\p{N}\s-]/gu, '').trim())
      .filter(t => t.length >= 3))].slice(0, termLimit);
    if (!terms.length && !plan.rich) return [];
    const filter = plan.rich ? narrativeLexicalFilter(plan)
      : terms.flatMap(t => [`original_title.ilike.%${t}%`, `overview.ilike.%${t}%`]).join(',');
    let lastError = null;
    let succeeded = false;
    const collected = [];
    // Canonical catalog has real movie AND TV identities. Legacy film tables
    // remain a fallback, never a way to relabel a film as a series.
    const tables = intent.mediaType === 'tv' ? ['media_embeddings'] : ['media_embeddings', 'movies', 'movies_embeddings'];
    for (const table of tables) {
      if (signal?.aborted) throw new Error('RETRIEVAL_TIMEOUT');
      const actualFilter = table === 'media_embeddings' && plan.rich
        ? narrativeLexicalFilter(plan, ['original_title', 'overview', 'profile_text']) : filter;
      let request = client.from(table).select(table === 'media_embeddings'
        ? 'tmdb_id,media_type,title,original_title,overview,profile_text,poster_path,backdrop_path,release_date,first_air_date,original_language,genre_ids'
        : '*').or(actualFilter);
      if (table === 'media_embeddings' && intent.mediaType) request = request.eq('media_type', intent.mediaType);
      if (!plan.rich && table !== 'media_embeddings') request = request.order('vote_average', { ascending: false });
      const { data, error } = await request.limit(plan.rich ? 50 : 16).abortSignal(signal);
      if (context.evaluationTrace) (context.evaluationTrace.lexicalRequests ||= []).push({
        table, filter: actualFilter, mediaType: intent.mediaType, limit: plan.rich ? 50 : 16,
        candidateCount: data?.length || 0, error: error ? 'LEXICAL_TABLE_FAILED' : null });
      if (error) { lastError = error; continue; }
      succeeded = true;
      // These tables are film catalogs. Never invent a TV identity from a film row.
      const rows = (data || []).filter(row => Number.isSafeInteger(Number(row.tmdb_id)) && Number(row.tmdb_id) > 0)
        .map(row => ({ ...row, media_type: row.media_type || (table === 'media_embeddings' ? null : 'movie') }))
        .filter(row => candidateMediaType(row) && (!intent.mediaType || candidateMediaType(row) === intent.mediaType));
      collected.push(...rows);
      if (rows.length && !plan.rich) return rows;
    }
    if (!succeeded && lastError) throw new Error('LEXICAL_SOURCE_FAILED');
    const unique = [...new Map(collected.map(row => [`${row.media_type}:${row.tmdb_id}`, row])).values()];
    return prioritizeNarrativeRows(unique, plan).slice(0, 20);
  };
}
