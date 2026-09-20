import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSearchIntent } from '../../src/search/normalizeSearchIntent.js';
import { adaptLegacySearchIntent } from '../../src/search/legacyIntentAdapter.js';
import { generateCanonicalIntentShadow } from '../../src/search/canonicalIntentShadow.js';
import { canonicalIntentSchema } from '../../src/types/canonicalIntent.runtime.js';
import { extractMatchesFromJson } from '../../api/search.js';

for (const [input, expected] of [
  ['film', 'movie'], ['films', 'movie'], ['movie', 'movie'], [' Movies ', 'movie'],
  ['serie', 'tv'], ['série', 'tv'], ['series', 'tv'], ['séries', 'tv'],
  ['show', 'tv'], ['shows', 'tv'], ['tv', 'tv'], ['tvshow', 'tv'], ['television', 'tv'],
  [null, null], ['', null]
]) {
  test('normalizer mediaType: ' + JSON.stringify(input), () => {
    assert.equal(normalizeSearchIntent({ mediaType: input }).mediaType, expected);
  });
}

for (const field of [
  'genres', 'moods', 'themes', 'keywords', 'knownTitles', 'excludedTitles', 'excludedGenres'
]) {
  test('normalizer cleans and deduplicates ' + field, () => {
    const input = { [field]: ['  Gone   Girl ', 'gone girl', '', ' \n ', 'Crime'] };
    const before = structuredClone(input);
    assert.deepEqual(normalizeSearchIntent(input)[field], ['Gone Girl', 'Crime']);
    assert.deepEqual(input, before);
    for (const value of [null, undefined, []]) {
      assert.deepEqual(normalizeSearchIntent({ [field]: value })[field], []);
    }
    for (const value of ['not an array', [1], [null], {}]) {
      assert.throws(() => normalizeSearchIntent({ [field]: value }));
    }
  });
}

for (const [field, value] of [
  ['yearMin', 1888], ['yearMax', 2100], ['runtimeMin', 0],
  ['runtimeMax', 1000], ['minRating', 7.5], ['adult', false], ['adult', true],
  ['sortPreference', 'rating'], ['sortPreference', 'release_date'],
  ['sortPreference', 'popularity'], ['sortPreference', 'relevance']
]) {
  test('normalizer preserves ' + field + '=' + value, () => {
    assert.equal(normalizeSearchIntent({ [field]: value })[field], value);
  });
}

test('normalizer defaults, locales, complete intent, and idempotence', () => {
  const empty = normalizeSearchIntent();
  assert.deepEqual(normalizeSearchIntent({}), empty);
  assert.deepEqual(normalizeSearchIntent(Object.fromEntries(Object.keys(empty).map(k => [k, null]))), empty);
  assert.deepEqual(normalizeSearchIntent({ unknown: 'discarded' }), empty);
  const complete = normalizeSearchIntent({
    mediaType: 'film', genres: ['Thriller', 'Drama'], moods: ['dark', 'tense'],
    themes: ['loss', 'revenge'], keywords: ['detective'],
    knownTitles: ['Gone Girl'], excludedTitles: ['Se7en'], excludedGenres: ['Fantasy'],
    yearMin: 2000, yearMax: 2010, runtimeMin: 80, runtimeMax: 120,
    minRating: 8, languages: [' FR ', 'fr', 'ENG'], countries: [' fr ', 'FR', 'us'],
    adult: false, sortPreference: 'relevance'
  });
  assert.deepEqual(complete.languages, ['fr', 'eng']);
  assert.deepEqual(complete.countries, ['FR', 'US']);
  assert.deepEqual(normalizeSearchIntent(complete), complete);
  assert.ok(canonicalIntentSchema.safeParse(complete).success);
});

test('normalizer rejects malformed roots and unknown enums', () => {
  for (const input of [null, [], 'query', 1, true, new Date()]) {
    assert.throws(() => normalizeSearchIntent(input));
  }
  for (const input of [
    { mediaType: 'documentary' }, { mediaType: '__proto__' }, { mediaType: 1 },
    { adult: 'false' }, { sortPreference: 'random' },
    { languages: ['fr-FR'] }, { countries: ['France'] }
  ]) assert.throws(() => normalizeSearchIntent(input));
});

test('normalizer rejects invalid numbers and contradictory ranges per Phase 1', () => {
  for (const field of ['yearMin', 'yearMax', 'runtimeMin', 'runtimeMax', 'minRating']) {
    for (const value of [NaN, Infinity, -Infinity, '2000', {}, true, -1]) {
      assert.throws(() => normalizeSearchIntent({ [field]: value }));
    }
    assert.equal(normalizeSearchIntent({ [field]: '' })[field], null);
  }
  for (const input of [
    { yearMin: 1887 }, { yearMax: 2101 }, { yearMin: 2000.5 },
    { runtimeMax: 1001 }, { minRating: 10.1 },
    { yearMin: 2020, yearMax: 2010 }, { runtimeMin: 120, runtimeMax: 90 }
  ]) assert.throws(() => normalizeSearchIntent(input));
});

