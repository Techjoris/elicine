import { mergeCandidates, toRetrievalCandidate } from './retrievalCandidate.js';
import { discoverParams, exclusionKeywordTerms, hasDiscoverConstraints, keywordTerms, normalizeTerm,
  reliableKeywordId, tmdbGenreIds } from './tmdbRetrievalParams.js';
import { SEMANTIC_EXPANSION_LIMIT } from './semanticExpansion.js';
import { createFallbackTelemetry, failedSourceLabel, FALLBACK_REASONS, recordFallback } from './fallbackPolicy.js';
import { recordEvaluationSource, summarizeEvaluationCandidates } from './searchEvaluation.js';
import { normalizeSemanticExclusions } from './strictConstraintFilter.js';
import { buildNarrativeRetrievalPlan, narrativeEvidence, narrativeKeywordAngles, narrativeKeywordId, prioritizeNarrativeRows } from './narrativeRetrieval.js';

export const HYBRID_RETRIEVAL_FLAG = 'HYBRID_RETRIEVAL_ENABLED';
export const RETRIEVAL_LIMITS = Object.freeze({ pool: 50, seeds: 3, searchTitles: 2,
  terms: SEMANTIC_EXPANSION_LIMIT, keywordIds: 3, exclusionTerms: 4, sourceResults: 20, sourceTimeoutMs: 4000 });
export function isHybridRetrievalEnabled(env = process.env) {
  // Hybrid is the validated default; explicit false is the operational rollback.
  return String(env?.[HYBRID_RETRIEVAL_FLAG] ?? 'true').toLowerCase() !== 'false';
}
export function createRetrievalTelemetry() {
  return { hybridRetrievalAttempted: false, hybridRetrievalSucceeded: false, hybridRetrievalDurationMs: 0,
    retrievalCandidateCountBeforeDedup: 0, retrievalCandidateCountAfterDedup: 0, retrievalCandidateCountFinal: 0,
    retrievalTmdbSearchCount: 0, retrievalTmdbDiscoverCount: 0, retrievalTmdbSimilarCount: 0,
    retrievalTmdbRecommendationsCount: 0, retrievalTmdbPersonCreditsCount: 0,
    retrievalLegacyCount: 0, retrievalSupabaseLexicalCount: 0,
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
    semanticKeywordResolvedCount: 0, semanticExclusionKeywordResolvedCount: 0,
    ...createFallbackTelemetry() };
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
  tmdb_person_credits: 'retrievalTmdbPersonCreditsCount',
  legacy: 'retrievalLegacyCount', supabase_lexical: 'retrievalSupabaseLexicalCount',
  supabase_vector: 'retrievalSupabaseVectorCount' };

