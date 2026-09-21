import { mergeCandidates, toRetrievalCandidate } from './retrievalCandidate.js';
import { discoverParams, hasDiscoverConstraints, keywordTerms, normalizeTerm, reliableKeywordId, tmdbGenreIds } from './tmdbRetrievalParams.js';
import { expandSemanticTerms, SEMANTIC_EXPANSION_LIMIT } from './semanticExpansion.js';

export const HYBRID_RETRIEVAL_FLAG = 'HYBRID_RETRIEVAL_ENABLED';
export const RETRIEVAL_LIMITS = Object.freeze({ pool: 50, seeds: 3, searchTitles: 2,
  terms: SEMANTIC_EXPANSION_LIMIT, keywordIds: 3, sourceResults: 20, sourceTimeoutMs: 4000 });
export function isHybridRetrievalEnabled(env = process.env) {
  // Hybrid is the validated default; explicit false is the operational rollback.
  return String(env?.[HYBRID_RETRIEVAL_FLAG] ?? 'true').toLowerCase() !== 'false';
}
export function createRetrievalTelemetry() {
  return { hybridRetrievalAttempted: false, hybridRetrievalSucceeded: false, hybridRetrievalDurationMs: 0,
    retrievalCandidateCountBeforeDedup: 0, retrievalCandidateCountAfterDedup: 0, retrievalCandidateCountFinal: 0,
    retrievalTmdbSearchCount: 0, retrievalTmdbDiscoverCount: 0, retrievalTmdbSimilarCount: 0,
    retrievalTmdbRecommendationsCount: 0, retrievalLegacyCount: 0, retrievalSupabaseLexicalCount: 0,
    retrievalSupabaseVectorCount: 0, retrievalSourceErrorCount: 0, retrievalSourceErrors: [],
    vectorRetrievalAttempted: false, vectorRetrievalSucceeded: false,
    vectorRetrievalCandidateCount: 0, vectorRetrievalDurationMs: 0,
    vectorRetrievalError: null, embeddingDurationMs: 0,
    strictFilterAttempted: false, strictFilterInputCount: 0, strictFilterOutputCount: 0,
    strictFilterRejectedCount: 0, strictFilterUnknownCount: 0,
    rejectedMediaType: 0, rejectedYear: 0, rejectedGenre: 0, rejectedTitle: 0,
    rejectedSemanticExclusion: 0,
    rankingAttempted: false, rankingCandidateCount: 0, rankingDurationMs: 0,
    rankingTopScore: 0, rankingAverageScore: 0,
    diversificationAttempted: false, diversificationCandidateCount: 0,
    diversificationReorderedCount: 0, diversificationDurationMs: 0,
    semanticExpansionApplied: false, semanticExpansionTermCount: 0,
    semanticKeywordResolvedCount: 0 };
}

export async function withSourceTimeout(work, timeoutMs = RETRIEVAL_LIMITS.sourceTimeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error('RETRIEVAL_TIMEOUT'));
      }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

const counter = { tmdb_search: 'retrievalTmdbSearchCount', tmdb_discover: 'retrievalTmdbDiscoverCount',
  tmdb_similar: 'retrievalTmdbSimilarCount', tmdb_recommendations: 'retrievalTmdbRecommendationsCount',
  legacy: 'retrievalLegacyCount', supabase_lexical: 'retrievalSupabaseLexicalCount',
  supabase_vector: 'retrievalSupabaseVectorCount' };

