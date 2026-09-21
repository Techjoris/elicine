import { createResolvedIntentContext } from './resolvedIntentContext.js';

export const ENTITY_RESOLUTION_LIMIT = 5;
export const ENTITY_RESOLUTION_THRESHOLD = 0.72;
export const ENTITY_AMBIGUITY_MARGIN = 0.06;
export const PERSON_RESOLUTION_LIMIT = 2;
export const PERSON_RESOLUTION_THRESHOLD = 0.78;

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

function titleWithTrailingPreference(inputTitle, candidateValue) {
  const input = normalizeEntityTitle(inputTitle);
  const candidate = normalizeEntityTitle(candidateValue);
  if (!input || !candidate || !input.startsWith(`${candidate} `)) return false;
  const suffix = input.slice(candidate.length).trim();
  return /^(?:mais|avec|sans|plus|moins|qui|dont|where|with|without)\b/.test(suffix);
}

function splitCompoundReference(inputTitle) {
  const parts = String(inputTitle || '').split(/\s+(?:et|ou|and|or)\s+/iu).map(value => value.trim()).filter(Boolean);
  if (parts.length !== 2 || parts.some(part => part.split(/\s+/).length > 5 || part.length < 2)) return [];
  return parts;
}

function candidatePersonName(candidate) {
  return candidate?.name || candidate?.original_name || '';
}

