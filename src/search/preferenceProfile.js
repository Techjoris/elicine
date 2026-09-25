/**
 * User preference profile: what a member keeps asking for and deliberately saves.
 *
 * Two kinds of evidence feed it - the searches a member runs (their declared
 * intent) and the works they explicitly keep (watchlist, release alert). The
 * profile is then read back by the *next* searches so the proposals match the
 * member's tastes.
 *
 * It never filters and never overrides relevance: a candidate must already have
 * passed the strict filter, and personalisation only moves the ranking by a
 * bounded share of the computed score. With no evidence at all, every function
 * here returns a neutral value and the engine behaves exactly as it did before.
 */

/** How much each kind of evidence is worth. Saving a work is a deliberate act. */
export const SIGNAL_WEIGHTS = Object.freeze({ search: 1, watchlist: 3, alert: 2.5 });

/** Every new signal fades the older ones, so tastes are allowed to move. */
export const PROFILE_DECAY = 0.97;
/** Number of signals after which the profile is considered fully formed. */
export const MAX_SIGNALS = 40;
/** Entries kept per family, strongest first. */
export const MAX_ENTRIES = 24;
/** Bounded share of the final score personalisation is allowed to move. */
export const PERSONALIZATION_WEIGHT = 0.05;

const clamp = value => Math.min(1, Math.max(0, Number(value) || 0));

/** TMDB genre names (English and French) mapped to their identifiers. */
const GENRE_IDS = Object.freeze({
  action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80, documentary: 99,
  drama: 18, family: 10751, fantasy: 14, history: 36, horror: 27, music: 10402,
  mystery: 9648, romance: 10749, 'science fiction': 878, 'science-fiction': 878,
  'sci-fi': 878, thriller: 53, war: 10752, western: 37,
  'action & adventure': 10759, 'sci-fi & fantasy': 10765, 'war & politics': 10768,
  'tv movie': 10770,
  // French labels, as written by the interpreter when the request is French.
  comedie: 35, 'comedie romantique': 10749, drame: 18, famille: 10751,
  fantastique: 14, guerre: 10752, histoire: 36, horreur: 27, musique: 10402,
  mystere: 9648, policier: 80, documentaire: 99, aventure: 12,
  'action et aventure': 10759, 'science-fiction et fantastique': 10765
});

/** Normalises a genre label so accents, case and punctuation do not matter. */
export function normalizeGenreLabel(label) {
  return String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9& -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identifier of a genre named by the interpreter, or null. */
export function genreIdForLabel(label) {
  const key = normalizeGenreLabel(label);
  if (!key) return null;
  return GENRE_IDS[key] ?? null;
}

export function emptyPreferenceProfile() {
  return { genres: {}, themes: {}, moods: {}, languages: {}, mediaTypes: {}, searches: 0, signals: 0 };
}

/** Keeps only the strongest entries, and normalises everything else. */
function trimFamily(family) {
  const entries = Object.entries(family || {})
    .map(([key, value]) => [String(key).slice(0, 80), Math.max(0, Number(value) || 0)])
    .filter(([key, value]) => key && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTRIES);
  return Object.fromEntries(entries);
}

/** Reads a stored profile (JSON columns may arrive as strings) without throwing. */
export function readPreferenceProfile(raw) {
  const safeObject = value => {
    if (!value) return {};
    if (typeof value === 'string') {
      try { return JSON.parse(value) || {}; } catch { return {}; }
    }
    return typeof value === 'object' ? value : {};
  };
  const row = raw || {};
  return {
    genres: trimFamily(safeObject(row.genres)),
    themes: trimFamily(safeObject(row.themes)),
    moods: trimFamily(safeObject(row.moods)),
    languages: trimFamily(safeObject(row.languages)),
    mediaTypes: trimFamily(safeObject(row.mediaTypes ?? row.media_types)),
    searches: Math.max(0, Number(row.searches) || 0),
    signals: Math.max(0, Number(row.signals) || 0)
  };
}

function addFamily(family, entries, weight) {
  const next = { ...family };
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = String(entry || '').trim().slice(0, 80);
    if (!key) continue;
    next[key] = (Number(next[key]) || 0) + weight;
  }
  return next;
}

function decayFamily(family, decay) {
  const next = {};
  for (const [key, value] of Object.entries(family || {})) {
    const faded = (Number(value) || 0) * decay;
    if (faded > 0.01) next[key] = faded;
  }
  return next;
}