/** Pure retrieval orchestration: no React, raw LLM, ranking, quota or global state. */
export async function hybridRetrieve({ intent, resolvedContext = {}, services = {}, context = {} }) {
  const telemetry = context.telemetry || {};
  const metrics = { ...createRetrievalTelemetry(), hybridRetrievalAttempted: true };
  const semanticExpansion = expandSemanticTerms(intent, RETRIEVAL_LIMITS.terms);
  metrics.semanticExpansionApplied = semanticExpansion.applied;
  metrics.semanticExpansionTermCount = semanticExpansion.addedTerms.length;
  const started = Date.now();
  const timeout = context.sourceTimeoutMs ?? RETRIEVAL_LIMITS.sourceTimeoutMs;
  const errors = [];
  const tasks = [];
  const source = (name, work, hint = null, signals = {}) => tasks.push((async () => {
    try {
      const rows = await withSourceTimeout(work, timeout);
      const candidates = (Array.isArray(rows) ? rows : []).slice(0, RETRIEVAL_LIMITS.sourceResults)
        .map((row, index) => toRetrievalCandidate(row, name, { mediaType: hint, sourceRank: index + 1,
          ...(Number.isFinite(Number(row?.similarity)) ? { sourceScore: Number(row.similarity) } : {}), ...signals }))
        .filter(c => c && (!intent.mediaType || c.mediaType === intent.mediaType));
      for (const candidate of candidates) candidate.retrievalSignals[0].matchedGenreCount =
        candidate.genreIds.filter(id => tmdbGenreIds(intent.genres, candidate.mediaType).includes(id)).length;
      metrics[counter[name]] += candidates.length;
      return candidates;
    } catch (error) {
      errors.push({ source: name, code: error?.message === 'RETRIEVAL_TIMEOUT' ? 'TIMEOUT' : 'SOURCE_FAILED' });
      return [];
    }
  })());

  const allResolved = resolvedContext.resolvedTitles || [];
  const seenSeeds = new Set();
  const seeds = allResolved.filter(seed => {
    const key = `${seed.mediaType}:${seed.tmdbId}`;
    if (!['movie', 'tv'].includes(seed.mediaType) || !Number.isSafeInteger(seed.tmdbId) || seed.tmdbId <= 0 ||
        (intent.mediaType && seed.mediaType !== intent.mediaType) || seenSeeds.has(key)) return false;
    seenSeeds.add(key); return true;
  }).slice(0, RETRIEVAL_LIMITS.seeds);
  for (const seed of seeds) {
    for (const method of ['similar', 'recommendations']) if (services[method])
      source(`tmdb_${method}`, signal => services[method](seed, { signal, context }), seed.mediaType, { seedTmdbId: seed.tmdbId });
  }
  // Only explicit unresolved titles, never a free-text query or single theme word.
  const resolvedNames = new Set(allResolved.flatMap(s => [s.inputTitle, s.canonicalTitle, s.originalTitle]).map(normalizeTerm));
  const searchTitles = [...new Set((intent.knownTitles || []).map(t => t.trim()))]
    .filter(title => title.length > 1 && !resolvedNames.has(normalizeTerm(title))).slice(0, RETRIEVAL_LIMITS.searchTitles);
  if (services.search) for (const title of searchTitles)
    source('tmdb_search', signal => services.search(title, intent.mediaType, { signal, context }), intent.mediaType);
  if (services.legacy) source('legacy', signal => services.legacy({ signal, context }));
  if (services.lexical) source('supabase_lexical', signal => services.lexical(intent, { signal, context }));
  if (services.vector) source('supabase_vector', signal => services.vector(intent, { signal, context }));

  // Keywords are a dependency only of Discover; seeds/lexical/legacy already run.
  const keywordsTask = (async () => {
    if (!services.keyword) return [];
    const results = await Promise.allSettled(keywordTerms(intent, RETRIEVAL_LIMITS.terms).map(async term => {
      try {
        return reliableKeywordId(term, await withSourceTimeout(signal => services.keyword(term, { signal, context }), timeout));
      } catch (error) {
        errors.push({ source: 'tmdb_keyword', code: error?.message === 'RETRIEVAL_TIMEOUT' ? 'TIMEOUT' : 'SOURCE_FAILED' });
        return null;
      }
    }));
    return [...new Set(results.filter(r => r.status === 'fulfilled').map(r => r.value).filter(Boolean))].slice(0, 3);
  })();
  const keywordIds = await keywordsTask;
  metrics.semanticKeywordResolvedCount = keywordIds.length;
  if (services.discover) for (const type of intent.mediaType ? [intent.mediaType] : ['movie', 'tv']) {
    if (hasDiscoverConstraints(intent, type, keywordIds))
      source('tmdb_discover', signal => services.discover(type, discoverParams(intent, type, keywordIds), { signal, context }), type, { keywordIds });
  }
  const settled = await Promise.allSettled(tasks);
  const candidates = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const merged = mergeCandidates(candidates);
  for (const field of ['vectorRetrievalAttempted', 'vectorRetrievalSucceeded',
    'vectorRetrievalCandidateCount', 'vectorRetrievalDurationMs', 'vectorRetrievalError', 'embeddingDurationMs']) {
    if (telemetry[field] !== undefined) metrics[field] = telemetry[field];
  }
  Object.assign(metrics, {
    hybridRetrievalSucceeded: merged.candidates.length > 0,
    hybridRetrievalDurationMs: Date.now() - started,
    retrievalCandidateCountBeforeDedup: candidates.length,
    retrievalCandidateCountAfterDedup: merged.afterDedup,
    retrievalCandidateCountFinal: merged.candidates.length,
    retrievalSourceErrorCount: errors.length,
    retrievalSourceErrors: errors.sort((a, b) => a.source.localeCompare(b.source))
  });
  Object.assign(telemetry, metrics);
  return merged.candidates;
}
