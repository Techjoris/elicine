/**
 * Affinage des recherches par catégorie et lecture temporelle des mots
 * d'époque ajoutés par les suggestions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRefinementSuggestions, isBareCategoryQuery } from '../../src/search/refinementSuggestions.ts';
import { detectGenreKeys } from '../../src/search/genreIntent.ts';
import { extractHardCriteriaAndEntities } from '../../src/services/searchRouterService.ts';

test('a bare genre request receives refinement suggestions', () => {
  const refinements = buildRefinementSuggestions({
    query: "films d'action",
    mediaType: 'Films',
    locale: 'fr'
  });
  const ids = refinements.map((refinement) => refinement.id);
  assert.deepEqual(ids, ['era-recent', 'era-classics', 'era-90s', 'rating-best']);
  assert.equal(refinements[0].label, 'Plus récents');
  assert.equal(refinements[0].query, "films d'action récents");
  assert.ok(refinements.every((refinement) => refinement.query.startsWith("films d'action")));
});

test('a precise request receives no suggestion at all', () => {
  assert.deepEqual(buildRefinementSuggestions({ query: 'le film avec Tom Hanks de 1994' }), []);
  assert.deepEqual(buildRefinementSuggestions({ query: 'Inception' }), []);
});

test('suggestions are localized but the engine keeps the French wording', () => {
  const [first] = buildRefinementSuggestions({ query: 'horror movies', locale: 'en' });
  assert.equal(first.label, 'More recent');
  assert.equal(first.query, 'horror movies récents');
});

test('a refinement already present in the request is not proposed again', () => {
  const ids = buildRefinementSuggestions({
    query: "films d'action récents",
    mediaType: 'Films',
    locale: 'fr'
  }).map((refinement) => refinement.id);
  assert.ok(!ids.includes('era-recent'));
  assert.ok(ids.includes('era-classics'));
});

test('the format suggestion appears when the media type is known', () => {
  const asSeries = buildRefinementSuggestions({
    query: 'thrillers',
    mediaType: 'Films',
    locale: 'fr',
    max: 6
  }).find((refinement) => refinement.id === 'format-series');
  assert.ok(asSeries);
  assert.equal(asSeries.query, 'thrillers en série');
});

test('the genre lexicon reads French, plural and hyphenated forms', () => {
  assert.deepEqual(detectGenreKeys("films d'action"), ['action']);
  assert.deepEqual(detectGenreKeys('science-fiction'), ['scifi']);
  assert.deepEqual(detectGenreKeys('comédies romantiques'), ['comedy', 'romance']);
  assert.deepEqual(detectGenreKeys('séries policières'), ['crime']);
  assert.deepEqual(detectGenreKeys('un film avec Tom Hanks'), []);
});

test('the trailing era wording drives a real temporal constraint', () => {
  assert.equal(extractHardCriteriaAndEntities("films d'action récents").era, 'récents');
  assert.equal(extractHardCriteriaAndEntities('films anciens et classiques').era, 'classiques');
  assert.equal(extractHardCriteriaAndEntities("films d'action des années 90").era, 'années 90');
  assert.equal(extractHardCriteriaAndEntities("un film d'action").era, undefined);
});

test('an adjective qualifying a character never becomes an era', () => {
  assert.equal(extractHardCriteriaAndEntities('un film sur un ancien soldat').era, undefined);
  assert.equal(extractHardCriteriaAndEntities('un film avec une ancienne espionne').era, undefined);
});

test('only a request made of a category alone is gated before the search', () => {
  for (const query of [
    "films d'action",
    'je veux un film d’horreur',
    'comédies',
    'une série de science-fiction',
    'thriller',
    'des dessins animés'
  ]) {
    assert.equal(isBareCategoryQuery(query), true, query);
  }
});

test('a request that already carries a precision is never gated', () => {
  for (const query of [
    "film d'action avec Tom Cruise",
    'thriller psychologique',
    "films d'action récents",
    'comédie romantique à New York',
    'films coréens',
    'Inception'
  ]) {
    assert.equal(isBareCategoryQuery(query), false, query);
  }
});
