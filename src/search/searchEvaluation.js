import { createCanonicalIntent } from '../types/canonicalIntent.runtime.js';
import { conceptCoverage } from './semanticLexicon.js';
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

const asList = value => Array.isArray(value) ? value : value == null ? [] : [value];
const label = value => typeof value === 'object' ? value?.name ?? value?.title ?? '' : value;

/**
 * The text a candidate really offers to a concept comparison: its own title and
 * metadata, never a retrieval source and never a score. The offline metrics and
 * the ranking therefore measure the same thing on the same words.
 */
export function candidateSemanticText(candidate = {}) {
  const internal = candidate.constraintData || {};
  const metadata = candidate.metadata || {};
  return [candidate.title, candidate.name, candidate.originalTitle, candidate.original_title,
    candidate.original_name, metadata.overview, candidate.overview, internal.overview,
    ...asList(candidate.genres), ...asList(candidate.keywords), ...asList(candidate.themes),
    ...asList(candidate.moods), ...asList(internal.genres), ...asList(internal.keywords),
    ...asList(internal.themes), ...asList(internal.moods)].map(label).filter(Boolean).join(' ');
}

const ratio = (value, total) => Number((total ? value / total : 0).toFixed(4));

/**
 * Ranking-quality metrics, additive to `evaluateSearchCorpus`, whose historical
 * shape is preserved for its existing callers. They answer a different set of
 * questions: how high the expected work actually lands, how much of the
 * displayed grid is off topic, and how much of the described intent the results
 * really cover. Everything is reported per media type as well as overall, so a
 * film-side improvement can never hide a series-side regression.
 */
export function evaluateSearchQuality(runs = [], { coverageThreshold = 0.5 } = {}) {
  const buckets = new Map();
  const bucket = type => {
    if (!buckets.has(type)) buckets.set(type, { caseCount: 0, top1: 0, top3: 0, reciprocalRank: 0,
      reciprocalCases: 0, violations: 0, results: 0, coverageTotal: 0, coverageSamples: 0, offTopic: 0 });
    return buckets.get(type);
  };
  for (const run of runs) {
    const results = Array.isArray(run.results) ? run.results : [];
    const expected = run.expected || {};
    const mediaType = expected.mediaType || run.mediaType || results[0]?.mediaType || null;
    const concepts = asList(expected.concepts).map(label).filter(Boolean);
    const required = new Set(asList(expected.mustInclude).map(candidateIdentity).filter(Boolean));
    const forbidden = new Set(asList(expected.mustExclude).map(candidateIdentity).filter(Boolean));
    for (const type of mediaType ? ['all', mediaType] : ['all']) {
      const stats = bucket(type);
      const identities = results.map(candidateIdentity);
      stats.caseCount += 1;
      stats.results += results.length;
      if (required.size) {
        if (identities[0] && required.has(identities[0])) stats.top1 += 1;
        if (identities.slice(0, 3).some(identity => required.has(identity))) stats.top3 += 1;
        const rank = identities.findIndex(identity => required.has(identity));
        if (rank >= 0) stats.reciprocalRank += 1 / (rank + 1);
        stats.reciprocalCases += 1;
      }
      for (const result of results) {
        const identity = candidateIdentity(result);
        if (forbidden.has(identity) || (expected.mediaType && result.mediaType !== expected.mediaType)) {
          stats.violations += 1;
        }
        if (!concepts.length) continue;
        const coverage = conceptCoverage(candidateSemanticText(result), concepts);
        stats.coverageTotal += coverage;
        stats.coverageSamples += 1;
        if (coverage < coverageThreshold && !required.has(identity)) stats.offTopic += 1;
      }
    }
  }
  const summarize = type => {
    const stats = buckets.get(type);
    if (!stats) return { caseCount: 0, top1: 0, top3: 0, mrr: 0, constraintViolationRate: 0,
      offTopicRate: 0, averageSemanticCoverage: 0, averageResultCount: 0 };
    return {
      caseCount: stats.caseCount,
      top1: ratio(stats.top1, stats.reciprocalCases),
      top3: ratio(stats.top3, stats.reciprocalCases),
      mrr: ratio(stats.reciprocalRank, stats.reciprocalCases),
      constraintViolationRate: ratio(stats.violations, stats.results),
      offTopicRate: ratio(stats.offTopic, stats.coverageSamples),
      averageSemanticCoverage: ratio(stats.coverageTotal, stats.coverageSamples),
      averageResultCount: ratio(stats.results, stats.caseCount)
    };
  };
  const byMediaType = {};
  for (const type of ['movie', 'tv']) if (buckets.has(type)) byMediaType[type] = summarize(type);
  return { overall: summarize('all'), byMediaType };
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
