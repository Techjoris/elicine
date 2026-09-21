import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { createCanonicalIntentFromLegacy } from '../../src/search/canonicalIntentShadow.js';
import { buildVectorQueryText } from '../../src/search/vectorRetrieval.js';

test('no-LLM canonical fallback preserves discriminating query signals', () => {
  const interpreted = { provider: 'Algorithme Éliciné', media_type: 'movie', primary_genres: [],
    mood_tags: [], reference_titles: [] };
  const inception = createCanonicalIntentFromLegacy(interpreted,
    { userQuery: 'film de Leonardo DiCaprio où il voyage dans les rêves des autres' });
  const war = createCanonicalIntentFromLegacy(interpreted,
    { userQuery: 'film de guerre moderne avec des avions de combat' });
  const titanic = createCanonicalIntentFromLegacy(interpreted,
    { userQuery: 'Titanic avec Leonardo DiCaprio et Kate Winslet' });
  assert.ok(inception.keywords.some(keyword => /Leonardo DiCaprio/i.test(keyword)));
  assert.ok(inception.themes.includes('shared dreams'));
  assert.ok(titanic.keywords.includes('titanic'));
  assert.ok(war.genres.includes('War'));
  assert.ok(war.themes.includes('guerre moderne'));
  assert.ok(war.themes.includes('avions de combat'));
  assert.notEqual(buildVectorQueryText(inception), buildVectorQueryText(war));
  const rollback = createCanonicalIntentFromLegacy(interpreted,
    { userQuery: 'film de guerre moderne avec des avions de combat', recoverFallbackSignals: false });
  assert.deepEqual(rollback.genres, []);
  assert.deepEqual(rollback.keywords, []);
});

test('media type alone never creates a generic vector embedding', () => {
  assert.equal(buildVectorQueryText(createCanonicalIntent({ mediaType: 'movie' })), '');
  assert.equal(buildVectorQueryText(createCanonicalIntent({ mediaType: 'tv' })), '');
});
