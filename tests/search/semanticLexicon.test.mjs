/**
 * Bilingual concept equivalence and its specificity guard.
 *
 * The semantic interpreter writes concepts in English while the catalogue is
 * fetched in French, so the ranking must recognise a concept through its
 * translations. It must not, however, recognise it through a broader wording:
 * widening the ask is what let a derivative candidate outscore the work the
 * query actually described. These tests pin both halves of that rule, on films
 * and on series alike.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { conceptVariants } from '../../src/search/semanticLexicon.js';
import { rankSearchCandidates, scoreSearchCandidate } from '../../src/search/searchRanker.js';
import { toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';

const intent = input => createCanonicalIntent(input);
const context = (extra = {}) => ({ resolvedTitles: [], resolvedPeople: [], unresolvedTitles: [],
  metrics: {}, ...extra });

const film = (id, title, extra = {}) => toRetrievalCandidate({ id, title, original_title: title,
  overview: 'A story.', genre_ids: [53], vote_average: 7, vote_count: 1000, popularity: 20,
  release_date: '2019-01-01', original_language: 'en', ...extra },
  extra.retrievalSource || 'tmdb_discover', extra.signal || {});

const series = (id, title, extra = {}) => toRetrievalCandidate({ id, name: title, original_name: title,
  overview: 'A story.', genre_ids: [10768], vote_average: 7, vote_count: 1000, popularity: 20,
  first_air_date: '2019-01-01', original_language: 'en', ...extra },
  extra.retrievalSource || 'tmdb_discover', extra.signal || {});

test('equivalence never broadens a concept to a more general wording', () => {
  const precise = conceptVariants('shared dreams');
  assert.ok(precise.includes('reves partages'), precise.join(' | '));
  assert.ok(!precise.includes('dreams'), precise.join(' | '));
  const simple = conceptVariants('dreams');
  assert.ok(simple.includes('reves'), simple.join(' | '));
  assert.ok(!simple.includes('shared dreams'), simple.join(' | '));
});

test('an unknown concept is its own only wording', () => {
  assert.deepEqual(conceptVariants('gravitational lensing'), ['gravitational lensing']);
  assert.deepEqual(conceptVariants(''), []);
});

test('a concept is understood in the catalogue language, in both directions', () => {
  const frenchOverview = film(1, 'Neutral', { overview: 'Un thriller onirique sur les reves et l inconscient.' });
  const englishOverview = film(2, 'Neutral', { overview: 'A thriller about dreams and the unconscious mind.' });
  const inEnglish = scoreSearchCandidate(frenchOverview, intent({ mediaType: 'movie', themes: ['dreams'] }), context());
  const inFrench = scoreSearchCandidate(englishOverview, intent({ mediaType: 'movie', themes: ['reves'] }), context());
  assert.ok(inEnglish.themeScore > 0.9, `theme=${inEnglish.themeScore}`);
  assert.ok(inFrench.themeScore > 0.9, `theme=${inFrench.themeScore}`);
});

test('a broad overview cannot answer a more precise concept', () => {
  const broadOverview = film(1, 'Neutral', { overview: 'A story about dreams.' });
  const precise = scoreSearchCandidate(broadOverview,
    intent({ mediaType: 'movie', themes: ['shared dreams'] }), context()).themeScore;
  const simple = scoreSearchCandidate(broadOverview,
    intent({ mediaType: 'movie', themes: ['dreams'] }), context()).themeScore;
  assert.ok(simple > precise, `${simple} vs ${precise}`);
  assert.ok(precise <= 0.5, `precise=${precise}`);
});

test('a military-aviation concept is not answered by a plain war overview', () => {
  const war = film(1, 'Neutral', { overview: 'Une fresque historique sur la guerre et ses soldats.' });
  const score = scoreSearchCandidate(war,
    intent({ mediaType: 'movie', themes: ['aviation militaire'] }), context()).themeScore;
  assert.equal(score, 0);
  assert.ok(!conceptVariants('aviation militaire').includes('guerre'));
});

test('a described film reached through a person credit outranks a title echoing the concept', () => {
  const described = film(27205, 'Described', {
    overview: 'Il s introduit dans les reves partages et le subconscient pour y derober des secrets.',
    vote_average: 8.4, vote_count: 35000, popularity: 90,
    retrievalSource: 'tmdb_person_credits', signal: { personTmdbId: 6193 } });
  const echo = film(999, 'Dreams', { overview: 'A dream heist.', popularity: 400 });
  const people = [{ tmdbId: 6193, name: 'Leonardo DiCaprio', inputName: 'leonardo dicaprio',
    resolutionConfidence: 0.95 }];
  const ranked = rankSearchCandidates([echo, described], intent({ mediaType: 'movie',
    themes: ['shared dreams'], keywords: ['subconscious'] }), context({ resolvedPeople: people }),
  { enabled: true });
  assert.equal(ranked[0].tmdbId, 27205);
  assert.ok(ranked[0].ranking.entityScore >= 0.9, `entity=${ranked[0].ranking.entityScore}`);
});

test('a named work is never displaced by a candidate that matches every concept', () => {
  const seed = { tmdbId: 7, mediaType: 'movie', canonicalTitle: 'Seed', originalTitle: 'Seed',
    inputTitle: 'Seed', genreIds: [53] };
  const described = film(7, 'Seed', { overview: 'Il explore les reves partages et le subconscient.',
    popularity: 25, retrievalSource: 'tmdb_search' });
  const hijack = film(8, 'Hijack', { overview: 'Un thriller sur les reves partages et le subconscient.',
    vote_average: 8.8, vote_count: 40000, popularity: 900,
    retrievalSource: 'tmdb_recommendations', signal: { seedTmdbId: 7 } });
  const resolved = { resolvedTitles: [seed], requestedTitles: [seed], unresolvedTitles: [],
    resolvedPeople: [], metrics: {} };
  const ranked = rankSearchCandidates([hijack, described], intent({ mediaType: 'movie',
    themes: ['shared dreams'], keywords: ['subconscious'] }), resolved, { enabled: true });
  assert.equal(ranked[0].tmdbId, 7);
  assert.equal(ranked[0].ranking.identifiedWorkScore, 1);
  assert.ok(ranked[0].ranking.finalScore > ranked[1].ranking.finalScore,
    `${ranked[0].ranking.finalScore} vs ${ranked[1].ranking.finalScore}`);
});

test('a described aviation series outranks a generic war series in the catalogue language', () => {
  const described = series(1, 'Neutral', { genre_ids: [10768], popularity: 30,
    overview: 'Une unite de pilotes de chasse mene une guerre moderne faite de missions aeriennes.',
    retrievalSource: 'supabase_vector', signal: { sourceScore: 0.92 } });
  const generic = series(2, 'Neutral', { genre_ids: [10768], popularity: 600,
    overview: 'Un drame historique sur la guerre.' });
  const canonical = intent({ mediaType: 'tv', genres: ['War'],
    themes: ['guerre moderne', 'aviation militaire', 'avions de combat'] });
  const ranked = rankSearchCandidates([generic, described], canonical, context(), { enabled: true });
  assert.equal(ranked[0].tmdbId, 1);
});

test('a spy description identified through its lead is not displaced by a popular title', () => {
  const described = film(27578, 'Described', { genre_ids: [28, 53], popularity: 45,
    overview: 'Une espionne russe accusee de trahison doit prouver son innocence.',
    retrievalSource: 'tmdb_person_credits', signal: { personTmdbId: 11701 } });
  const popular = film(424, 'Unrelated', { genre_ids: [18], popularity: 800,
    overview: 'Un drame familial.' });
  const people = [{ tmdbId: 11701, name: 'Angelina Jolie', inputName: 'angelina jolie',
    resolutionConfidence: 0.92 }];
  const ranked = rankSearchCandidates([popular, described], intent({ mediaType: 'movie',
    themes: ['russian spy'], keywords: ['espionage'] }), context({ resolvedPeople: people }),
  { enabled: true });
  assert.equal(ranked[0].tmdbId, 27578);
});