/**
 * Compréhension des plateformes dans la requête naturelle.
 * « un film d'horreur sur Netflix » doit isoler la plateforme et rendre la
 * requête sémantique propre, sans confondre « max » ou « prime » isolés avec
 * une plateforme.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatformIntent } from '../../src/search/platformIntent.ts';

test('a platform cited with a connector is detected and stripped', () => {
  const intent = detectPlatformIntent("je veux un film d'horreur sur netflix");
  assert.ok(intent);
  assert.equal(intent.id, 'netflix');
  assert.equal(intent.label, 'Netflix');
  assert.equal(intent.providerId, 8);
  assert.equal(intent.cleanQuery, "je veux un film d'horreur");
});

test('the detection is case-insensitive and tolerant to "disponible sur"', () => {
  const intent = detectPlatformIntent('une série policière disponible sur NETFLIX');
  assert.ok(intent);
  assert.equal(intent.cleanQuery, 'une série policière');
});

test('every supported platform maps to its TMDB provider identifier', () => {
  const cases = [
    ['un film sur Disney+', 'disney', 337],
    ['un film sur disney plus', 'disney', 337],
    ['une série sur prime video', 'prime', 119],
    ['un film amazon prime', 'prime', 119],
    ['un film sur canal+', 'canal', 381],
    ['un film sur apple tv', 'apple', 350],
    ['un film sur paramount+', 'paramount', 531],
    ['un film hbo max', 'max', 1899],
    ['un film sur max', 'max', 1899]
  ];
  for (const [query, id, providerId] of cases) {
    const intent = detectPlatformIntent(query);
    assert.ok(intent, `non détecté : ${query}`);
    assert.equal(intent.id, id, query);
    assert.equal(intent.providerId, providerId, query);
  }
});

test('the cleaned query keeps the useful words and drops the platform mention', () => {
  assert.equal(
    detectPlatformIntent("je veux un film de science-fiction sur netflix").cleanQuery,
    'je veux un film de science-fiction'
  );
  assert.equal(detectPlatformIntent('un film netflix').cleanQuery, 'un film');
});

test('ambiguous words are never mistaken for a platform', () => {
  for (const query of [
    "un film d'action",
    'un film max',
    'un bon film',
    'une prime à la motivation',
    'le canal de Suez',
    'un film sur la mafia'
  ]) {
    assert.equal(detectPlatformIntent(query), null, query);
  }
});

test('a query made only of the platform keeps the intent but exposes an empty query', () => {
  const intent = detectPlatformIntent('netflix');
  assert.ok(intent);
  assert.equal(intent.cleanQuery, '');
});
