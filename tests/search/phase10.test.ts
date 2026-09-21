import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntentFromLegacy } from '../../src/search/canonicalIntentShadow.js';
import { createRetrievalTelemetry, hybridRetrieve } from '../../src/search/hybridRetriever.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import { FALLBACK_REASONS } from '../../src/search/fallbackPolicy.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { enforceFormatConstraintAndFallback, executeCinoraSearch } from '../../src/services/unifiedAiSearch.ts';

const row = (id: number, mediaType: 'movie' | 'tv' = 'movie', extra: Record<string, unknown> = {}) => ({
  id,
  media_type: mediaType,
  title: `Title ${id}`,
  original_title: `Original ${id}`,
  overview: 'A grounded character study.',
  genre_ids: [18],
  release_date: mediaType === 'movie' ? '2020-01-01' : undefined,
  first_air_date: mediaType === 'tv' ? '2020-01-01' : undefined,
  vote_average: 7.5,
  vote_count: 1000,
  ...extra
});

const env = {
  HYBRID_RETRIEVAL_ENABLED: 'true',
  STRICT_CONSTRAINT_FILTER_ENABLED: 'true',
  ELICINE_RANKING_ENABLED: 'true',
  DIVERSIFIED_RANKING_ENABLED: 'true'
};

function orchestration(canonicalIntent: ReturnType<typeof createCanonicalIntent>, resolvedTitles: unknown[] = []) {
  return { canonicalIntent, resolvedIntentContext: { resolvedTitles } };
}

test('each failing source is isolated while another source completes the pool', async () => {
  const fail = async () => { throw new Error('private provider output'); };
  const cases = [
    { expected: 'tmdb_recommendations', intent: createCanonicalIntent({ mediaType: 'movie' }),
      resolved: [{ tmdbId: 90, mediaType: 'movie' }], services: { recommendations: fail } },
    { expected: 'tmdb_similar', intent: createCanonicalIntent({ mediaType: 'movie' }),
      resolved: [{ tmdbId: 90, mediaType: 'movie' }], services: { similar: fail } },
    { expected: 'tmdb_discover', intent: createCanonicalIntent({ mediaType: 'movie', genres: ['Drama'] }),
      resolved: [], services: { discover: fail } },
    { expected: 'supabase_vector', intent: createCanonicalIntent({ mediaType: 'movie' }),
      resolved: [], services: { vector: fail } },
    { expected: 'supabase_lexical', intent: createCanonicalIntent({ mediaType: 'movie' }),
      resolved: [], services: { lexical: fail } }
  ];

  for (const fixture of cases) {
    const telemetry = createRetrievalTelemetry();
    const candidates = await hybridRetrieve({
      intent: fixture.intent,
      resolvedContext: { resolvedTitles: fixture.resolved },
      services: { ...fixture.services, legacy: async () => [row(1)] },
      context: { telemetry }
    });
    assert.equal(candidates.length, 1);
    assert.ok(telemetry.retrievalSourceErrors.some(error => error.source === fixture.expected));
    assert.equal(telemetry.fallbackAttempted, true);
    assert.equal(telemetry.fallbackUsed, true);
    assert.equal(telemetry.fallbackReason, FALLBACK_REASONS.PROVIDER_ERROR);
    assert.equal(JSON.stringify(telemetry).includes('private provider output'), false);
  }
});

test('a timed-out source does not discard completed sources', async () => {
  const telemetry = createRetrievalTelemetry();
  const candidates = await hybridRetrieve({
    intent: createCanonicalIntent({ mediaType: 'tv' }),
    services: {
      vector: async () => new Promise(() => {}),
      legacy: async () => [row(2, 'tv')]
    },
    context: { telemetry, sourceTimeoutMs: 10 }
  });
  assert.equal(candidates.length, 1);
  assert.equal(telemetry.fallbackReason, FALLBACK_REASONS.TIMEOUT);
  assert.equal(telemetry.fallbackSource, 'supabase_vector');
  assert.equal(telemetry.fallbackUsed, true);
});

test('modern-war aviation TV intent never receives a movie when a source fails', async () => {
  const telemetry = createRetrievalTelemetry();
  const result = await orchestrateCandidateRetrieval({
    orchestration: orchestration(createCanonicalIntent({
      mediaType: 'tv', genres: ['War'], themes: ['modern warfare', 'fighter aircraft']
    })),
    services: {
      lexical: async () => { throw new Error('supabase unavailable'); },
      legacy: async () => [row(1, 'movie'), row(2, 'tv', {
        genre_ids: [10768], overview: 'Modern warfare and fighter aircraft.'
      })]
    },
    context: { telemetry }, env
  });
  assert.equal(result?.length, 1);
  assert.ok(result?.every(candidate => candidate.mediaType === 'tv'));
});

