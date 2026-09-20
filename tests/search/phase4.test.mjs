import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTITY_RESOLUTION_LIMIT,
  ENTITY_RESOLUTION_THRESHOLD,
  normalizeEntityTitle,
  resolveKnownTitles,
  scoreEntityCandidate
} from '../../src/search/entityResolver.js';
import { orchestrateSearch, CANONICAL_SEARCH_ENGINE_FLAG } from '../../src/search/searchOrchestrator.js';
import { fetchExactTmdbCandidate, searchTmdbCandidates } from '../../api/search.js';

const movie = (id, title, extra = {}) => ({
  id, title, original_title: extra.original_title || title,
  release_date: extra.release_date || '2014-01-01',
  original_language: extra.original_language || 'en', genre_ids: extra.genre_ids || [18],
  popularity: extra.popularity || 10, vote_count: extra.vote_count || 100,
  poster_path: '/fixture.jpg', media_type: 'movie'
});
const tv = (id, name, extra = {}) => ({
  id, name, original_name: extra.original_name || name,
  first_air_date: extra.first_air_date || '2013-01-01',
  original_language: extra.original_language || 'en', genre_ids: extra.genre_ids || [80],
  popularity: extra.popularity || 10, vote_count: extra.vote_count || 100,
  poster_path: '/fixture.jpg', media_type: 'tv'
});

test('title comparison normalization preserves the source value', () => {
  assert.equal(normalizeEntityTitle("  L'été  d'  Amélie ! "), 'l ete d amelie');
  assert.equal(normalizeEntityTitle('The   Office'), 'the office');
});

test('empty knownTitles performs zero provider calls', async () => {
  let calls = 0;
  const context = await resolveKnownTitles({ knownTitles: [] }, {
    searchCandidates: async () => { calls += 1; return []; }
  });
  assert.equal(calls, 0);
  assert.deepEqual(context.resolvedTitles, []);
  assert.deepEqual(context.unresolvedTitles, []);
  assert.equal(context.metrics.entityResolutionAttempted, false);
});

test('resolves exact movie, original title, accents, and metadata', async () => {
  const context = await resolveKnownTitles({
    mediaType: 'movie', knownTitles: ['Gone Girl', 'Amélie']
  }, {
    searchCandidates: async title => title === 'Gone Girl'
      ? [movie(1, 'Gone Girl', { original_title: 'Gone Girl', original_language: 'en', genre_ids: [53] })]
      : [movie(2, 'Le Fabuleux Destin d’Amélie Poulain', { original_title: 'Amélie' })]
  });
  assert.equal(context.resolvedTitles.length, 2);
  assert.deepEqual(context.resolvedTitles.map(item => item.tmdbId), [1, 2]);
  assert.equal(context.resolvedTitles[0].resolutionConfidence >= ENTITY_RESOLUTION_THRESHOLD, true);
  assert.equal(context.resolvedTitles[1].originalLanguage, 'en');
  assert.deepEqual(context.resolvedTitles[0].genreIds, [53]);
});

test('media type selects the expected The Office candidate', async () => {
  const candidates = [movie(10, 'The Office'), tv(11, 'The Office')];
  const result = await resolveKnownTitles({ mediaType: 'tv', knownTitles: ['The Office'] }, {
    searchCandidates: async () => candidates
  });
  assert.deepEqual(result.resolvedTitles.map(item => item.tmdbId), [11]);
  assert.equal(result.resolvedTitles[0].mediaType, 'tv');
});

test('null media type accepts both types but does not choose ambiguous exact matches', async () => {
  const result = await resolveKnownTitles({ mediaType: null, knownTitles: ['Crash'] }, {
    searchCandidates: async () => [movie(20, 'Crash'), movie(21, 'Crash')]
  });
  assert.deepEqual(result.resolvedTitles, []);
  assert.deepEqual(result.unresolvedTitles, ['Crash']);
  assert.equal(result.metrics.entityResolutionAmbiguousCount, 1);
});

