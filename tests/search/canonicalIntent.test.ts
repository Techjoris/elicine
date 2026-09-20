import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCanonicalIntent,
  normalizeMediaType
} from '../../src/types/canonicalIntent';

test('creates an empty canonical intent with deterministic defaults', () => {
  const intent = createCanonicalIntent();
  assert.deepEqual(intent, {
    mediaType: null,
    genres: [], moods: [], themes: [], keywords: [], knownTitles: [],
    excludedTitles: [], excludedGenres: [], yearMin: null, yearMax: null,
    languages: [], countries: [], runtimeMin: null, runtimeMax: null,
    minRating: null, adult: null, sortPreference: null
  });
});

test('normalizes all supported media-type aliases', () => {
  for (const alias of ['film', 'films', 'movie', 'movies']) assert.equal(normalizeMediaType(alias), 'movie');
  for (const alias of ['série', 'serie', 'series', 'show', 'tvshow', 'television']) assert.equal(normalizeMediaType(alias), 'tv');
  assert.equal(normalizeMediaType(null), null);
  assert.throws(() => normalizeMediaType('documentary'));
});

test('normalizes lists, locale codes, known titles, and optional filters', () => {
  const intent = createCanonicalIntent({
    mediaType: 'series',
    genres: [' Thriller ', 'thriller', '', 'Crime'],
    moods: ['dark', 'Dark'],
    themes: ['mafia'],
    keywords: ['strategy'],
    knownTitles: [' Dexter ', 'dexter', 'Se7en'],
    excludedTitles: ['Supernatural'],
    excludedGenres: ['Fantasy'],
    yearMin: 2000,
    yearMax: 2010,
    runtimeMin: 30,
    runtimeMax: 90,
    languages: ['FR', 'en'],
    countries: ['fr', 'US'],
    minRating: 7.5,
    adult: false,
    sortPreference: 'rating'
  });

  assert.equal(intent.mediaType, 'tv');
  assert.deepEqual(intent.genres, ['Thriller', 'Crime']);
  assert.deepEqual(intent.moods, ['dark']);
  assert.deepEqual(intent.knownTitles, ['Dexter', 'Se7en']);
  assert.deepEqual(intent.languages, ['fr', 'en']);
  assert.deepEqual(intent.countries, ['FR', 'US']);
  assert.equal(intent.yearMin, 2000);
  assert.equal(intent.runtimeMax, 90);
  assert.equal(intent.minRating, 7.5);
  assert.equal(intent.adult, false);
  assert.equal(intent.sortPreference, 'rating');
});

test('rejects malformed values and contradictory ranges deterministically', () => {
  assert.throws(() => createCanonicalIntent({ genres: 'thriller' }));
  assert.throws(() => createCanonicalIntent({ countries: ['France'] }));
  assert.throws(() => createCanonicalIntent({ minRating: Number.NaN }));
  assert.throws(() => createCanonicalIntent({ adult: 'false' }));
  assert.throws(() => createCanonicalIntent({ sortPreference: 'random' }));
  assert.throws(() => createCanonicalIntent({ yearMin: 2020, yearMax: 2010 }));
  assert.throws(() => createCanonicalIntent({ runtimeMin: 120, runtimeMax: 90 }));
});
