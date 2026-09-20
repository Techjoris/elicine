import { createResolvedIntentContext } from './resolvedIntentContext.js';

export const ENTITY_RESOLUTION_LIMIT = 5;
export const ENTITY_RESOLUTION_THRESHOLD = 0.72;
export const ENTITY_AMBIGUITY_MARGIN = 0.06;

/** Comparison-only normalization; the original title is always preserved. */
export function normalizeEntityTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function candidateTitle(candidate) {
  return candidate?.title || candidate?.name || '';
}

function candidateOriginalTitle(candidate) {
  return candidate?.original_title || candidate?.original_name || '';
}

function candidateMediaType(candidate) {
  if (candidate?.media_type === 'movie' || candidate?.media_type === 'tv') return candidate.media_type;
  if (candidate?.first_air_date || candidate?.name || candidate?.original_name) return 'tv';
  if (candidate?.release_date || candidate?.title || candidate?.original_title) return 'movie';
  return null;
}

function yearOf(candidate) {
  const value = candidate?.release_date || candidate?.first_air_date || candidate?.release_year;
  const year = Number.parseInt(String(value || '').slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

function tokenSimilarity(left, right) {
  const a = new Set(normalizeEntityTitle(left).split(' ').filter(Boolean));
  const b = new Set(normalizeEntityTitle(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(token => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

/** Exported for deterministic unit tests and diagnostics. */
export function scoreEntityCandidate(inputTitle, candidate, expectedMediaType = null, expectedYear = null) {
  const input = normalizeEntityTitle(inputTitle);
  const title = normalizeEntityTitle(candidateTitle(candidate));
  const original = normalizeEntityTitle(candidateOriginalTitle(candidate));
  let score = 0;

  if (input && input === title) score = 0.9;
  else if (input && input === original) score = 0.86;
  else score = Math.max(tokenSimilarity(inputTitle, candidateTitle(candidate)), tokenSimilarity(inputTitle, candidateOriginalTitle(candidate))) * 0.72;

  const type = candidateMediaType(candidate);
  if (expectedMediaType && type === expectedMediaType) score += 0.08;
  else if (expectedMediaType && type && type !== expectedMediaType) score -= 0.28;

  const candidateYear = yearOf(candidate);
  if (expectedYear && candidateYear) {
    if (candidateYear === Number(expectedYear)) score += 0.06;
    else if (Math.abs(candidateYear - Number(expectedYear)) > 2) score -= 0.08;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function selectEntityCandidate(inputTitle, candidates, expectedMediaType, expectedYear) {
  const scored = candidates
    .filter(candidate => candidate && candidate.id !== undefined && candidate.id !== null)
    .map(candidate => ({
      candidate,
      score: scoreEntityCandidate(inputTitle, candidate, expectedMediaType, expectedYear),
      exact: normalizeEntityTitle(inputTitle) === normalizeEntityTitle(candidateTitle(candidate)) ||
        normalizeEntityTitle(inputTitle) === normalizeEntityTitle(candidateOriginalTitle(candidate))
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.exact !== left.exact) return Number(right.exact) - Number(left.exact);
      return Number(right.candidate.popularity || 0) - Number(left.candidate.popularity || 0);
    });

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score < ENTITY_RESOLUTION_THRESHOLD) return { candidate: null, score: top?.score || 0, ambiguous: false };
  const sameNormalizedTitle = second && normalizeEntityTitle(candidateTitle(top.candidate)) ===
    normalizeEntityTitle(candidateTitle(second.candidate));
  const ambiguous = Boolean(second && top.score - second.score < ENTITY_AMBIGUITY_MARGIN &&
    ((!expectedMediaType && sameNormalizedTitle) || (!top.exact && top.score < 0.9)));
  if (ambiguous) return { candidate: null, score: top.score, ambiguous: true };
  return { candidate: top.candidate, score: top.score, ambiguous: false };
}

function buildResolvedTitle(inputTitle, candidate, confidence) {
  const mediaType = candidateMediaType(candidate);
  return {
    inputTitle,
    tmdbId: Number(candidate.id),
    mediaType,
    canonicalTitle: candidateTitle(candidate),
    originalTitle: candidateOriginalTitle(candidate) || candidateTitle(candidate),
    releaseYear: yearOf(candidate),
    originalLanguage: candidate.original_language || null,
    genreIds: Array.isArray(candidate.genre_ids) ? [...candidate.genre_ids] : [],
    resolutionConfidence: confidence,
    resolutionMethod: normalizeEntityTitle(inputTitle) === normalizeEntityTitle(candidateTitle(candidate))
      ? 'exact_title' : 'deterministic_similarity'
  };
}

/**
 * Resolve only the references in CanonicalIntent. The provider is injected so
 * this module can be tested without TMDB or network access.
 */
export async function resolveKnownTitles(intent, { searchCandidates, limit = ENTITY_RESOLUTION_LIMIT } = {}) {
  const startedAt = Date.now();
  const inputTitles = Array.isArray(intent?.knownTitles) ? intent.knownTitles : [];
  const uniqueTitles = [];
  const seen = new Set();
  for (const title of inputTitles) {
    const normalized = normalizeEntityTitle(title);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueTitles.push(String(title).trim());
    if (uniqueTitles.length >= Math.max(0, Math.min(ENTITY_RESOLUTION_LIMIT, limit))) break;
  }

  const expectedMediaType = intent?.mediaType || null;
  const resolvedTitles = [];
  const unresolvedTitles = [];
  const seenEntities = new Set();
  let ambiguousCount = 0;
  let errorCount = 0;

  for (const inputTitle of uniqueTitles) {
    try {
      const candidates = await searchCandidates(inputTitle, expectedMediaType);
      const selection = selectEntityCandidate(inputTitle, Array.isArray(candidates) ? candidates : [], expectedMediaType);
      if (!selection.candidate) {
        unresolvedTitles.push(inputTitle);
        if (selection.ambiguous) ambiguousCount += 1;
        continue;
      }
      const resolved = buildResolvedTitle(inputTitle, selection.candidate, selection.score);
      const entityKey = `${resolved.mediaType || 'unknown'}:${resolved.tmdbId}`;
      if (!seenEntities.has(entityKey)) {
        seenEntities.add(entityKey);
        resolvedTitles.push(resolved);
      }
    } catch {
      errorCount += 1;
      unresolvedTitles.push(inputTitle);
    }
  }

  return createResolvedIntentContext({
    resolvedTitles,
    unresolvedTitles,
    metrics: {
      entityResolutionAttempted: uniqueTitles.length > 0,
      entityResolutionInputCount: uniqueTitles.length,
      entityResolutionResolvedCount: resolvedTitles.length,
      entityResolutionUnresolvedCount: unresolvedTitles.length,
      entityResolutionAmbiguousCount: ambiguousCount,
      entityResolutionErrorCount: errorCount,
      entityResolutionDurationMs: Date.now() - startedAt
    }
  });
}
