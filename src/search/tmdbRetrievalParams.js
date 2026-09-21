import { expandSemanticTerms, SEMANTIC_EXPANSION_LIMIT } from './semanticExpansion.js';

export const normalizeTerm = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// TMDB taxonomies are different for TV and films. No invented TV Thriller/Romance.
const shared = { animation: 16, comedy: 35, comedie: 35, crime: 80, policier: 80, policiere: 80,
  documentary: 99, documentaire: 99, drama: 18, drame: 18, family: 10751, famille: 10751,
  mystery: 9648, mystere: 9648, western: 37 };
const genres = {
  movie: { ...shared, action: 28, adventure: 12, aventure: 12, fantasy: 14, fantastique: 14,
    horror: 27, horreur: 27, romance: 10749, 'science fiction': 878, 'sci fi': 878, sf: 878,
    thriller: 53, war: 10752, guerre: 10752, music: 10402, musique: 10402, history: 36, histoire: 36, 'tv movie': 10770 },
  tv: { ...shared, action: 10759, adventure: 10759, aventure: 10759, 'action adventure': 10759,
    fantasy: 10765, fantastique: 10765, 'science fiction': 10765, 'sci fi': 10765, sf: 10765,
    'sci fi fantasy': 10765, war: 10768, guerre: 10768, 'war politics': 10768,
    kids: 10762, news: 10763, reality: 10764, soap: 10766, talk: 10767 }
};
export function tmdbGenreIds(names = [], type) {
  return [...new Set(names.map(name => genres[type]?.[normalizeTerm(name)]).filter(Boolean))];
}

// Expanded terms are curated and bounded; TMDB still accepts only exact keyword matches.
export function keywordTerms(intent, limit = SEMANTIC_EXPANSION_LIMIT) {
  const expansion = expandSemanticTerms(intent, limit);
  const effectiveLimit = expansion.applied ? limit : Math.min(5, limit);
  return [...new Set([...expansion.addedTerms, ...expansion.sourceTerms])]
    .filter(term => term.length >= 3 && term.length <= 80)
    .slice(0, Math.max(0, Math.min(effectiveLimit, SEMANTIC_EXPANSION_LIMIT)));
}
export function reliableKeywordId(term, results) {
  const ids = [...new Set((results || []).filter(row => normalizeTerm(row.name) === normalizeTerm(term))
    .map(row => Number(row.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  return ids.length === 1 ? ids[0] : null;
}

/**
 * Exclusion concepts never name a work: each family maps onto the TMDB keyword
 * wordings the provider itself tags, so Discover can rule the family out at the
 * source instead of trusting a bounded local pool to have sorted it out. The
 * table is conceptual and bilingual by construction (the concepts are the
 * canonical ones the negative clauses normalize to), never a list of works.
 */
export const EXCLUSION_KEYWORD_TERMS = Object.freeze({
  murder: Object.freeze(['murder', 'serial killer', 'homicide', 'killing']),
  police_investigation: Object.freeze(['police investigation', 'detective']),
  magic: Object.freeze(['magic', 'sorcery']),
  supernatural: Object.freeze(['supernatural', 'paranormal']),
  aliens: Object.freeze(['alien']),
  monsters: Object.freeze(['monster']),
  ghosts: Object.freeze(['ghost']),
  time_travel: Object.freeze(['time travel', 'time loop']),
  space_travel: Object.freeze(['space travel']),
  robots: Object.freeze(['robot']),
  romance: Object.freeze(['romance']),
  comedy: Object.freeze(['comedy']),
  science_fiction: Object.freeze(['science fiction']),
  fantasy_creatures: Object.freeze(['creature']),
  relationship: Object.freeze(['couple'])
});

export function exclusionKeywordTerms(concepts = [], limit = 4) {
  const terms = [];
  const max = Math.max(0, limit);
  for (const concept of Array.isArray(concepts) ? concepts : [concepts]) {
    if (terms.length >= max) break;
    const key = String(concept ?? '').trim().toLowerCase();
    // Family keys are underscore wordings (`police_investigation`); a raw
    // phrase is still accepted through the standard normalization so an
    // unmapped exclusion never loses the terms it could have matched.
    const mapped = EXCLUSION_KEYWORD_TERMS[key] || EXCLUSION_KEYWORD_TERMS[normalizeTerm(key)] || [];
    for (const term of mapped) {
      if (terms.length >= max) break;
      if (!terms.includes(term)) terms.push(term);
    }
  }
  return terms;
}

export function discoverParams(intent, type, keywordIds = [], excludedKeywordIds = []) {
  const params = { language: 'fr-FR', page: 1, include_adult: intent.adult ?? false, sort_by: 'popularity.desc' };
  const ids = tmdbGenreIds(intent.genres, type);
  if (ids.length) params.with_genres = ids.join(',');
  if (keywordIds.length) params.with_keywords = keywordIds.join('|');
  // TMDB excludes every work carrying any of these keyword IDs, so a stated
  // exclusion prunes the Discover pool before the local strict filter sees it.
  if (excludedKeywordIds.length) params.without_keywords = excludedKeywordIds.join(',');
  const date = type === 'tv' ? 'first_air_date' : 'primary_release_date';
  if (intent.yearMin != null) params[`${date}.gte`] = `${intent.yearMin}-01-01`;
  if (intent.yearMax != null) params[`${date}.lte`] = `${intent.yearMax}-12-31`;
  if (intent.minRating != null) params['vote_average.gte'] = intent.minRating;
  if (intent.runtimeMin != null) params['with_runtime.gte'] = intent.runtimeMin;
  if (intent.runtimeMax != null) params['with_runtime.lte'] = intent.runtimeMax;
  // API documents a single original-language code. Never silently pick one from many.
  if (intent.languages?.length === 1 && /^[a-z]{2}$/.test(intent.languages[0])) params.with_original_language = intent.languages[0];
  return params;
}

export function hasDiscoverConstraints(intent, type, keywords) {
  return Boolean(intent.mediaType || keywords.length || tmdbGenreIds(intent.genres, type).length ||
    ['yearMin', 'yearMax', 'runtimeMin', 'runtimeMax', 'minRating', 'adult'].some(k => intent[k] != null) ||
    (intent.languages?.length === 1 && /^[a-z]{2}$/.test(intent.languages[0])));
}