function scorePersonCandidate(inputName, candidate) {
  const input = normalizeEntityTitle(inputName);
  const name = normalizeEntityTitle(candidatePersonName(candidate));
  if (!input || !name) return 0;
  let score = input === name ? 0.96 : tokenSimilarity(inputName, candidatePersonName(candidate)) * 0.82;
  const department = normalizeEntityTitle(candidate?.known_for_department || '');
  const knownFor = Array.isArray(candidate?.known_for) ? candidate.known_for : [];
  if (department === 'acting' || knownFor.some(item => candidateMediaType(item))) score += 0.04;
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function selectPersonCandidate(inputName, candidates) {
  const scored = (Array.isArray(candidates) ? candidates : [])
    .filter(candidate => candidate && candidate.id !== undefined && candidate.id !== null)
    .map(candidate => ({ candidate, score: scorePersonCandidate(inputName, candidate), exact:
      normalizeEntityTitle(inputName) === normalizeEntityTitle(candidatePersonName(candidate)) }))
    .sort((left, right) => right.score - left.score || Number(right.exact) - Number(left.exact) ||
      Number(right.candidate.popularity || 0) - Number(left.candidate.popularity || 0));
  const top = scored[0];
  const second = scored[1];
  if (!top || top.score < PERSON_RESOLUTION_THRESHOLD) return { candidate: null, score: top?.score || 0, ambiguous: false };
  const ambiguous = Boolean(second && top.score - second.score < ENTITY_AMBIGUITY_MARGIN && !top.exact);
  return ambiguous ? { candidate: null, score: top.score, ambiguous: true } : { candidate: top.candidate, score: top.score, ambiguous: false };
}

function buildResolvedPerson(inputName, candidate, confidence) {
  return {
    inputName,
    tmdbId: Number(candidate.id),
    name: candidatePersonName(candidate),
    knownForDepartment: candidate.known_for_department || null,
    resolutionConfidence: confidence,
    resolutionMethod: normalizeEntityTitle(inputName) === normalizeEntityTitle(candidatePersonName(candidate))
      ? 'exact_person_name' : 'deterministic_person_similarity'
  };
}

/** Exported for deterministic unit tests and diagnostics. */
export function scoreEntityCandidate(inputTitle, candidate, expectedMediaType = null, expectedYear = null) {
  const input = normalizeEntityTitle(inputTitle);
  const title = normalizeEntityTitle(candidateTitle(candidate));
  const original = normalizeEntityTitle(candidateOriginalTitle(candidate));
  let score = 0;

  if (input && input === title) score = 0.9;
  else if (input && input === original) score = 0.86;
  else if (titleWithTrailingPreference(inputTitle, candidateTitle(candidate)) ||
      titleWithTrailingPreference(inputTitle, candidateOriginalTitle(candidate))) score = 0.84;
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
  const expectedYear = Number.isInteger(intent?.yearMin) && intent.yearMin === intent?.yearMax
    ? intent.yearMin : null;
  const resolvedTitles = [];
  const unresolvedTitles = [];
  const seenEntities = new Set();
  let ambiguousCount = 0;
  let errorCount = 0;

  for (const inputTitle of uniqueTitles) {
    try {
      const candidates = await searchCandidates(inputTitle, expectedMediaType);
      let selection = selectEntityCandidate(
        inputTitle, Array.isArray(candidates) ? candidates : [], expectedMediaType, expectedYear
      );
      if (!selection.candidate) {
        const alternatives = splitCompoundReference(inputTitle);
        let alternativeResolved = false;
        for (const alternative of alternatives) {
          const alternativeCandidates = await searchCandidates(alternative, expectedMediaType);
          selection = selectEntityCandidate(alternative,
            Array.isArray(alternativeCandidates) ? alternativeCandidates : [], expectedMediaType, expectedYear);
          if (!selection.candidate) {
            if (selection.ambiguous) ambiguousCount += 1;
            continue;
          }
          const resolved = buildResolvedTitle(alternative, selection.candidate, selection.score);
          const entityKey = `${resolved.mediaType || 'unknown'}:${resolved.tmdbId}`;
          if (!seenEntities.has(entityKey)) {
            seenEntities.add(entityKey);
            resolvedTitles.push(resolved);
          }
          alternativeResolved = true;
        }
        if (!alternativeResolved) {
          unresolvedTitles.push(inputTitle);
          if (selection.ambiguous) ambiguousCount += 1;
        }
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

/** Resolve a small, explicit list of people without guessing from arbitrary terms. */
export async function resolveKnownPeople(inputPeople = [], { searchPeople, limit = PERSON_RESOLUTION_LIMIT } = {}) {
  const startedAt = Date.now();
  const uniquePeople = [];
  const seen = new Set();
  for (const person of Array.isArray(inputPeople) ? inputPeople : []) {
    const value = String(typeof person === 'string' ? person : person?.name || '').trim();
    const normalized = normalizeEntityTitle(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    uniquePeople.push(value);
    if (uniquePeople.length >= Math.max(0, Math.min(PERSON_RESOLUTION_LIMIT, limit))) break;
  }
  const resolvedPeople = [];
  const unresolvedPeople = [];
  let ambiguousCount = 0;
  let errorCount = 0;
  for (const inputName of uniquePeople) {
    try {
      const candidates = typeof searchPeople === 'function' ? await searchPeople(inputName) : [];
      const selection = selectPersonCandidate(inputName, candidates);
      if (!selection.candidate) {
        unresolvedPeople.push(inputName);
        if (selection.ambiguous) ambiguousCount += 1;
        continue;
      }
      const resolved = buildResolvedPerson(inputName, selection.candidate, selection.score);
      if (!resolvedPeople.some(person => person.tmdbId === resolved.tmdbId)) resolvedPeople.push(resolved);
    } catch {
      errorCount += 1;
      unresolvedPeople.push(inputName);
    }
  }
  return {
    resolvedPeople,
    unresolvedPeople,
    metrics: {
      personResolutionAttempted: uniquePeople.length > 0,
      personResolutionInputCount: uniquePeople.length,
      personResolutionResolvedCount: resolvedPeople.length,
      personResolutionUnresolvedCount: unresolvedPeople.length,
      personResolutionAmbiguousCount: ambiguousCount,
      personResolutionErrorCount: errorCount,
      personResolutionDurationMs: Date.now() - startedAt
    }
  };
}
