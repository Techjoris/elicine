import { extractReliableSemanticExclusions, normalizeSemanticExclusions } from './strictConstraintFilter.js';
import { extractFallbackIntentSignals, extractReferenceTitleQueries } from './fallbackIntentSignals.js';

const GENERIC_GENRES = new Set([
  'action', 'comedy', 'comedie', 'drama', 'drame', 'horror', 'horreur',
  'science fiction', 'thriller', 'war', 'guerre'
]);

const GENERIC_SEMANTIC_TERMS = new Set([
  ...GENERIC_GENRES, 'broad', 'general', 'generic', 'intense', 'military', 'militaire'
]);

const normalizedSignal = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function semanticCollapseDetected(interpreted, recovered, knownTitles) {
  const genres = Array.isArray(interpreted.primary_genres) ? interpreted.primary_genres : [];
  const structuredTerms = [...(Array.isArray(interpreted.explicit_themes) ? interpreted.explicit_themes : []),
    ...(Array.isArray(interpreted.keywords) ? interpreted.keywords : [])];
  const hasSpecificStructuredSignal = (Array.isArray(knownTitles) && knownTitles.length > 0) ||
    structuredTerms.some(value => {
      const signal = normalizedSignal(value);
      return signal && !GENERIC_SEMANTIC_TERMS.has(signal);
    });
  if (hasSpecificStructuredSignal) return false;
  const normalizedGenres = genres.map(normalizedSignal).filter(Boolean);
  const onlyGenericGenres = normalizedGenres.every(genre => GENERIC_GENRES.has(genre));
  return onlyGenericGenres && (recovered.themes.length > 0 || recovered.people?.length > 0);
}

const mergeUnique = (...groups) => {
  const seen = new Set();
  return groups.flat().filter(value => {
    const key = String(value || '').normalize('NFC').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
};

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
  // Interpreter-provided titles are a trusted channel: the LLM may normalize or
  // repair a reference ("shuter island" -> "Shutter Island") that literal
  // matching would drop. The legacy parser never emits this key, so its
  // non-promotion guarantee is unchanged.
  const explicitTitles = interpreted.known_titles;
  if (explicitTitles != null && (!Array.isArray(explicitTitles) ||
      explicitTitles.some(title => typeof title !== 'string'))) {
    throw new TypeError('Interpreted known titles must be strings');
  }
  // Literal whole-title evidence only; no fuzzy correction or translation.
  const words = value => value.normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const queryWords = typeof userQuery === 'string' ? ' ' + words(userQuery) + ' ' : '';
  const literalReferences = (references || []).filter(title => {
    const titleWords = words(title);
    return titleWords && queryWords.includes(' ' + titleWords + ' ');
  });
  // When the interpreter supplied titles, the raw "comme X" regex is a no-LLM
  // signal and must not complete the interpreted intent. Extraction stays active
  // for the legacy parser and for the explicit no-LLM fallback path.
  const extractedReferences = (explicitTitles?.length ? [] : extractReferenceTitleQueries(userQuery)).filter(extracted => {
    const extractedWords = words(extracted);
    return !literalReferences.some(literal => {
      const literalWords = words(literal);
      return extractedWords === literalWords || extractedWords.startsWith(`${literalWords} `);
    });
  });
  const knownTitles = mergeUnique(explicitTitles || [], literalReferences, extractedReferences).slice(0, 5);
  const providerFallback = recoverFallbackSignals && interpreted.provider === 'Algorithme Éliciné';
  const hasStructuredSemantics = [interpreted.primary_genres, interpreted.mood_tags,
    interpreted.explicit_themes, interpreted.keywords, knownTitles]
    .some(value => Array.isArray(value) && value.length > 0);
  const possibleRecovery = recoverFallbackSignals
    ? extractFallbackIntentSignals(userQuery) : { genres: [], moods: [], themes: [], keywords: [], people: [] };
  const recoverMissing = (providerFallback && !hasStructuredSemantics) ||
    (recoverFallbackSignals && semanticCollapseDetected(interpreted, possibleRecovery, knownTitles));
  const recovered = recoverMissing
    ? possibleRecovery : { genres: [], moods: [], themes: [], keywords: [], people: [] };
  return {
    mediaType: typeof media === 'string' && media.trim().toLowerCase() === 'all' ? null : media,
    genres: interpreted.primary_genres?.length ? interpreted.primary_genres : recovered.genres,
    moods: mergeUnique(interpreted.mood_tags || [], recovered.moods),
    knownTitles,
    // Only independently structured fields are carried through when supplied.
    // Today's legacy parser does not retain most of these optional fields.
    themes: mergeUnique(interpreted.explicit_themes || [], recovered.themes),
    keywords: mergeUnique(interpreted.keywords || [], recovered.keywords),
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
