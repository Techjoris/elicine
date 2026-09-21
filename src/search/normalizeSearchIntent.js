import { createCanonicalIntent } from '../types/canonicalIntent.runtime.js';

/**
 * Provider-neutral input. Unknown keys are ignored, missing fields receive the
 * Phase 1 defaults. Invalid types and contradictory bounds are rejected.
 * No network, inference, date arithmetic, or mutation of the input.
 * @param {Record<string, unknown>} [input]
 * @returns {import('../types/canonicalIntent').CanonicalIntent}
 */
export function normalizeSearchIntent(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new TypeError('Intent must be a plain object');
  }
  const cleaned = { ...input };
  for (const key of [
    'genres', 'moods', 'themes', 'keywords', 'knownTitles',
    'excludedTitles', 'excludedGenres', 'semanticExclusions', 'languages', 'countries'
  ]) {
    if (Array.isArray(cleaned[key])) {
      cleaned[key] = cleaned[key].map(value =>
        typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value);
    }
  }
  return createCanonicalIntent(cleaned);
}