test('adapter isolates all legacy field mappings', () => {
  const legacy = {
    media_type: 'film', primary_genres: ['Thriller'], mood_tags: ['dark'],
    explicit_themes: ['revenge'], keywords: ['detective'], reference_titles: ['Gone Girl'],
    excluded_titles: ['Se7en'], excluded_genres: ['Fantasy'],
    year_min: 2000, year_max: 2020, runtime_min: 80, runtime_max: 120,
    languages: ['EN'], countries: ['us'], min_rating: 7, adult: false, sort_preference: 'rating'
  };
  const before = structuredClone(legacy);
  const result = normalizeSearchIntent(adaptLegacySearchIntent(legacy, { userQuery: 'un thriller comme Gone Girl' }));
  assert.deepEqual(result, normalizeSearchIntent({
    mediaType: 'film', genres: ['Thriller'], moods: ['dark'], themes: ['revenge'],
    keywords: ['detective'], knownTitles: ['Gone Girl'], excludedTitles: ['Se7en'],
    excludedGenres: ['Fantasy'], yearMin: 2000, yearMax: 2020, runtimeMin: 80,
    runtimeMax: 120, languages: ['EN'], countries: ['us'], minRating: 7,
    adult: false, sortPreference: 'rating'
  }));
  assert.deepEqual(legacy, before);
  assert.equal(normalizeSearchIntent(legacy).mediaType, null); // no provider leakage
  assert.equal(normalizeSearchIntent(adaptLegacySearchIntent({ media_type: 'all' })).mediaType, null);
});

test('adapter never promotes legacy recommendation/keyword/theme aliases into facts', () => {
  const parsed = extractMatchesFromJson(JSON.stringify({
    media_type: 'movie', mood_tags: ['dark'], clean_query: 'thriller',
    recommended_titles: [{ title: 'Gone Girl' }, { title: 'Her' }]
  }));
  assert.deepEqual(parsed.reference_titles, ['Gone Girl', 'Her']);
  const result = normalizeSearchIntent(adaptLegacySearchIntent(parsed, { userQuery: 'un thriller comme Gone Girl, cher ami' }));
  assert.deepEqual(result.knownTitles, ['Gone Girl']); // Her is not inside "cher"
  assert.deepEqual(result.themes, []);
  assert.deepEqual(result.keywords, []);
  assert.deepEqual(normalizeSearchIntent(adaptLegacySearchIntent(parsed)).knownTitles, []);
  assert.deepEqual(normalizeSearchIntent(adaptLegacySearchIntent({
    reference_titles: ['Interstellar']
  }, { userQuery: 'interstllar' })).knownTitles, []); // no guessed correction
});

test('adapter rejects malformed interpretation and reference structures', () => {
  for (const input of [null, [], 'raw provider text', { reference_titles: [3] }]) {
    assert.throws(() => adaptLegacySearchIntent(input));
  }
});

test('shadow succeeds, reports normalization, and stores no intent/query', () => {
  const telemetry = {};
  const intent = generateCanonicalIntentShadow({
    media_type: ' Films ', reference_titles: ['Gone Girl']
  }, { userQuery: 'comme Gone Girl' }, telemetry);
  assert.equal(intent.mediaType, 'movie');
  assert.deepEqual(telemetry, {
    canonicalIntentGenerated: true, canonicalIntentValid: true,
    canonicalIntentNormalizationApplied: true, canonicalIntentError: null
  });
  assert.equal(JSON.stringify(telemetry).includes('Gone Girl'), false);
});

test('shadow reports no normalization for a fully canonical adapted input', () => {
  const t = {};
  generateCanonicalIntentShadow({
    media_type: null, primary_genres: [], mood_tags: [], reference_titles: [],
    explicit_themes: [], keywords: [], excluded_titles: [], excluded_genres: [],
    year_min: null, year_max: null, languages: [], countries: [],
    runtime_min: null, runtime_max: null, min_rating: null, adult: null, sort_preference: null
  }, {}, t);
  assert.equal(t.canonicalIntentNormalizationApplied, false);
});

test('shadow failures are isolated and use fixed, non-sensitive error codes', () => {
  for (const [input, code] of [
    [null, 'LEGACY_INTENT_ADAPTER_FAILED'],
    [{ media_type: 'SECRET user data' }, 'CANONICAL_INTENT_VALIDATION_FAILED']
  ]) {
    const t = {};
    assert.equal(generateCanonicalIntentShadow(input, {}, t), null);
    assert.equal(t.canonicalIntentGenerated, false);
    assert.equal(t.canonicalIntentValid, false);
    assert.equal(t.canonicalIntentNormalizationApplied, null);
    assert.equal(t.canonicalIntentError, code);
    assert.equal(JSON.stringify(t).includes('SECRET'), false);
  }
  assert.doesNotThrow(() => generateCanonicalIntentShadow({}, {}, Object.freeze({})));
});