/** Pure retrieval orchestration: no React, raw LLM, ranking, quota or global state. */
export async function hybridRetrieve({ intent, resolvedContext = {}, services = {}, context = {} }) {
  const telemetry = context.telemetry || {};
  const evaluationTrace = context.evaluationTrace || null;
  const narrativePlan = buildNarrativeRetrievalPlan(intent, context.semanticIntentContext);
  context = { ...context, narrativePlan };
  if (evaluationTrace) {
    evaluationTrace.semanticIntentContext = structuredClone(context.semanticIntentContext || {});
    evaluationTrace.retrievalPlan = structuredClone(narrativePlan);
  }
  const metrics = { ...createRetrievalTelemetry(), hybridRetrievalAttempted: true };
  const semanticExpansion = narrativePlan.expansion;
  if (evaluationTrace) evaluationTrace.semanticExpansion = {
    sourceTerms: [...semanticExpansion.sourceTerms],
    addedTerms: [...semanticExpansion.addedTerms],
    applied: semanticExpansion.applied
  };
  metrics.semanticExpansionApplied = semanticExpansion.applied;
  metrics.semanticExpansionTermCount = semanticExpansion.addedTerms.length;
  const started = Date.now();
  const timeout = context.sourceTimeoutMs ?? RETRIEVAL_LIMITS.sourceTimeoutMs;
  const errors = [];
  const tasks = [];
  const source = (name, work, hint = null, signals = {}, request = {}) => tasks.push((async () => {
    const sourceStarted = Date.now();
    try {
      const rows = await withSourceTimeout(work, timeout);
      const converted = prioritizeNarrativeRows(Array.isArray(rows) ? rows : [], narrativePlan)
        .slice(0, RETRIEVAL_LIMITS.sourceResults)
        .map((row, index) => toRetrievalCandidate(row, name, { mediaType: hint, sourceRank: index + 1,
          ...(Number.isFinite(Number(row?.similarity)) ? { sourceScore: Number(row.similarity) } : {}), ...signals }))
        .filter(Boolean);
      const candidates = converted.filter(c => !intent.mediaType || c.mediaType === intent.mediaType);
      for (const candidate of candidates) {
        candidate.retrievalSignals[0].matchedGenreCount =
          candidate.genreIds.filter(id => tmdbGenreIds(intent.genres, candidate.mediaType).includes(id)).length;
        if (narrativePlan.rich) {
          const evidence = narrativeEvidence(candidate, narrativePlan);
          candidate.retrievalSignals[0].narrativeMatched = Math.max(evidence.matched, signals.keywordConjunctionSize || 0);
          candidate.retrievalSignals[0].narrativeCoverage = evidence.coverage;
        }
      }
      metrics[counter[name]] += candidates.length;
      recordEvaluationSource(evaluationTrace, name, { candidates: converted,
        request, durationMs: Date.now() - sourceStarted, expectedMediaType: intent.mediaType });
      return candidates;
    } catch (error) {
      const code = error?.message === 'RETRIEVAL_TIMEOUT' ? 'TIMEOUT' : 'SOURCE_FAILED';
      errors.push({ source: name, code });
      recordEvaluationSource(evaluationTrace, name, { durationMs: Date.now() - sourceStarted,
        request, error: code, expectedMediaType: intent.mediaType });
      return [];
    }
  })());

  const allResolved = resolvedContext.resolvedTitles || [];
  // Works the query names itself, as opposed to works it only compares to. They
  // must reach the pool the ranking sorts: a seed is never listed by its own
  // similar/recommendation endpoints, so nothing else would bring it back.
  const requestedWorks = Array.isArray(resolvedContext.requestedTitles) ? resolvedContext.requestedTitles : [];
  const seenSeeds = new Set();
  const seeds = allResolved.filter(seed => {
    const key = `${seed.mediaType}:${seed.tmdbId}`;
    if (!['movie', 'tv'].includes(seed.mediaType) || !Number.isSafeInteger(seed.tmdbId) || seed.tmdbId <= 0 ||
        (intent.mediaType && seed.mediaType !== intent.mediaType) || seenSeeds.has(key)) return false;
    seenSeeds.add(key); return true;
  }).slice(0, RETRIEVAL_LIMITS.seeds);
  for (const seed of seeds) {
    for (const method of ['similar', 'recommendations']) if (services[method])
      source(`tmdb_${method}`, signal => services[method](seed, { signal, context }), seed.mediaType,
        { seedTmdbId: seed.tmdbId }, { mediaType: seed.mediaType, seedTmdbId: seed.tmdbId });
  }
  // Explicit people are resolved separately from title references. Their
  // credits are a reliable TMDB source for queries such as "film de Leonardo
  // DiCaprio ..." where free-text movie search cannot identify the person.
  const resolvedPeople = Array.isArray(resolvedContext.resolvedPeople)
    ? resolvedContext.resolvedPeople.slice(0, 2) : [];
  if (services.personCredits) {
    const personTypes = intent.mediaType ? [intent.mediaType] : ['movie', 'tv'];
    for (const person of resolvedPeople) {
      if (!Number.isSafeInteger(Number(person?.tmdbId)) || Number(person.tmdbId) <= 0) continue;
      for (const type of personTypes) {
        source('tmdb_person_credits', signal => services.personCredits(Number(person.tmdbId), type, { signal, context }), type, {
          personTmdbId: Number(person.tmdbId), personQuery: person.inputName || person.name || null
        }, { mediaType: type, personTmdbId: Number(person.tmdbId) });
      }
    }
  }
  // Only explicit unresolved titles, never a free-text query or single theme
  // word, plus the works the query names itself: those are answered by their own
  // entry, not only by their neighbourhood.
  const resolvedNames = new Set(allResolved.flatMap(s => [s.inputTitle, s.canonicalTitle, s.originalTitle]).map(normalizeTerm));
  const requestedQueries = requestedWorks
    .map(work => String(work?.canonicalTitle || work?.originalTitle || '').trim()).filter(Boolean);
  const requestedQueryNames = new Set(requestedQueries.map(normalizeTerm));
  const searchTitles = [...new Set([...requestedQueries, ...(intent.knownTitles || []).map(t => t.trim())])]
    .filter(title => title.length > 1 && (requestedQueryNames.has(normalizeTerm(title)) ||
      !resolvedNames.has(normalizeTerm(title)))).slice(0, RETRIEVAL_LIMITS.searchTitles);
  if (services.search) for (const title of searchTitles)
    source('tmdb_search', signal => services.search(title, intent.mediaType, { signal, context }), intent.mediaType,
      {}, { query: title, mediaType: intent.mediaType });
  if (services.legacy && !narrativePlan.rich) source('legacy', signal => services.legacy({ signal, context }));
  if (services.lexical) source('supabase_lexical', signal => services.lexical(intent, { signal, context }));
  if (services.vector) source('supabase_vector', signal => services.vector(intent, { signal, context }));

  // Keywords are a dependency only of Discover; seeds/lexical/legacy already run.
  // Positive concepts restrict the pool (with_keywords), stated exclusions prune
  // it (without_keywords): both read TMDB's own taxonomy, never a work list.
  const keywordsTask = (async () => {
    // Let already scheduled source transports debit the shared request budget.
    await Promise.resolve();
    const resolveIds = async (terms, limit, narrative = false) => {
      if (!services.keyword || terms.length === 0) return [];
      const results = await Promise.allSettled(terms.map(async term => {
        try {
          const rows = await withSourceTimeout(signal => services.keyword(term, { signal, context }), timeout);
          const id = narrative ? narrativeKeywordId(term, rows) : reliableKeywordId(term, rows);
          if (evaluationTrace) (evaluationTrace.keywordResolution ||= []).push({ term, id });
          return id;
        } catch (error) {
          errors.push({ source: 'tmdb_keyword', code: error?.message === 'RETRIEVAL_TIMEOUT' ? 'TIMEOUT' : 'SOURCE_FAILED' });
          return null;
        }
      }));
      return [...new Set(results.filter(r => r.status === 'fulfilled').map(r => r.value).filter(Boolean))].slice(0, limit);
    };
    const exclusionTerms = exclusionKeywordTerms(normalizeSemanticExclusions(intent.semanticExclusions), RETRIEVAL_LIMITS.exclusionTerms);
    const terms = narrativePlan.rich ? narrativePlan.keywordQueries : keywordTerms(intent, RETRIEVAL_LIMITS.terms);
    const available = services.remainingBudget?.() ?? 30;
    const reservedDiscover = narrativePlan.rich ? (intent.mediaType ? 3 : 6) : (intent.mediaType ? 1 : 2);
    const [included, excluded] = await Promise.all([
      resolveIds(terms.slice(0, Math.max(0, available - reservedDiscover - exclusionTerms.length)), RETRIEVAL_LIMITS.keywordIds, narrativePlan.rich),
      resolveIds(exclusionTerms, RETRIEVAL_LIMITS.exclusionTerms)
    ]);
    return { included, excluded };
  })();
  const { included: keywordIds, excluded: excludedKeywordIds } = await keywordsTask;
  if (evaluationTrace) evaluationTrace.semanticExpansion.resolvedKeywordIds = [...keywordIds];
  metrics.semanticKeywordResolvedCount = keywordIds.length;
  metrics.semanticExclusionKeywordResolvedCount = excludedKeywordIds.length;
  if (services.discover) for (const type of intent.mediaType ? [intent.mediaType] : ['movie', 'tv']) {
    if (hasDiscoverConstraints(intent, type, keywordIds)) {
      const angles = narrativePlan.rich ? narrativeKeywordAngles(keywordIds) : [{ ids: keywordIds, conjunction: false }];
      for (const { ids, conjunction } of angles) {
        const params = discoverParams(intent, type, ids, excludedKeywordIds);
        if (conjunction) params.with_keywords = ids.join(',');
        source('tmdb_discover', signal => services.discover(type, params, { signal, context }), type,
          { keywordIds: ids, ...(conjunction ? { keywordConjunctionSize: ids.length } : {}) },
          { mediaType: type, params });
      }
    }
  }
  // Optional title hints may consume ten calls; narrative Discover has first use
  // of the same 30-call request budget, including earlier entity resolution.
  if (services.legacy && narrativePlan.rich) source('legacy', signal => services.legacy({ signal, context }));
  const settled = await Promise.allSettled(tasks);
  const candidates = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const merged = mergeCandidates(candidates, RETRIEVAL_LIMITS.pool, { narrative: narrativePlan.rich });
  // A targeted source can still be crowded out of the bounded pool by broad
  // sources. The named work is re-attached from the facts the resolver already
  // confirmed, only on a live pool so a total provider failure still reaches the
  // historical fallback instead of returning an empty card.
  const pool = [...merged.candidates];
  if (pool.length > 0) for (const work of requestedWorks) {
    const tmdbId = Number(work?.tmdbId);
    if (!['movie', 'tv'].includes(work?.mediaType) || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) continue;
    if (pool.some(candidate => candidate.mediaType === work.mediaType &&
        Number(candidate.tmdbId) === tmdbId)) continue;
    const title = String(work.canonicalTitle || work.originalTitle || work.inputTitle || '').trim();
    const injected = toRetrievalCandidate({ id: tmdbId, media_type: work.mediaType, title,
      original_title: work.originalTitle, genre_ids: work.genreIds,
      original_language: work.originalLanguage,
      release_date: work.mediaType === 'movie' && Number.isInteger(work.releaseYear)
        ? `${work.releaseYear}-01-01` : undefined,
      first_air_date: work.mediaType === 'tv' && Number.isInteger(work.releaseYear)
        ? `${work.releaseYear}-01-01` : undefined }, 'requested_work');
    if (injected) pool.unshift(injected);
  }
  if (evaluationTrace) {
    evaluationTrace.poolBeforeDeduplication = summarizeEvaluationCandidates(candidates, 400);
    evaluationTrace.poolAfterDeduplication = summarizeEvaluationCandidates(merged.candidates);
    evaluationTrace.candidatePool = summarizeEvaluationCandidates(pool);
  }
  for (const field of ['vectorRetrievalAttempted', 'vectorRetrievalSucceeded',
    'vectorRetrievalCandidateCount', 'vectorRetrievalDurationMs', 'vectorRetrievalError', 'embeddingDurationMs']) {
    if (telemetry[field] !== undefined) metrics[field] = telemetry[field];
  }
  Object.assign(metrics, {
    hybridRetrievalSucceeded: pool.length > 0,
    hybridRetrievalDurationMs: Date.now() - started,
    retrievalCandidateCountBeforeDedup: candidates.length,
    retrievalCandidateCountAfterDedup: merged.afterDedup,
    retrievalCandidateCountFinal: pool.length,
    retrievalSourceErrorCount: errors.length,
    retrievalSourceErrors: errors.sort((a, b) => a.source.localeCompare(b.source))
  });
  if (errors.length > 0) {
    recordFallback(metrics, {
      used: merged.candidates.length > 0,
      reason: errors.some(error => error.code === 'TIMEOUT') ? FALLBACK_REASONS.TIMEOUT : FALLBACK_REASONS.PROVIDER_ERROR,
      source: failedSourceLabel(errors)
    });
  } else if (merged.candidates.length === 0) {
    recordFallback(metrics, { reason: FALLBACK_REASONS.NO_CANDIDATES, source: 'hybrid_retrieval' });
  }
  Object.assign(telemetry, metrics);
  return pool;
}
