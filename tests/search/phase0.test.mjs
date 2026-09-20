import assert from 'node:assert/strict';
import test from 'node:test';
import corpus from './baseline-corpus.v1.json' with { type: 'json' };
import {
  SEARCH_ENGINE_MODES,
  createSearchTelemetry,
  createSearchComparisonContract,
  finalizeSearchTelemetry,
  getBufferedSearchTelemetry,
  getSearchEngineMode,
  isShadowModePrepared
} from '../../api/searchPhase0.js';
import searchHandler from '../../api/search.js';

test('baseline corpus is versioned and has the required coverage', () => {
  assert.match(corpus.version, /^\d+\.\d+\.\d+$/);
  assert.ok(corpus.queries.length >= 30);
  assert.equal(new Set(corpus.queries.map(item => item.id)).size, corpus.queries.length);
  for (const item of corpus.queries) {
    assert.ok(item.query.length > 0);
    assert.ok(['fr', 'en', 'es', 'de', 'it'].includes(item.language));
    assert.ok(Array.isArray(item.expectedMediaTypes) && item.expectedMediaTypes.length > 0);
    assert.ok(Array.isArray(item.objectiveChecks));
    assert.ok(Array.isArray(item.qualitativeExpectations));
  }
});

test('Phase 0 always keeps the current engine visible by default', () => {
  assert.equal(getSearchEngineMode({}), SEARCH_ENGINE_MODES.CURRENT_ENGINE);
  assert.equal(getSearchEngineMode({ SEARCH_ENGINE_MODE: 'NEW_ENGINE' }), SEARCH_ENGINE_MODES.CURRENT_ENGINE);
  assert.equal(isShadowModePrepared({}), false);
  assert.equal(isShadowModePrepared({ SEARCH_ENGINE_MODE: 'SHADOW_NEW_ENGINE', SEARCH_SHADOW_ENABLED: 'true' }), true);
});

test('telemetry is non-PII by default and does not alter result snapshots', () => {
  const telemetry = createSearchTelemetry({ rawQuery: 'Inception', locale: 'fr-FR' });
  const payload = { providerUsed: 'Current Engine', results: [{ id: 27205, media_type: 'movie', match_rate: 99 }] };
  finalizeSearchTelemetry(telemetry, payload, 200);
  assert.notEqual(telemetry.queryHash, 'Inception');
  assert.equal('rawQuery' in telemetry, false);
  assert.deepEqual(telemetry.results, [{ id: 27205, mediaType: 'movie', rank: 1, score: 99, provenance: null }]);
  assert.ok(getBufferedSearchTelemetry().some(item => item.queryId === telemetry.queryId));
});

test('comparison contract is inert until a future engine provides a snapshot', () => {
  const contract = createSearchComparisonContract({ queryId: 'q-1', oldResult: { results: [] } });
  assert.equal(contract.comparisonStatus, 'not_run');
  assert.equal(contract.newEngine, null);
});

test('the existing quota path remains functional with Phase 0 response instrumentation', async () => {
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
    end() {}
  };
  const req = {
    method: 'GET',
    query: { action: 'quota' },
    body: {},
    headers: {},
    socket: { remoteAddress: '127.0.0.1' }
  };

  await searchHandler(req, res);
  assert.equal(headers['x-elicine-search-engine'], SEARCH_ENGINE_MODES.CURRENT_ENGINE);
  assert.match(headers['x-elicine-search-query-id'], /^[0-9a-f-]{36}$/i);
  assert.equal(res.payload.max, 3);
  assert.equal(res.payload.remaining, 3);
});