/**
 * Applies one evidence to the profile and returns a new profile. The input is
 * never mutated, so a caller can merge several signals before persisting.
 */
export function mergePreferenceSignal(profile, signal) {
  const base = readPreferenceProfile(profile);
  const kind = SIGNAL_WEIGHTS[signal?.kind] ? signal.kind : 'search';
  const weight = SIGNAL_WEIGHTS[kind];
  const mediaType = signal?.mediaType === 'tv' || signal?.mediaType === 'movie' ? signal.mediaType : null;

  return {
    genres: addFamily(decayFamily(base.genres, PROFILE_DECAY), signal?.genres, weight),
    themes: addFamily(decayFamily(base.themes, PROFILE_DECAY), signal?.themes, weight * 0.6),
    moods: addFamily(decayFamily(base.moods, PROFILE_DECAY), signal?.moods, weight * 0.5),
    languages: addFamily(decayFamily(base.languages, PROFILE_DECAY), signal?.languages, weight * 0.4),
    mediaTypes: mediaType
      ? addFamily(decayFamily(base.mediaTypes, PROFILE_DECAY), [mediaType], weight * 0.5)
      : decayFamily(base.mediaTypes, PROFILE_DECAY),
    searches: base.searches + (kind === 'search' ? 1 : 0),
    signals: base.signals + 1
  };
}

/** How much the profile is worth, 0 (brand new) to 1 (fully formed). */
export function profileStrength(profile) {
  const read = readPreferenceProfile(profile);
  if (read.signals <= 0) return 0;
  return clamp(read.signals / MAX_SIGNALS);
}

const maxWeight = family => Object.values(family || {}).reduce((max, value) => Math.max(max, Number(value) || 0), 0);

/** Evidence collected for one search intent. */
export function preferenceSignalFromIntent(intent, { mediaType = null, kind = 'search' } = {}) {
  return {
    kind,
    genres: (Array.isArray(intent?.genres) ? intent.genres : []).map(genreIdForLabel).filter(Boolean).map(String),
    themes: Array.isArray(intent?.themes) ? intent.themes : [],
    moods: Array.isArray(intent?.moods) ? intent.moods : [],
    languages: Array.isArray(intent?.languages) ? intent.languages : [],
    mediaType: mediaType === 'tv' || mediaType === 'movie' ? mediaType : null
  };
}

/** Evidence collected when a member saves a work for later. */
export function preferenceSignalFromWork(work, { kind = 'watchlist' } = {}) {
  const genres = Array.isArray(work?.genreIds) ? work.genreIds : [];
  const themes = work?.constraintData?.themes;
  return {
    kind,
    genres: genres.map(String),
    themes: Array.isArray(themes) ? themes : [],
    moods: Array.isArray(work?.constraintData?.moods) ? work.constraintData.moods : [],
    languages: work?.originalLanguage ? [work.originalLanguage] : [],
    mediaType: work?.mediaType === 'tv' || work?.mediaType === 'movie' ? work.mediaType : null
  };
}

/**
 * How well a candidate matches the profile, 0 to 1. Only the families the
 * profile actually knows about are counted, and a family the member has never
 * expressed simply does not participate.
 */
export function personalizationScore(candidate, profile) {
  const read = readPreferenceProfile(profile);
  if (profileStrength(read) <= 0 || !candidate) return 0;

  const parts = [];

  const genreMax = maxWeight(read.genres);
  const genreIds = Array.isArray(candidate.genreIds) ? candidate.genreIds : [];
  if (genreMax > 0 && genreIds.length > 0) {
    const earned = genreIds.reduce((sum, id) => sum + (Number(read.genres[String(id)]) || 0), 0);
    parts.push([0.5, clamp(earned / (genreMax * Math.min(genreIds.length, 2)))]);
  }

  const themeMax = maxWeight(read.themes);
  const themes = candidate.constraintData?.themes;
  if (themeMax > 0 && Array.isArray(themes) && themes.length > 0) {
    const known = themes.filter(theme => Number(read.themes[String(theme).trim()]) > 0).length;
    parts.push([0.2, clamp(known / themes.length)]);
  }

  const moodMax = maxWeight(read.moods);
  const moods = candidate.constraintData?.moods;
  if (moodMax > 0 && Array.isArray(moods) && moods.length > 0) {
    const known = moods.filter(mood => Number(read.moods[String(mood).trim()]) > 0).length;
    parts.push([0.15, clamp(known / moods.length)]);
  }

  const languageTotal = Object.values(read.languages).reduce((sum, value) => sum + Number(value || 0), 0);
  if (languageTotal > 0 && candidate.originalLanguage) {
    parts.push([0.1, clamp((Number(read.languages[candidate.originalLanguage]) || 0) / languageTotal * 2)]);
  }

  const mediaTotal = Object.values(read.mediaTypes).reduce((sum, value) => sum + Number(value || 0), 0);
  if (mediaTotal > 0 && candidate.mediaType) {
    const share = (Number(read.mediaTypes[candidate.mediaType]) || 0) / mediaTotal;
    parts.push([0.05, clamp((share - 0.5) * 2)]);
  }

  if (parts.length === 0) return 0;
  const total = parts.reduce((sum, [partWeight]) => sum + partWeight, 0);
  if (total <= 0) return 0;
  return clamp(parts.reduce((sum, [partWeight, value]) => sum + partWeight * value, 0) / total);
}