test('strict semantic exclusions remain authoritative during source fallback', async () => {
  const canonical = createCanonicalIntentFromLegacy(
    { media_type: 'movie', primary_genres: ['Thriller'], mood_tags: ['dark'] },
    { userQuery: 'un thriller psychologique sombre sans meurtre ni enquête policière' }
  );
  const telemetry = createRetrievalTelemetry();
  const result = await orchestrateCandidateRetrieval({
    orchestration: orchestration(canonical),
    services: {
      vector: async () => { throw new Error('vector unavailable'); },
      legacy: async () => [
        row(1, 'movie', { overview: 'A psychological story of murder and a police investigation.' }),
        row(2, 'movie', { overview: 'A dark psychological portrait of grief and identity.' })
      ]
    },
    context: { telemetry }, env
  });
  assert.deepEqual(result?.map(candidate => candidate.tmdbId), [2]);
  assert.equal(telemetry.rejectedSemanticExclusion, 1);
});

test('all external failures and an empty pool return zero real candidates', async () => {
  const fail = async () => { throw new Error('offline'); };
  const telemetry = createRetrievalTelemetry();
  const result = await orchestrateCandidateRetrieval({
    orchestration: orchestration(createCanonicalIntent({ mediaType: 'tv', genres: ['War'] })),
    services: { discover: fail, vector: fail, lexical: fail, legacy: fail },
    context: { telemetry }, env
  });
  assert.deepEqual(result, []);
  assert.equal(telemetry.fallbackUsed, false);
  assert.equal(telemetry.fallbackReason, FALLBACK_REASONS.PROVIDER_ERROR);
  assert.equal(telemetry.fallbackSource, 'multiple_sources');
});

test('a pool fully rejected by strict constraints becomes no_relevant_results', async () => {
  const canonical = createCanonicalIntentFromLegacy(
    { media_type: 'movie', primary_genres: ['Thriller'] },
    { userQuery: 'un thriller sombre sans meurtre' }
  );
  const telemetry = createRetrievalTelemetry();
  const result = await orchestrateCandidateRetrieval({
    orchestration: orchestration(canonical),
    services: { legacy: async () => [row(1, 'movie', { overview: 'A murder consumes the town.' })] },
    context: { telemetry }, env
  });
  assert.deepEqual(result, []);
  assert.equal(telemetry.fallbackReason, FALLBACK_REASONS.NO_RELEVANT_RESULTS);
  assert.equal(telemetry.fallbackSource, 'strict_filter');
});

test('empty retrieval and empty or failed ranking expose normalized internal states', async () => {
  const emptyTelemetry = createRetrievalTelemetry();
  assert.deepEqual(await orchestrateCandidateRetrieval({
    orchestration: orchestration(createCanonicalIntent({ mediaType: 'movie' })),
    services: { legacy: async () => [] }, context: { telemetry: emptyTelemetry }, env
  }), []);
  assert.equal(emptyTelemetry.fallbackReason, FALLBACK_REASONS.NO_CANDIDATES);

  for (const rankCandidates of [() => [], () => { throw new Error('rank internals'); }]) {
    const telemetry = createRetrievalTelemetry();
    assert.deepEqual(await orchestrateCandidateRetrieval({
      orchestration: orchestration(createCanonicalIntent({ mediaType: 'movie' })),
      services: { legacy: async () => [row(1)] }, context: { telemetry }, env, rankCandidates
    }), []);
    assert.equal(telemetry.fallbackReason, FALLBACK_REASONS.RANKING_ERROR);
    assert.equal(telemetry.fallbackSource, 'ranking');
  }
});

test('frontend format enforcement never turns TV into movies or movies into TV', () => {
  const movie = { id: 1, title: 'Movie', media_type: 'FILM' } as any;
  const series = { id: 2, title: 'Series', media_type: 'SÉRIE' } as any;
  assert.deepEqual(enforceFormatConstraintAndFallback([movie], 'Séries TV', 'default').movies, []);
  assert.deepEqual(enforceFormatConstraintAndFallback([series], 'Films', 'default').movies, []);
  assert.deepEqual(enforceFormatConstraintAndFallback([movie, series], 'Séries TV', 'default').movies, [series]);
});

test('a successful empty server response is authoritative in the frontend', async () => {
  const originalFetch = globalThis.fetch;
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let calls = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { length: 0, getItem: () => null, key: () => null }
  });
  globalThis.fetch = (async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        movies: [],
        isEmpty: true,
        message: 'Aucun résultat pertinent',
        providerUsed: 'Algorithme Éliciné'
      })
    } as Response;
  }) as typeof fetch;
  try {
    const result = await executeCinoraSearch('une série de guerre moderne avec des avions de combat');
    assert.deepEqual(result.recommendedMovies, []);
    assert.equal(result.isFallbackMode, false);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (localStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', localStorageDescriptor);
    else delete (globalThis as any).localStorage;
  }
});

test('frontend network failure does not start a less strict local fallback cascade', async () => {
  const originalFetch = globalThis.fetch;
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let calls = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { length: 0, getItem: () => null, key: () => null }
  });
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('offline');
  }) as typeof fetch;
  try {
    const result = await executeCinoraSearch('un thriller psychologique sombre sans meurtre ni enquête policière');
    assert.deepEqual(result.recommendedMovies, []);
    assert.equal(result.isFallbackMode, false);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (localStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', localStorageDescriptor);
    else delete (globalThis as any).localStorage;
  }
});
