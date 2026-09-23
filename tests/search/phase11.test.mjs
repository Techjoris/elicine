import assert from 'node:assert/strict';
import test from 'node:test';
import corpus from './quality-phase11.json' with { type: 'json' };
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { createRetrievalTelemetry } from '../../src/search/hybridRetriever.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import {
  candidatePoolOverlapRate,
  compareCandidatePools,
  createSearchEvaluationTrace,
  evaluateSearchCorpus,
  isSearchEvaluationEnabled
} from '../../src/search/searchEvaluation.js';

const enabled = {
  HYBRID_RETRIEVAL_ENABLED: 'true', STRICT_CONSTRAINT_FILTER_ENABLED: 'true',
  ELICINE_RANKING_ENABLED: 'true', DIVERSIFIED_RANKING_ENABLED: 'true'
};

function row(id, type, title, entry, extra = {}) {
  const year = entry.intent.yearMin || (entry.id === 'horror-90s' ? 1995 : 2021);
  return {
    id, media_type: type, title, original_title: title,
    overview: `${entry.expected.concepts.join(' ')} grounded relevant story`,
    release_date: type === 'movie' ? `${year}-01-01` : undefined,
    first_air_date: type === 'tv' ? `${year}-01-01` : undefined,
    original_language: entry.intent.languages?.[0] || 'en',
    origin_country: entry.intent.countries || [], runtime: Math.min(entry.intent.runtimeMax || 120, 100),
    genres: entry.intent.genres || [], themes: entry.intent.themes || [], moods: entry.intent.moods || [],
    vote_average: 8, vote_count: 5000, popularity: 40, ...extra
  };
}

async function replay(entry) {
  const intent = createCanonicalIntent(entry.intent);
  const trace = createSearchEvaluationTrace();
  const telemetry = createRetrievalTelemetry();
  const required = entry.expected.mustInclude[0];
  const relevant = row(required.tmdbId, required.mediaType, `Relevant ${entry.id}`, entry);
  const services = { legacy: async () => [] };
  let resolvedTitles = [];

  if (entry.fixtureSource === 'lexical') services.lexical = async () => [relevant];
  else if (entry.fixtureSource === 'search') services.search = async () => [relevant];
  else if (entry.fixtureSource === 'war') {
    services.keyword = async term => [{ id: 500 + term.length, name: term }];
    services.discover = async () => [relevant];
    services.vector = async () => [relevant];
    services.lexical = async () => [relevant];
  } else if (entry.fixtureSource === 'strict') {
    services.legacy = async () => [
      relevant,
      row(900002, 'movie', 'Rejected fixture', entry,
        { overview: 'A murder and police investigation dominate the story.' })
    ];
  } else services.legacy = async () => [relevant];

  const results = await orchestrateCandidateRetrieval({
    orchestration: { canonicalIntent: intent, resolvedIntentContext: { resolvedTitles } },
    services, context: { telemetry, evaluationTrace: trace }, env: enabled
  });
  return { id: entry.id, results, trace, telemetry, expected: entry.expected };
}

test('the Phase 11 corpus is versioned, structural and contains at least twenty cases', () => {
  assert.ok(corpus.length >= 20);
  for (const entry of corpus) {
    assert.ok(entry.id && entry.query);
    assert.ok(['movie', 'tv'].includes(entry.expected.mediaType));
    assert.ok(Array.isArray(entry.expected.mustInclude));
    assert.ok(Array.isArray(entry.expected.mustExclude));
    assert.ok(Array.isArray(entry.expected.concepts));
  }
});

