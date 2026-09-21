import { normalizeTerm } from './tmdbRetrievalParams.js';

export const DIVERSIFIED_RANKING_FLAG = 'DIVERSIFIED_RANKING_ENABLED';

export const DIVERSIFICATION_CONFIG = Object.freeze({
  windowSize: 20,
  penalties: Object.freeze({
    franchise: 0.05,
    nearDuplicate: 0.08,
    genreOverlap: 0.025,
    themeOverlap: 0.035,
    sameDirector: 0.02
  }),
  overlapThreshold: 0.75,
  maxPenalty: 0.16,
  referenceAlignedScale: 0.2,
  variedIntentScale: 1.25,
  variedTerms: Object.freeze(['varied', 'varies', 'varie', 'diverse', 'diversifie', 'diversifies'])
});

export function isDiversifiedRankingEnabled(env = process.env) {
  return String(env?.[DIVERSIFIED_RANKING_FLAG] ?? 'true').toLowerCase() !== 'false';
}

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
const rounded = value => Number(Number(value || 0).toFixed(6));
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
const normalizedSet = values => new Set(array(values).map(value => normalizeTerm(value)).filter(Boolean));
const identity = candidate => `${candidate.mediaType}:${candidate.tmdbId}`;

function uniqueRankedCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(candidate => {
    const key = identity(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function overlap(left, right) {
  const a = normalizedSet(left);
  const b = normalizedSet(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(value => b.has(value)).length;
  return intersection / new Set([...a, ...b]).size;
}

function candidateYear(candidate) {
  const year = Number.parseInt(String(candidate.releaseDate || candidate.firstAirDate || '').slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

function sameExplicitCollection(left, right) {
  const a = left.diversityData || {};
  const b = right.diversityData || {};
  if (a.collectionId != null && b.collectionId != null) return String(a.collectionId) === String(b.collectionId);
  const leftName = normalizeTerm(a.collectionName);
  const rightName = normalizeTerm(b.collectionName);
  return Boolean(leftName && rightName && leftName === rightName);
}

function nearDuplicate(left, right) {
  if (left.mediaType !== right.mediaType) return false;
  const leftTitles = normalizedSet([left.title, left.originalTitle]);
  const rightTitles = normalizedSet([right.title, right.originalTitle]);
  if (![...leftTitles].some(title => rightTitles.has(title))) return false;
  const leftYear = candidateYear(left);
  const rightYear = candidateYear(right);
  return leftYear == null || rightYear == null || leftYear === rightYear;
}

function sameDirector(left, right) {
  const a = left.diversityData || {};
  const b = right.diversityData || {};
  const ids = overlap(a.directorIds, b.directorIds);
  if (ids > 0) return true;
  return overlap([...normalizedSet(a.directorNames)], [...normalizedSet(b.directorNames)]) > 0;
}

function scaledOverlapPenalty(similarity, weight) {
  const threshold = DIVERSIFICATION_CONFIG.overlapThreshold;
  if (similarity < threshold) return 0;
  return ((similarity - threshold) / (1 - threshold)) * weight;
}

function isVariedIntent(intent) {
  const terms = normalizedSet([...(intent?.themes || []), ...(intent?.moods || []), ...(intent?.keywords || [])]);
  return DIVERSIFICATION_CONFIG.variedTerms.some(term => terms.has(term));
}

function isReferenceAligned(candidate, intent, resolvedContext) {
  if (!(intent?.knownTitles || []).length) return false;
  if (Number(candidate.ranking?.referenceScore || 0) >= 0.75) return true;
  const referenceIds = new Set((resolvedContext?.resolvedTitles || []).map(reference =>
    `${reference.mediaType}:${reference.tmdbId}`));
  return (candidate.retrievalSignals || []).some(signal =>
    ['tmdb_recommendations', 'tmdb_similar'].includes(signal.source) &&
    referenceIds.has(`${candidate.mediaType}:${signal.seedTmdbId}`));
}

function diversityPenalty(candidate, selected, intent, resolvedContext) {
  if (!selected.length) return 0;
  const weights = DIVERSIFICATION_CONFIG.penalties;
  let franchise = 0;
  let duplicate = 0;
  let genre = 0;
  let theme = 0;
  let director = 0;
  for (const prior of selected) {
    franchise = Math.max(franchise, sameExplicitCollection(candidate, prior) ? weights.franchise : 0);
    duplicate = Math.max(duplicate, nearDuplicate(candidate, prior) ? weights.nearDuplicate : 0);
    genre = Math.max(genre, scaledOverlapPenalty(overlap(candidate.genreIds, prior.genreIds), weights.genreOverlap));
    theme = Math.max(theme, scaledOverlapPenalty(overlap(
      candidate.constraintData?.themes, prior.constraintData?.themes), weights.themeOverlap));
    director = Math.max(director, sameDirector(candidate, prior) ? weights.sameDirector : 0);
  }
  let scale = isReferenceAligned(candidate, intent, resolvedContext)
    ? DIVERSIFICATION_CONFIG.referenceAlignedScale : 1;
  if (isVariedIntent(intent)) scale *= DIVERSIFICATION_CONFIG.variedIntentScale;
  return Math.min(DIVERSIFICATION_CONFIG.maxPenalty, (franchise + duplicate + genre + theme + director) * scale);
}

/** Greedy local reranking over the Phase 8 top window. */
export function diversifyRankedCandidates(candidates, intent = {}, resolvedContext = {}, {
  telemetry = {}, env = process.env, enabled = isDiversifiedRankingEnabled(env), accumulate = true
} = {}) {
  const input = Array.isArray(candidates) ? candidates : [];
  if (!enabled || (input.length > 0 && !input.every(candidate => Number.isFinite(candidate.ranking?.finalScore)))) {
    return input;
  }
  const startedAt = Date.now();
  const unique = uniqueRankedCandidates(input);
  const head = unique.slice(0, DIVERSIFICATION_CONFIG.windowSize);
  const tail = unique.slice(DIVERSIFICATION_CONFIG.windowSize);
  const selected = [];
  const remaining = head.map((candidate, originalIndex) => ({ candidate, originalIndex }));

  if (remaining.length) {
    const first = remaining.shift();
    selected.push({ ...first.candidate, diversifiedScore: rounded(first.candidate.ranking.finalScore) });
  }
  while (remaining.length) {
    let winnerIndex = 0;
    let winnerScore = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index];
      const score = Number(entry.candidate.ranking.finalScore) -
        diversityPenalty(entry.candidate, selected, intent, resolvedContext);
      if (score > winnerScore || (score === winnerScore &&
        entry.originalIndex < remaining[winnerIndex].originalIndex)) {
        winnerIndex = index;
        winnerScore = score;
      }
    }
    const [winner] = remaining.splice(winnerIndex, 1);
    selected.push({ ...winner.candidate, diversifiedScore: rounded(winnerScore) });
  }
  const diversified = [...selected, ...tail.map(candidate => ({ ...candidate,
    diversifiedScore: rounded(candidate.ranking.finalScore) }))];
  const originalOrder = unique.map(identity);
  const reordered = diversified.reduce((count, candidate, index) =>
    count + Number(originalOrder[index] !== identity(candidate)), 0);
  Object.assign(telemetry, {
    diversificationAttempted: true,
    diversificationCandidateCount: (accumulate ? Number(telemetry.diversificationCandidateCount || 0) : 0) + input.length,
    diversificationReorderedCount: (accumulate ? Number(telemetry.diversificationReorderedCount || 0) : 0) + reordered,
    diversificationDurationMs: (accumulate ? Number(telemetry.diversificationDurationMs || 0) : 0) + (Date.now() - startedAt)
  });
  return diversified;
}
