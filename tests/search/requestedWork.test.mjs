import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUESTED_WORK_THRESHOLD, characterSimilarity, detectRequestedTitles, isReferenceQuery,
  queryTitleTokens, titleQuerySimilarity
} from '../../src/search/requestedWork.js';
import { rankSearchCandidates } from '../../src/search/searchRanker.js';
import { toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';

const work = (title, mediaType = 'movie', tmdbId = 100, extra = {}) => ({
  inputTitle: title, canonicalTitle: title, originalTitle: title, mediaType, tmdbId,
  releaseYear: 2010, originalLanguage: 'en', genreIds: [878, 53], resolutionConfidence: 0.9, ...extra
});
const detected = (query, works) => detectRequestedTitles(query, works).map(entry => entry.canonicalTitle);

const row = (id, title, mediaType = 'movie', extra = {}) => ({ id, media_type: mediaType,
  ...(mediaType === 'tv' ? { name: title, first_air_date: '2008-01-01' } : { title, release_date: '2010-01-01' }),
  overview: 'A story.', genre_ids: [878, 53], vote_average: 8, vote_count: 10000,
  popularity: 60, poster_path: '/poster.jpg', ...extra });
const candidate = (rowValue, source, signals = {}) => toRetrievalCandidate(rowValue, source, signals);

test('a query that names a film asks for that film', () => {
  assert.deepEqual(detected('Inception', [work('Inception', 'movie', 27205)]), ['Inception']);
  assert.deepEqual(detected('inception', [work('Inception', 'movie', 27205)]), ['Inception']);
  assert.deepEqual(detected('Inception 2010', [work('Inception', 'movie', 27205)]), ['Inception']);
  assert.deepEqual(detected('le silence des agneaux', [work('Le Silence des Agneaux', 'movie', 274)]),
    ['Le Silence des Agneaux']);
});

test('a query that names a series asks for that series, with the same rule as a film', () => {
  assert.deepEqual(detected('Breaking Bad', [work('Breaking Bad', 'tv', 1396)]), ['Breaking Bad']);
  assert.deepEqual(detected('la série Breaking Bad', [work('Breaking Bad', 'tv', 1396)]), ['Breaking Bad']);
  const asFilm = detected('Inception', [work('Inception', 'movie', 27205)]);
  const asSeries = detected('Breaking Bad', [work('Breaking Bad', 'tv', 1396)]);
  assert.equal(asFilm.length, asSeries.length);
});

test('a mistyped or repaired title is still the requested work', () => {
  assert.deepEqual(detected('shutter iland', [work('Shutter Island', 'movie', 11324)]), ['Shutter Island']);
  assert.deepEqual(detected('interstllar', [work('Interstellar', 'movie', 157336)]), ['Interstellar']);
  assert.ok(titleQuerySimilarity('shutter iland', 'Shutter Island') >= REQUESTED_WORK_THRESHOLD);
});

test('a qualifying suffix stays an identification', () => {
  assert.deepEqual(detected('Inception de Christopher Nolan', [work('Inception', 'movie', 27205)]), ['Inception']);
  assert.deepEqual(detected('je veux regarder Inception avec ma femme', [work('Inception', 'movie', 27205)]),
    ['Inception']);
});

test('comparison grammar keeps the named work as a seed, never as the answer', () => {
  for (const query of ['film du même style que Shutter Island', 'un film comme Shutter Island',
    "des films dans l'esprit d'Inception", 'des films du genre Inception', 'des films type Inception',
    'des films dans la veine de Shutter Island', 'quelque chose comme Parasite',
    'Give me psychological thrillers like Se7en', 'je cherche un film dans le genre du Parrain']) {
    assert.equal(isReferenceQuery(query), true, query);
    assert.deepEqual(detected(query, [work('Shutter Island', 'movie', 11324)]), [], query);
  }
});

test('a description or a concept query never becomes an identification', () => {
  const works = [work('Inception', 'movie', 27205), work('Salt', 'movie', 27578),
    work('Breaking Bad', 'tv', 1396), work('Mindhunter', 'tv', 67744)];
  for (const query of ['ce film dans lequel Angelina Jolie joue le rôle d’une espionne russe',
    'le film de Leonardo DiCaprio dans lequel il voyage dans les rêves des gens',
    'la série où un professeur de chimie atteint d’un cancer commence à fabriquer de la drogue',
    'une série de guerre moderne avec des avions de combat',
    'un film de guerre moderne avec des avions de combat',
    'un thriller psychologique sombre sans meurtre ni enquête policière',
    'une série comme Mindhunter mais plus récente et avec davantage d’action',
    'films de Christopher Nolan', 'des films sur la mafia avec des personnages stratégiques']) {
    assert.deepEqual(detected(query, works), [], query);
  }
});

test('short words cannot collide by character similarity', () => {
  assert.deepEqual(detected('des films sur la route et l’errance', [work('Us', 'movie', 458156)]), []);
  assert.ok(characterSimilarity('Up', 'Us') < 0.6);
  assert.ok(characterSimilarity('Shutter Island', 'shutter iland') >= 0.9);
});

test('query tokens drop roles, articles and a trailing release year', () => {
  assert.deepEqual(queryTitleTokens('la série Breaking Bad 2008'), ['breaking', 'bad']);
  assert.deepEqual(queryTitleTokens('le film de Leonardo DiCaprio'), ['leonardo', 'dicaprio']);
});

test('the requested work outranks its own recommendations and similar titles', () => {
  const seed = work('Inception', 'movie', 27205);
  const intent = createCanonicalIntent({ mediaType: 'movie', genres: ['Science Fiction'],
    themes: ['shared dreams'], keywords: ['dream'] });
  const resolvedContext = { resolvedTitles: [seed], requestedTitles: [seed],
    unresolvedTitles: [], resolvedPeople: [], metrics: {} };
  const self = candidate(row(27205, 'Inception', 'movie',
    { overview: 'A thief enters shared dreams.', popularity: 40 }), 'tmdb_search');
  const recommendation = candidate(row(157336, 'Interstellar', 'movie',
    { overview: 'Space travel and dreams.', popularity: 140 }),
    'tmdb_recommendations', { seedTmdbId: 27205 });
  const similar = candidate(row(603, 'The Matrix', 'movie',
    { overview: 'A simulated reality.', popularity: 130 }), 'tmdb_similar', { seedTmdbId: 27205 });
  const ranked = rankSearchCandidates([recommendation, similar, self], intent, resolvedContext, { enabled: true });
  assert.equal(ranked[0].tmdbId, 27205);
  assert.equal(ranked[0].ranking.identifiedWorkScore, 1);
  assert.equal(ranked.find(entry => entry.tmdbId === 157336).ranking.identifiedWorkScore, 0);
  assert.ok(ranked[0].ranking.finalScore > ranked[1].ranking.finalScore + 0.15,
    `${ranked[0].ranking.finalScore} vs ${ranked[1].ranking.finalScore}`);
  assert.ok(ranked[0].ranking.matchScore > ranked[1].ranking.matchScore);
});

test('a comparison seed keeps the anti-monopoly zero', () => {
  const seed = work('Shutter Island', 'movie', 11324);
  const intent = createCanonicalIntent({ mediaType: 'movie', genres: ['Thriller'],
    themes: ['memory'], keywords: ['identity'] });
  const resolvedContext = { resolvedTitles: [seed], unresolvedTitles: [], resolvedPeople: [], metrics: {} };
  const self = candidate(row(11324, 'Shutter Island', 'movie', { popularity: 300 }), 'tmdb_search');
  const recommended = candidate(row(2001, 'Fractured Memory', 'movie',
    { overview: 'A dark psychological mystery about memory and identity.' }),
    'tmdb_recommendations', { seedTmdbId: 11324 });
  const ranked = rankSearchCandidates([self, recommended], intent, resolvedContext, { enabled: true });
  assert.ok(ranked.every(entry => entry.ranking.identifiedWorkScore === 0));
  assert.equal(ranked[0].tmdbId, 2001);
  assert.equal(ranked.find(entry => entry.tmdbId === 11324).ranking.referenceScore, 0);
});
