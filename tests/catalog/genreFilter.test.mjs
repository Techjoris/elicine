import test from 'node:test';
import assert from 'node:assert/strict';
import { GENRES, genreAppliesTo, genreIdFor, resolveGenreFilter } from '../../src/utils/catalogGenres.ts';

test('a movie genre filter sends the TMDB movie identifier', () => {
  const filter = resolveGenreFilter(['thriller'], 'movie');
  assert.deepEqual(filter.ids, [53]);
  assert.deepEqual(filter.labels, ['Thriller']);
  assert.deepEqual(filter.ignored, []);
});

test('a genre with no TV equivalent is ignored instead of leaking an unfiltered catalog', () => {
  const filter = resolveGenreFilter(['thriller'], 'tv');
  assert.deepEqual(filter.ids, [], 'aucun identifiant ne doit partir : TMDB ignorerait 53 et renverrait tout le catalogue');
  assert.deepEqual(filter.labels, []);
  assert.deepEqual(filter.ignored.map(genre => genre.key), ['thriller']);
});

test('every genre TMDB does not reference on TV is treated as unavailable', () => {
  for (const key of ['history', 'horror', 'music', 'romance', 'thriller']) {
    const genre = GENRES.find(option => option.key === key);
    assert.ok(genre, `${key} doit exister dans la liste`);
    assert.equal(genre.tv, null);
    assert.equal(genreAppliesTo(genre, 'tv'), false);
    assert.equal(resolveGenreFilter([key], 'tv').ids.length, 0);
    assert.equal(Number.isSafeInteger(genreIdFor(genre, 'movie')), true);
  }
});

test('the TV filter keeps only the applicable genres of a mixed selection', () => {
  const filter = resolveGenreFilter(['thriller', 'crime', 'horror', 'mystery'], 'tv');
  assert.deepEqual(filter.labels, ['Crime', 'Mystère']);
  assert.deepEqual(filter.ids, [80, 9648], 'les genres sont combines en OU avec leurs identifiants tele');
  assert.deepEqual(filter.ignored.map(genre => genre.key), ['thriller', 'horror']);
});

test('films keep the whole selection, so switching tabs never loses a genre', () => {
  const keys = ['thriller', 'horror', 'crime'];
  assert.deepEqual(resolveGenreFilter(keys, 'movie').ignored, []);
  assert.deepEqual(resolveGenreFilter(keys, 'tv').ignored.map(genre => genre.key), ['thriller', 'horror']);
  assert.deepEqual(resolveGenreFilter(keys, 'movie').ids, [53, 27, 80]);
});

test('sibling TV genres do not collide with their film identifiers', () => {
  assert.deepEqual(resolveGenreFilter(['action'], 'tv').ids, [10759]);
  assert.deepEqual(resolveGenreFilter(['action'], 'movie').ids, [28]);
  assert.deepEqual(resolveGenreFilter(['scifi'], 'tv').ids, [10765]);
  assert.deepEqual(resolveGenreFilter(['fantasy'], 'tv').ids, [10765]);
});

test('unknown keys and an empty selection never fabricate a filter', () => {
  assert.deepEqual(resolveGenreFilter([], 'movie').ids, []);
  assert.deepEqual(resolveGenreFilter(['inconnu'], 'movie'), { applied: [], ignored: [], ids: [], labels: [] });
});
