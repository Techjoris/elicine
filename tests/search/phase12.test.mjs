import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSearchTelemetryRow,
  fingerprintResultSet,
  persistSearchTelemetry,
  resetTelemetryPoolObservations
} from '../../api/searchTelemetryPersistence.js';
import {
  createSearchTelemetry,
  finalizeSearchTelemetry
} from '../../api/searchPhase0.js';
import { createCanonicalIntentFromLegacy } from '../../src/search/canonicalIntentShadow.js';
import { buildVectorQueryText } from '../../src/search/vectorRetrieval.js';

function completedTelemetry(query = 'technical query') {
  const telemetry = createSearchTelemetry({ rawQuery: query, locale: 'fr-FR' });
  Object.assign(telemetry, {
    searchEnginePath: 'canonical',
    llmCalls: 1,
    hybridRetrievalDurationMs: 24,
    retrievalCandidateCountBeforeDedup: 4,
    retrievalCandidateCountFinal: 3,
    strictFilterAttempted: true,
    strictFilterInputCount: 3,
    strictFilterOutputCount: 2,
    strictFilterRejectedCount: 1,
    strictFilterUnknownCount: 1,
    rankingCandidateCount: 2,
    rankingDurationMs: 7,
    rankingTopScore: 0.82,
    vectorRetrievalAttempted: true,
    vectorRetrievalSucceeded: true,
    semanticExpansionApplied: true,
    semanticExpansionTermCount: 4,
    semanticKeywordResolvedCount: 2
  });
  finalizeSearchTelemetry(telemetry, {
    success: true,
    results: [
      { id: 101, media_type: 'movie', match_rate: 82 },
      { id: 102, media_type: 'movie', match_rate: 75 }
    ]
  }, 200);
  return telemetry;
}

test('each search receives one stable unique search_id', () => {
  const first = createSearchTelemetry({ rawQuery: 'one' });
  const second = createSearchTelemetry({ rawQuery: 'two' });
  assert.match(first.searchId, /^[0-9a-f-]{36}$/i);
  assert.equal(first.searchId, first.queryId);
  assert.notEqual(first.searchId, second.searchId);
});

test('successful persistence writes one technical summary and no raw data', async () => {
  resetTelemetryPoolObservations();
  const telemetry = completedTelemetry('Inception Leonardo DiCaprio rêves');
  const rows = [];
  const client = {
    from(table) {
      assert.equal(table, 'search_telemetry');
      return { insert(row) { rows.push(row); return Promise.resolve({ data: null, error: null }); } };
    }
  };
  const result = await persistSearchTelemetry({ client, telemetry, payload: { results: telemetry.results } });
  assert.equal(result.persisted, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].search_id, telemetry.searchId);
  assert.equal(rows[0].top_score, 0.82);
  assert.equal(rows[0].vector_used, true);
  assert.equal('rawQuery' in rows[0], false);
  assert.equal('queryHash' in rows[0], false);
  assert.equal('embedding' in rows[0], false);
  assert.equal(JSON.stringify(rows[0]).includes('Inception'), false);
  assert.equal(JSON.stringify(rows[0]).includes('DiCaprio'), false);

  const second = await persistSearchTelemetry({ client, telemetry, payload: { results: telemetry.results } });
  assert.equal(second.skipped, true);
  assert.equal(rows.length, 1);
});

test('fallback, provider error and empty pool indicators are durable and bounded', () => {
  const telemetry = createSearchTelemetry({ rawQuery: 'offline search' });
  Object.assign(telemetry, {
    fallbackUsed: true,
    fallbackReason: 'provider_error',
    fallbackSource: 'multiple_sources',
    retrievalSourceErrorCount: 3,
    strictFilterAttempted: true,
    strictFilterInputCount: 2,
    strictFilterOutputCount: 0,
    vectorRetrievalError: 'EMBEDDING_DIMENSION_MISMATCH',
    totalLatencyMs: 6001,
    finalResultCount: 0,
    results: []
  });
  const row = buildSearchTelemetryRow(telemetry, { results: [] }, 200);
  assert.equal(row.fallback_used, true);
  assert.equal(row.fallback_reason, 'provider_error');
  assert.equal(row.provider_error_count, 3);
  assert.equal(row.embedding_unusable, true);
  assert.equal(row.no_candidates_after_filter, true);
  assert.equal(row.no_relevant_results, true);
  assert.equal(row.excessive_duration, true);
});

test('Supabase telemetry errors never reject the search path', async () => {
  const telemetry = completedTelemetry('provider failure');
  const result = await persistSearchTelemetry({
    client: { from() { return { insert() { return Promise.reject(new Error('database offline')); } }; } },
    telemetry
  });
  assert.equal(result.persisted, false);
  assert.ok(result.error);
  assert.equal(telemetry.telemetryPersistenceAttempted, true);
});

test('technical result fingerprints never contain titles', () => {
  const fingerprint = fingerprintResultSet([{ id: 1, media_type: 'movie', title: 'Secret title' }]);
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(fingerprint.includes('Secret'), false);
});

test('repeated pools from different query hashes are flagged as generic', () => {
  resetTelemetryPoolObservations();
  const first = createSearchTelemetry({ rawQuery: 'first distinct query' });
  const second = createSearchTelemetry({ rawQuery: 'second distinct query' });
  const payload = { results: [{ id: 77, media_type: 'tv', match_rate: 61 }] };
  assert.equal(buildSearchTelemetryRow(first, payload).generic_pool_suspected, false);
  assert.equal(buildSearchTelemetryRow(second, payload).generic_pool_suspected, true);
});

test('Phase 11 no-LLM regression keeps distinct embedding documents', () => {
  const emptyLlm = { provider: 'Algorithme Éliciné', media_type: 'all', primary_genres: [], mood_tags: [] };
  const inception = createCanonicalIntentFromLegacy(emptyLlm, {
    userQuery: 'Inception Leonardo DiCaprio rêves'
  });
  const war = createCanonicalIntentFromLegacy(emptyLlm, {
    userQuery: 'guerre moderne avions de combat'
  });
  const inceptionDocument = buildVectorQueryText(inception);
  const warDocument = buildVectorQueryText(war);
  assert.ok(inceptionDocument.length > 0);
  assert.ok(warDocument.length > 0);
  assert.notEqual(inceptionDocument, warDocument);
});
