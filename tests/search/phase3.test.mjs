import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANONICAL_SEARCH_ENGINE_FLAG,
  isCanonicalSearchEngineEnabled,
  orchestrateSearch
} from '../../src/search/searchOrchestrator.js';

const canonicalInput = {
  media_type: 'movie',
  primary_genres: [' Thriller ', 'thriller'],
  mood_tags: ['Dark'],
  reference_titles: ['Gone Girl'],
  explicit_themes: ['revenge'],
  keywords: ['detective'],
  excluded_titles: ['Se7en'],
  excluded_genres: ['Fantasy'],
  year_min: 2000,
  year_max: 2010,
  languages: ['EN'],
  countries: ['us'],
  runtime_min: 80,
  runtime_max: 120,
  min_rating: 7,
  adult: false,
  sort_preference: 'rating',
  recommended_titles: [{ title: 'Candidate', type: 'movie' }],
  matches: [{ title: 'Candidate' }],
  themes: ['legacy mood alias']
};

test('feature flag is server-only and canonical is enabled by default', () => {
  assert.equal(CANONICAL_SEARCH_ENGINE_FLAG, 'CANONICAL_SEARCH_ENGINE_ENABLED');
  assert.equal(isCanonicalSearchEngineEnabled({}), true);
  assert.equal(isCanonicalSearchEngineEnabled({ [CANONICAL_SEARCH_ENGINE_FLAG]: 'TRUE' }), true);
  assert.equal(isCanonicalSearchEngineEnabled({ [CANONICAL_SEARCH_ENGINE_FLAG]: 'false' }), false);
});

test('legacy path leaves historical interpretation untouched', () => {
  const telemetry = {};
  const result = orchestrateSearch({
    interpreted: canonicalInput, cleanQuery: 'comme Gone Girl', telemetry,
    env: { [CANONICAL_SEARCH_ENGINE_FLAG]: 'false' }
  });
  assert.equal(result.path, 'legacy');
  assert.equal(result.interpreted, canonicalInput);
  assert.equal(result.canonicalIntent, null);
  assert.equal(telemetry.searchEnginePath, 'legacy');
  assert.equal(telemetry.orchestrationSucceeded, null);
  assert.equal(telemetry.orchestrationFallbackToLegacy, false);
  assert.equal(telemetry.orchestrationError, null);
  assert.equal(telemetry.canonicalIntentValid, true);
});

test('canonical path passes a validated CanonicalIntent and keeps candidate hints', () => {
  const telemetry = {};
  const result = orchestrateSearch({
    interpreted: canonicalInput, cleanQuery: 'un thriller comme Gone Girl', telemetry,
    env: { [CANONICAL_SEARCH_ENGINE_FLAG]: 'true' }
  });
  assert.equal(result.path, 'canonical');
  assert.equal(result.canonicalIntent.mediaType, 'movie');
  assert.deepEqual(result.canonicalIntent.genres, ['Thriller']);
  assert.deepEqual(result.canonicalIntent.knownTitles, ['Gone Girl']);
  assert.deepEqual(result.interpreted.primary_genres, ['Thriller']);
  assert.deepEqual(result.interpreted.mood_tags, ['Dark']);
  assert.equal(result.interpreted.recommended_titles, canonicalInput.recommended_titles);
  assert.equal(result.interpreted.matches, canonicalInput.matches);
  assert.deepEqual(telemetry, {
    canonicalIntentGenerated: true, canonicalIntentValid: true,
    searchEnginePath: 'canonical', orchestrationSucceeded: true,
    orchestrationFallbackToLegacy: false, orchestrationError: null
  });
});

for (const [label, field, value] of [
  ['tv', 'media_type', 'tv'], ['empty intent', 'primary_genres', []],
  ['genres', 'primary_genres', ['Crime']], ['moods', 'mood_tags', ['tense']],
  ['themes', 'explicit_themes', ['revenge']], ['keywords', 'keywords', ['detective']],
  ['excluded titles', 'excluded_titles', ['Se7en']], ['excluded genres', 'excluded_genres', ['Fantasy']],
  ['year min', 'year_min', 2000], ['year max', 'year_max', 2010],
  ['languages', 'languages', ['fr']], ['countries', 'countries', ['FR']],
  ['runtime min', 'runtime_min', 60], ['runtime max', 'runtime_max', 180],
  ['rating', 'min_rating', 8], ['adult', 'adult', true],
  ['sort', 'sort_preference', 'popularity']
]) {
  test('canonical intent accepts ' + label, () => {
    const interpreted = { ...canonicalInput, [field]: value };
    const result = orchestrateSearch({
      interpreted, cleanQuery: 'Gone Girl',
      env: { [CANONICAL_SEARCH_ENGINE_FLAG]: 'true' }
    });
    assert.equal(result.path, 'canonical');
  });
}

test('canonical failure falls back to the unchanged legacy input without provider retries', () => {
  const telemetry = {};
  let calls = 0;
  const result = orchestrateSearch({
    interpreted: canonicalInput, cleanQuery: 'query', telemetry,
    env: { [CANONICAL_SEARCH_ENGINE_FLAG]: 'true' },
    createIntent() { calls += 1; throw new Error('provider data'); }
  });
  assert.equal(calls, 1);
  assert.equal(result.path, 'legacy');
  assert.equal(result.interpreted, canonicalInput);
  assert.equal(telemetry.searchEnginePath, 'legacy');
  assert.equal(telemetry.orchestrationSucceeded, null);
  assert.equal(telemetry.orchestrationFallbackToLegacy, true);
  assert.equal(telemetry.orchestrationError, 'CANONICAL_ORCHESTRATION_FAILED');
  assert.equal(telemetry.canonicalIntentError, 'CANONICAL_ORCHESTRATION_FAILED');
});

test('malformed legacy output follows the deterministic canonical fallback', () => {
  const result = orchestrateSearch({
    interpreted: { ...canonicalInput, media_type: 'documentary' },
    cleanQuery: 'query', telemetry: {},
    env: { [CANONICAL_SEARCH_ENGINE_FLAG]: 'true' }
  });
  assert.equal(result.path, 'legacy');
});
