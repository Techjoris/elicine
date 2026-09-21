import { createCanonicalIntent } from '../types/canonicalIntent.runtime.js';
import { extractReliableSemanticExclusions } from './strictConstraintFilter.js';
import { extractFallbackIntentSignals, extractReferenceTitleQueries } from './fallbackIntentSignals.js';

export const SEARCH_EVALUATION_FLAG = 'SEARCH_EVALUATION_ENABLED';

export function isSearchEvaluationEnabled(env = process.env) {
  return env?.NODE_ENV !== 'production' || String(env?.[SEARCH_EVALUATION_FLAG] || '').toLowerCase() === 'true';
}

const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function candidateIdentity(candidate) {
  const tmdbId = Number(candidate?.tmdbId ?? candidate?.tmdb_id ?? candidate?.id);
  const mediaType = candidate?.mediaType || candidate?.media_type;
  return Number.isSafeInteger(tmdbId) && ['movie', 'tv'].includes(mediaType) ? `${mediaType}:${tmdbId}` : null;
}

export function summarizeEvaluationCandidates(candidates = [], limit = 50) {
  return candidates.slice(0, limit).map(candidate => ({
    tmdbId: Number(candidate.tmdbId ?? candidate.tmdb_id ?? candidate.id),
    mediaType: candidate.mediaType || candidate.media_type,
    title: candidate.title || candidate.name || '',
    sources: [...(candidate.sources || [])],
    ...(candidate.ranking ? { scores: { ...candidate.ranking } } : {})
  }));
}

export function createSearchEvaluationTrace({ enabled = isSearchEvaluationEnabled() } = {}) {
  return enabled ? {
    canonicalIntent: null,
    semanticExpansion: null,
    resolvedIntentContext: null,
    sources: {},
    poolBeforeDeduplication: [],
    poolAfterDeduplication: [],
    poolAfterStrictFilter: [],
    scoresPhase8: [],
    orderAfterDiversification: [],
    finalResults: []
  } : null;
}

export function recordEvaluationSource(trace, source, {
  candidates = [], durationMs = 0, error = null, expectedMediaType = null
} = {}) {
  if (!trace) return;
  const rows = summarizeEvaluationCandidates(candidates, 10);
  const identities = rows.map(candidateIdentity).filter(Boolean);
  const previous = trace.sources[source];
  const identitySet = previous?._identities || new Set();
  identities.forEach(identity => identitySet.add(identity));
  const previousCount = previous?.candidateCount || 0;
  const previousConforming = previous?._conformingCount || 0;
  const conformingCount = expectedMediaType == null
    ? candidates.length : rows.filter(row => row.mediaType === expectedMediaType).length;
  const candidateCount = previousCount + candidates.length;
  const metric = {
    candidateCount,
    uniqueCandidateCount: identitySet.size,
    topIds: [...new Set([...(previous?.topIds || []), ...rows.map(row => row.tmdbId)])].slice(0, 10),
    mediaTypeConformity: candidateCount ? (previousConforming + conformingCount) / candidateCount : 1,
    durationMs: (previous?.durationMs || 0) + durationMs,
    error: error || previous?.error || null,
    emptyResult: candidateCount === 0
  };
  Object.defineProperties(metric, {
    _identities: { value: identitySet, enumerable: false },
    _conformingCount: { value: previousConforming + conformingCount, enumerable: false }
  });
  trace.sources[source] = metric;
}

export function candidatePoolOverlapRate(left = [], right = []) {
  const a = new Set(left.map(candidateIdentity).filter(Boolean));
  const b = new Set(right.map(candidateIdentity).filter(Boolean));
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter(identity => b.has(identity)).length;
  return Number((intersection / new Set([...a, ...b]).size).toFixed(4));
}

export function compareCandidatePools(left = [], right = [], threshold = 0.6) {
  const overlapRate = candidatePoolOverlapRate(left, right);
  return { candidatePoolOverlapRate: overlapRate, genericPoolDetected: overlapRate > threshold };
}

export function evaluateSearchCorpus(runs = []) {
  let expectedCount = 0;
  let recall5Count = 0;
  let recall10Count = 0;
  let reciprocalRankTotal = 0;
  let reciprocalRankCases = 0;
  let violations = 0;
  let resultCount = 0;
  let emptyCount = 0;

  for (const run of runs) {
    const results = run.results || [];
    const expected = run.expected || {};
    const identities = results.map(candidateIdentity);
    if (!results.length) emptyCount += 1;
    for (const required of expected.mustInclude || []) {
      const identity = candidateIdentity(required);
      const rank = identities.indexOf(identity);
      expectedCount += 1;
      if (rank >= 0 && rank < 5) recall5Count += 1;
      if (rank >= 0 && rank < 10) recall10Count += 1;
      reciprocalRankCases += 1;
      if (rank >= 0) reciprocalRankTotal += 1 / (rank + 1);
    }
    const forbidden = new Set((expected.mustExclude || []).map(candidateIdentity).filter(Boolean));
    for (const result of results) {
      resultCount += 1;
      if (forbidden.has(candidateIdentity(result)) ||
          (expected.mediaType && result.mediaType !== expected.mediaType)) violations += 1;
    }
  }

  const overlaps = [];
  for (let left = 0; left < runs.length; left += 1) {
    for (let right = left + 1; right < runs.length; right += 1) {
      overlaps.push(candidatePoolOverlapRate(runs[left].results, runs[right].results));
    }
  }
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return {
    recallAt5: Number((expectedCount ? recall5Count / expectedCount : 0).toFixed(4)),
    recallAt10: Number((expectedCount ? recall10Count / expectedCount : 0).toFixed(4)),
    mrr: Number((reciprocalRankCases ? reciprocalRankTotal / reciprocalRankCases : 0).toFixed(4)),
    constraintViolationRate: Number((resultCount ? violations / resultCount : 0).toFixed(4)),
    irrelevantPoolOverlapRate: Number(average(overlaps).toFixed(4)),
    emptyResultRate: Number((runs.length ? emptyCount / runs.length : 0).toFixed(4))
  };
}

/** Deterministic, local normalization used only by the manual diagnostic CLI. */
export function inferDiagnosticIntent(query) {
  const normalized = normalize(query);
  const mediaType = /\b(serie|series|tv|episodes|saison)\b/.test(normalized) ? 'tv'
    : /\b(film|films|movie|cinema)\b/.test(normalized) ? 'movie' : null;
  const recovered = extractFallbackIntentSignals(query);
  const knownTitles = extractReferenceTitleQueries(query);
  return createCanonicalIntent({ mediaType, genres: recovered.genres, themes: recovered.themes,
    moods: recovered.moods, keywords: recovered.keywords,
    knownTitles, semanticExclusions: extractReliableSemanticExclusions(query) });
}
