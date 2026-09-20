import type { z } from 'zod';
import * as runtime from './canonicalIntent.runtime.js';

// Single runtime implementation shared with plain-JavaScript server handlers.
export type CanonicalMediaType = 'movie' | 'tv';
export type SortPreference = 'relevance' | 'popularity' | 'rating' | 'release_date';

export interface CanonicalIntent {
  mediaType: CanonicalMediaType | null;
  genres: string[];
  moods: string[];
  themes: string[];
  keywords: string[];
  knownTitles: string[];
  excludedTitles: string[];
  excludedGenres: string[];
  yearMin: number | null;
  yearMax: number | null;
  languages: string[];
  countries: string[];
  runtimeMin: number | null;
  runtimeMax: number | null;
  minRating: number | null;
  adult: boolean | null;
  sortPreference: SortPreference | null;
}

export const canonicalMediaTypeSchema: z.ZodType<CanonicalMediaType> = runtime.canonicalMediaTypeSchema;
export const sortPreferenceSchema: z.ZodType<SortPreference> = runtime.sortPreferenceSchema;
export const canonicalIntentSchema: z.ZodType<CanonicalIntent> = runtime.canonicalIntentSchema;
export const normalizeMediaType: (value: unknown) => CanonicalMediaType | null = runtime.normalizeMediaType;
export const createCanonicalIntent: (input?: Record<string, unknown>) => CanonicalIntent = runtime.createCanonicalIntent;