/** Bounded bonus personalisation adds to a computed score, never more than the weight. */
export function personalizationBonus(candidate, profile, weight = PERSONALIZATION_WEIGHT) {
  const strength = profileStrength(profile);
  if (strength <= 0) return 0;
  return clamp(weight) * strength * personalizationScore(candidate, profile);
}

/** Inspiration prompts built from the member's own tastes. */
const GENRE_PROMPTS = Object.freeze({
  28: ['Un film d’action nerveux et bien filmé', 'Une série d’action nerveuse et bien menée'],
  12: ['Une grande aventure qui fait voyager', 'Une série d’aventure qui fait voyager'],
  16: ['Un film d’animation pour tous les âges', 'Une série animée pour tous les âges'],
  35: ['Une comédie légère et vraiment drôle', 'Une série comique légère et vraiment drôle'],
  80: ['Un polar ou un film de braquage tendu', 'Une série policière ou un polar tendu'],
  99: ['Un documentaire qui marque', 'Un documentaire qui marque'],
  18: ['Un drame intense et humain', 'Une série dramatique intense et humaine'],
  10751: ['Un film à regarder en famille', 'Une série à regarder en famille'],
  14: ['Un film fantastique avec un bel univers', 'Une série fantastique avec un bel univers'],
  36: ['Un film historique captivant', 'Une série historique captivante'],
  27: ['Un film d’horreur qui fait vraiment peur', 'Une série d’horreur qui fait vraiment peur'],
  10402: ['Un film porté par la musique', 'Une série portée par la musique'],
  9648: ['Une enquête mystérieuse et prenante', 'Une série mystérieuse et prenante'],
  10749: ['Une romance juste et touchante', 'Une romance juste et touchante'],
  878: ['Un film de science-fiction ambitieux', 'Une série de science-fiction ambitieuse'],
  53: ['Un thriller tendu avec un vrai suspense', 'Une série thriller tendue et suspense'],
  10752: ['Un film de guerre marquant', 'Une série de guerre marquante'],
  37: ['Un western âpre et solitaire', 'Un western âpre et solitaire'],
  10759: ['Une série d’action et d’aventure', 'Une série d’action et d’aventure'],
  10765: ['Une série de science-fiction et de fantastique', 'Une série de science-fiction et de fantastique']
});

/**
 * Up to three prompts drawn from the strongest preferences, in the format the
 * member actually watches. Thin profiles keep the generic wording.
 */
export function suggestionsFor(profile, fallback = []) {
  const read = readPreferenceProfile(profile);
  if (profileStrength(read) <= 0) return Array.isArray(fallback) ? fallback : [];

  const mediaTotal = Object.values(read.mediaTypes).reduce((sum, value) => sum + Number(value || 0), 0);
  const seriesLeaning = mediaTotal > 0 && (Number(read.mediaTypes.tv) || 0) > (Number(read.mediaTypes.movie) || 0) * 1.5;

  const prompts = Object.entries(read.genres)
    .sort((a, b) => b[1] - a[1])
    .map(([genreId]) => GENRE_PROMPTS[Number(genreId)])
    .filter(Boolean)
    .map(phrasing => phrasing[seriesLeaning ? 1 : 0]);

  const unique = [...new Set(prompts)].slice(0, 3);
  return unique.length > 0 ? unique : (Array.isArray(fallback) ? fallback : []);
}
