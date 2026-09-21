import { extractReliableSemanticExclusions, normalizeSemanticExclusions } from './strictConstraintFilter.js';

/**
 * Adapter for extractMatchesFromJson's legacy output, NOT an LLM SDK response.
 * Keep all legacy field names here, outside the canonical contract.
 * The parser synthesizes references from recommendations, themes from moods,
 * and cleanSearchKeywords from the entire query: not independent facts.
 */
export function adaptLegacySearchIntent(interpreted, { userQuery = '' } = {}) {
  if (!interpreted || typeof interpreted !== 'object' || Array.isArray(interpreted)) {
    throw new TypeError('Legacy interpretation must be an object');
  }
  const media = interpreted.media_type;
  const references = interpreted.reference_titles;
  if (references != null && (!Array.isArray(references) ||
      references.some(title => typeof title !== 'string'))) {
    throw new TypeError('Legacy references must be strings');
  }
  // Literal whole-title evidence only; no fuzzy correction or translation.
  const words = value => value.normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const queryWords = typeof userQuery === 'string' ? ' ' + words(userQuery) + ' ' : '';
  const knownTitles = (references || []).filter(title => {
    const titleWords = words(title);
    return titleWords && queryWords.includes(' ' + titleWords + ' ');
  });
  return {
    mediaType: typeof media === 'string' && media.trim().toLowerCase() === 'all' ? null : media,
    genres: interpreted.primary_genres,
    moods: interpreted.mood_tags,
    knownTitles,
    // Only independently structured fields are carried through when supplied.
    // Today's legacy parser does not retain most of these optional fields.
    themes: interpreted.explicit_themes,
    keywords: interpreted.keywords,
    excludedTitles: interpreted.excluded_titles,
    excludedGenres: interpreted.excluded_genres,
    semanticExclusions: interpreted.semantic_exclusions !== undefined
      ? (Array.isArray(interpreted.semantic_exclusions)
          ? normalizeSemanticExclusions(interpreted.semantic_exclusions) : interpreted.semantic_exclusions)
      : extractReliableSemanticExclusions(userQuery),
    yearMin: interpreted.year_min,
    yearMax: interpreted.year_max,
    languages: interpreted.languages,
    countries: interpreted.countries,
    runtimeMin: interpreted.runtime_min,
    runtimeMax: interpreted.runtime_max,
    minRating: interpreted.min_rating,
    adult: interpreted.adult,
    sortPreference: interpreted.sort_preference
  };
}
