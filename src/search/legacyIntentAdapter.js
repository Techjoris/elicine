import { extractReliableSemanticExclusions, normalizeSemanticExclusions } from './strictConstraintFilter.js';
import { extractFallbackIntentSignals } from './fallbackIntentSignals.js';

/**
 * Adapter for extractMatchesFromJson's legacy output, NOT an LLM SDK response.
 * Keep all legacy field names here, outside the canonical contract.
 * The parser synthesizes references from recommendations, themes from moods,
 * and cleanSearchKeywords from the entire query: not independent facts.
 */
export function adaptLegacySearchIntent(interpreted, { userQuery = '', recoverFallbackSignals = true } = {}) {
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
  const providerFallback = recoverFallbackSignals && interpreted.provider === 'Algorithme Éliciné';
  const hasStructuredSemantics = [interpreted.primary_genres, interpreted.mood_tags,
    interpreted.explicit_themes, interpreted.keywords, references]
    .some(value => Array.isArray(value) && value.length > 0);
  const recovered = providerFallback && !hasStructuredSemantics
    ? extractFallbackIntentSignals(userQuery) : { genres: [], moods: [], themes: [], keywords: [] };
  return {
    mediaType: typeof media === 'string' && media.trim().toLowerCase() === 'all' ? null : media,
    genres: interpreted.primary_genres?.length ? interpreted.primary_genres : recovered.genres,
    moods: interpreted.mood_tags?.length ? interpreted.mood_tags : recovered.moods,
    knownTitles,
    // Only independently structured fields are carried through when supplied.
    // Today's legacy parser does not retain most of these optional fields.
    themes: interpreted.explicit_themes?.length ? interpreted.explicit_themes : recovered.themes,
    keywords: interpreted.keywords?.length ? interpreted.keywords : recovered.keywords,
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