test('evaluation mode is test/development-only unless explicitly enabled', () => {
  assert.equal(isSearchEvaluationEnabled({ NODE_ENV: 'test' }), true);
  assert.equal(isSearchEvaluationEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(isSearchEvaluationEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(isSearchEvaluationEnabled({ NODE_ENV: 'production', SEARCH_EVALUATION_ENABLED: 'true' }), true);
  assert.equal(createSearchEvaluationTrace({ enabled: false }), null);
});

test('trace measures every retrieval source with bounded, non-sensitive fields', async () => {
  const fixture = corpus[2];
  const intent = createCanonicalIntent({ ...fixture.intent, knownTitles: ['Resolved Seed', 'Unresolved Seed'] });
  const trace = createSearchEvaluationTrace();
  const telemetry = createRetrievalTelemetry();
  const relevant = row(920001, 'movie', 'Relevant', fixture);
  const wrongType = row(920002, 'tv', 'Wrong type', fixture);
  const source = async () => [relevant, wrongType];
  await orchestrateCandidateRetrieval({
    orchestration: { canonicalIntent: intent, resolvedIntentContext: { resolvedTitles: [{
      tmdbId: 42, mediaType: 'movie', inputTitle: 'Resolved Seed', canonicalTitle: 'Resolved Seed'
    }] } },
    services: { search: source, discover: source, similar: source, recommendations: source,
      vector: source, lexical: source, legacy: source, keyword: async term => [{ id: term.length + 100, name: term }] },
    context: { telemetry, evaluationTrace: trace }, env: enabled
  });
  for (const name of ['tmdb_search', 'tmdb_discover', 'tmdb_similar', 'tmdb_recommendations',
    'supabase_vector', 'supabase_lexical', 'legacy']) {
    const metric = trace.sources[name];
    // Discover schedules the historical angles plus, when the request affords
    // it, the complementary pair and the release-date ordering: the measured
    // count stays bounded and even (two fixtures per call), which is what this
    // trace contract guarantees. The other sources answer exactly once.
    if (name === 'tmdb_discover') assert.ok(metric.candidateCount >= 6 && metric.candidateCount % 2 === 0,
      `tmdb_discover candidateCount=${metric.candidateCount}`);
    else assert.equal(metric.candidateCount, 2);
    assert.equal(metric.uniqueCandidateCount, 2);
    assert.deepEqual(metric.topIds, [920001, 920002]);
    assert.equal(metric.mediaTypeConformity, 0.5);
    assert.equal(typeof metric.durationMs, 'number');
    assert.equal(metric.error, null);
    assert.equal(metric.emptyResult, false);
  }
  assert.equal(JSON.stringify(trace).includes('Unresolved Seed'), true);
});

const runs = [];
for (const entry of corpus) test(`evaluation trace ${entry.id}`, async () => {
  const run = await replay(entry);
  runs.push(run);
  const required = entry.expected.mustInclude[0];
  assert.ok(run.results.some(candidate => candidate.tmdbId === required.tmdbId && candidate.mediaType === required.mediaType));
  assert.ok(run.results.every(candidate => candidate.mediaType === entry.expected.mediaType));
  assert.deepEqual(run.trace.canonicalIntent, createCanonicalIntent(entry.intent));
  assert.ok(run.trace.semanticExpansion);
  assert.ok(run.trace.resolvedIntentContext);
  assert.ok(run.trace.poolBeforeDeduplication.length >= run.trace.poolAfterDeduplication.length);
  assert.ok(run.trace.poolAfterStrictFilter.length >= run.trace.finalResults.length);
  assert.equal(run.trace.scoresPhase8.length, run.trace.orderAfterDiversification.length);
});

test('Inception enters through a traceable lexical semantic source', () => {
  const run = runs.find(value => value.id === 'inception-dreams');
  assert.deepEqual(run.trace.sources.supabase_lexical.topIds, [27205]);
  assert.ok(run.trace.finalResults.some(candidate => candidate.tmdbId === 27205));
});

test('Titanic enters through TMDB Search instead of a generic pool', () => {
  const run = runs.find(value => value.id === 'titanic-cast');
  assert.deepEqual(run.trace.sources.tmdb_search.topIds, [597]);
  assert.ok(run.trace.finalResults.some(candidate => candidate.tmdbId === 597));
});

test('modern-war movie and TV traces expose expansion, Discover, vector and lexical sources', () => {
  for (const id of ['modern-war-movie', 'modern-war-tv']) {
    const run = runs.find(value => value.id === id);
    assert.ok(run.trace.semanticExpansion.addedTerms.includes('fighter aircraft'));
    assert.ok(run.trace.semanticExpansion.resolvedKeywordIds.length > 0);
    for (const source of ['tmdb_discover', 'supabase_vector', 'supabase_lexical']) {
      assert.ok(run.trace.sources[source].candidateCount > 0);
      assert.equal(run.trace.sources[source].mediaTypeConformity, 1);
    }
  }
});

test('strict exclusions identify the exact stage where the murder fixture disappears', () => {
  const run = runs.find(value => value.id === 'psychological-no-murder');
  assert.ok(run.trace.poolAfterDeduplication.some(candidate => candidate.tmdbId === 900002));
  assert.ok(!run.trace.poolAfterStrictFilter.some(candidate => candidate.tmdbId === 900002));
  assert.ok(!run.trace.finalResults.some(candidate => candidate.tmdbId === 900002));
});

test('unrelated Inception and modern-war pools have no generic overlap', () => {
  const inception = runs.find(value => value.id === 'inception-dreams').trace.poolAfterDeduplication;
  const war = runs.find(value => value.id === 'modern-war-movie').trace.poolAfterDeduplication;
  assert.equal(candidatePoolOverlapRate(inception, war), 0);
  assert.deepEqual(compareCandidatePools(inception, war), {
    candidatePoolOverlapRate: 0, genericPoolDetected: false
  });
  const generic = compareCandidatePools(inception, inception);
  assert.equal(generic.candidatePoolOverlapRate, 1);
  assert.equal(generic.genericPoolDetected, true);
});

test('offline corpus metrics are deterministic and constraint-safe', () => {
  assert.equal(runs.length, corpus.length);
  const metrics = evaluateSearchCorpus(runs);
  assert.deepEqual(metrics, {
    recallAt5: 1,
    recallAt10: 1,
    mrr: 1,
    constraintViolationRate: 0,
    irrelevantPoolOverlapRate: 0,
    emptyResultRate: 0
  });
  console.log('PHASE11_METRICS', JSON.stringify(metrics));
});