test('original title and case/accents resolve deterministically', async () => {
  const result = await resolveKnownTitles({ mediaType: 'movie', knownTitles: ['parasite'] }, {
    searchCandidates: async () => [movie(30, 'Parasite', { original_title: 'Gisaengchung', original_language: 'ko' })]
  });
  assert.equal(result.resolvedTitles[0].tmdbId, 30);
  assert.equal(scoreEntityCandidate('Gisaengchung', movie(30, 'Parasite', { original_title: 'Gisaengchung' })), 0.86);
});

test('weak, absent, timeout, and provider errors remain unresolved', async () => {
  const result = await resolveKnownTitles({
    mediaType: 'movie', knownTitles: ['Missing', 'Timeout', 'Broken', 'Weak']
  }, {
    searchCandidates: async title => {
      if (title === 'Timeout' || title === 'Broken') throw new Error('provider');
      if (title === 'Weak') return [movie(40, 'Completely Different')];
      return [];
    }
  });
  assert.deepEqual(result.resolvedTitles, []);
  assert.deepEqual(result.unresolvedTitles, ['Missing', 'Timeout', 'Broken', 'Weak']);
  assert.equal(result.metrics.entityResolutionErrorCount, 2);
});

test('duplicates are bounded, deduplicated by media type and TMDB ID', async () => {
  const requested = [];
  const result = await resolveKnownTitles({
    mediaType: 'movie', knownTitles: ['Top Gun', 'top gun', 'TOP GUN', 'A', 'B', 'C', 'D', 'E']
  }, {
    searchCandidates: async title => {
      requested.push(title);
      return [movie(50, 'Top Gun')];
    }
  });
  assert.equal(requested.length, ENTITY_RESOLUTION_LIMIT);
  assert.equal(result.resolvedTitles.length, 1);
  assert.equal(result.metrics.entityResolutionInputCount, ENTITY_RESOLUTION_LIMIT);
});

test('orchestrator supplies ResolvedIntentContext before retrieval', async () => {
  const telemetry = {};
  let received = null;
  const result = await orchestrateSearch({
    interpreted: { media_type: 'movie', reference_titles: ['Gone Girl'] },
    cleanQuery: 'un film comme Gone Girl', telemetry,
    env: { [CANONICAL_SEARCH_ENGINE_FLAG]: 'true' },
    resolveEntities: async intent => {
      received = intent;
      return { resolvedTitles: [{ inputTitle: 'Gone Girl', tmdbId: 1 }], unresolvedTitles: [],
        metrics: { entityResolutionAttempted: true, entityResolutionInputCount: 1,
          entityResolutionResolvedCount: 1, entityResolutionUnresolvedCount: 0,
          entityResolutionAmbiguousCount: 0, entityResolutionErrorCount: 0,
          entityResolutionDurationMs: 1 } };
    }
  });
  assert.equal(received.knownTitles[0], 'Gone Girl');
  assert.equal(result.resolvedIntentContext.resolvedTitles[0].tmdbId, 1);
  assert.equal(telemetry.entityResolutionResolvedCount, 1);
  assert.equal(telemetry.searchEnginePath, 'canonical');
});

test('resolver does not expose query data in aggregate metrics', async () => {
  const context = await resolveKnownTitles({ knownTitles: ['Secret Film'] }, {
    searchCandidates: async () => []
  });
  assert.equal(JSON.stringify(context.metrics).includes('Secret'), false);
});

test('request-scoped TMDB cache reuses a resolution for the historical helper', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ results: [movie(99, 'Gone Girl')] }) };
  };
  try {
    const cache = new Map();
    const candidates = await searchTmdbCandidates('Gone Girl', 'movie', null, 'fixture-key', cache);
    const exact = await fetchExactTmdbCandidate('Gone Girl', 'movie', null, 'fixture-key', cache);
    assert.equal(candidates.length, 1);
    assert.equal(exact.id, 99);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
