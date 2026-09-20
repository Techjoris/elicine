import { z } from 'zod';

/**
 * Shared Phase 1 runtime. JavaScript keeps Node handlers independent of TS loaders.
 * `movie` and `tv` are the only internal media-type values permitted for new code.
 */
export const canonicalMediaTypeSchema = z.enum(['movie', 'tv']);

export const sortPreferenceSchema = z.enum([
  'relevance',
  'popularity',
  'rating',
  'release_date'
]);

const MEDIA_TYPE_ALIASES = {
  film: 'movie',
  films: 'movie',
  movie: 'movie',
  movies: 'movie',
  serie: 'tv',
  series: 'tv',
  série: 'tv',
  séries: 'tv',
  show: 'tv',
  shows: 'tv',
  tv: 'tv',
  tvshow: 'tv',
  television: 'tv'
};

export function normalizeMediaType(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('mediaType must be a string, null, or undefined');
  const normalized = MEDIA_TYPE_ALIASES[value.trim().toLowerCase()];
  if (!normalized) throw new Error(`Unsupported mediaType: ${value}`);
  return normalized;
}

function normalizeStringList(value, label) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);

  const unique = new Map();
  for (const item of value) {
    if (typeof item !== 'string') throw new Error(`${label} must only contain strings`);
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, trimmed);
  }
  return [...unique.values()];
}

function normalizeLocaleList(value, label) {
  const items = normalizeStringList(value, label);
  const expression = label === 'languages' ? /^[a-z]{2,3}$/i : /^[a-z]{2}$/i;
  return items.map((item) => {
    if (!expression.test(item)) throw new Error(`${label} contains an invalid ISO code: ${item}`);
    return label === 'languages' ? item.toLowerCase() : item.toUpperCase();
  });
}

function normalizeOptionalNumber(value, label) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}


const canonicalIntentObjectSchema = z.object({
  mediaType: canonicalMediaTypeSchema.nullable(),
  genres: z.array(z.string()),
  moods: z.array(z.string()),
  themes: z.array(z.string()),
  keywords: z.array(z.string()),
  knownTitles: z.array(z.string()),
  excludedTitles: z.array(z.string()),
  excludedGenres: z.array(z.string()),
  yearMin: z.number().int().min(1888).max(2100).nullable(),
  yearMax: z.number().int().min(1888).max(2100).nullable(),
  languages: z.array(z.string().regex(/^[a-z]{2,3}$/)),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)),
  runtimeMin: z.number().nonnegative().max(1000).nullable(),
  runtimeMax: z.number().nonnegative().max(1000).nullable(),
  minRating: z.number().min(0).max(10).nullable(),
  adult: z.boolean().nullable(),
  sortPreference: sortPreferenceSchema.nullable()
}).superRefine((intent, context) => {
  if (intent.yearMin !== null && intent.yearMax !== null && intent.yearMin > intent.yearMax) {
    context.addIssue({ code: 'custom', path: ['yearMin'], message: 'yearMin cannot be greater than yearMax' });
  }
  if (intent.runtimeMin !== null && intent.runtimeMax !== null && intent.runtimeMin > intent.runtimeMax) {
    context.addIssue({ code: 'custom', path: ['runtimeMin'], message: 'runtimeMin cannot be greater than runtimeMax' });
  }
});

export const canonicalIntentSchema = canonicalIntentObjectSchema;

/**
 * Normalizes aliases and harmless empty values, then rejects malformed or
 * contradictory intent. The historical retrieval does not consume this contract.
 */
export function createCanonicalIntent(input = {}) {
  const normalized = {
    mediaType: normalizeMediaType(input.mediaType),
    genres: normalizeStringList(input.genres, 'genres'),
    moods: normalizeStringList(input.moods, 'moods'),
    themes: normalizeStringList(input.themes, 'themes'),
    keywords: normalizeStringList(input.keywords, 'keywords'),
    knownTitles: normalizeStringList(input.knownTitles, 'knownTitles'),
    excludedTitles: normalizeStringList(input.excludedTitles, 'excludedTitles'),
    excludedGenres: normalizeStringList(input.excludedGenres, 'excludedGenres'),
    yearMin: normalizeOptionalNumber(input.yearMin, 'yearMin'),
    yearMax: normalizeOptionalNumber(input.yearMax, 'yearMax'),
    languages: normalizeLocaleList(input.languages, 'languages'),
    countries: normalizeLocaleList(input.countries, 'countries'),
    runtimeMin: normalizeOptionalNumber(input.runtimeMin, 'runtimeMin'),
    runtimeMax: normalizeOptionalNumber(input.runtimeMax, 'runtimeMax'),
    minRating: normalizeOptionalNumber(input.minRating, 'minRating'),
    adult: input.adult === null || input.adult === undefined ? null : input.adult,
    sortPreference: input.sortPreference === null || input.sortPreference === undefined || input.sortPreference === ''
      ? null
      : input.sortPreference
  };

  return canonicalIntentSchema.parse(normalized);
}
