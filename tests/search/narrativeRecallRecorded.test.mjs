import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import corpus from './narrative-recall-corpus.json' with { type: 'json' };
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { hybridRetrieve } from '../../src/search/hybridRetriever.js';
import { createTmdbRetrievalClient } from '../../src/search/retrievalServices.js';
import { createSearchEvaluationTrace, evaluateCandidateRecall } from '../../src/search/searchEvaluation.js';

const recording = JSON.parse(gunzipSync(readFileSync(new URL('./narrative-recall-recording.json.gz', import.meta.url))));
const runs = [];
for (const entry of corpus) test(`recorded narrative retrieval: ${entry.id}`, async () => {
  const telemetry = {};
  const trace = createSearchEvaluationTrace();
  const requests = [];
  const services = createTmdbRetrievalClient({ apiKey: 'fixture', telemetry, fetchImpl: async raw => {
    const url = new URL(raw); url.searchParams.delete('api_key');
    const key = `${url.pathname}?${url.searchParams}`; requests.push(key);
    assert.ok(recording.requests[key], `missing recording for ${key}`);
    return { ok: true, json: async () => structuredClone(recording.requests[key]) };
  } });
  const pool = await hybridRetrieve({
    intent: createCanonicalIntent({ mediaType: entry.mediaType, genres: entry.genres,
      themes: [...entry.concepts, ...entry.motifs], keywords: entry.keywords, languages: entry.languages }),
    resolvedContext: { resolvedPeople: entry.person ? [entry.person] : [] }, services,
    context: { telemetry, evaluationTrace: trace, semanticIntentContext: {
      intentType: 'specific_title_description', semanticConcepts: entry.concepts, narrativeMotifs: entry.motifs,
      people: entry.person ? [entry.person.name] : [] } }
  });
  const result = evaluateCandidateRecall(pool, [entry.expected]);
  runs.push({ ...result, set: entry.set, mediaType: entry.mediaType });
  assert.equal(telemetry.retrievalSourceErrorCount, 0);
  assert.ok(requests.length <= 30);
  assert.ok(pool.length <= 50);
  assert.ok(pool.every(candidate => candidate.mediaType === entry.mediaType));
  assert.equal(new Set(pool.map(candidate => `${candidate.mediaType}:${candidate.tmdbId}`)).size, pool.length);
  const baseline = recording.baseline.find(run => run.id === entry.id);
  assert.ok(result.candidateRecallAt20 >= baseline.candidateRecallAt20, `recall regression: ${entry.id}`);
});

test('recorded recall measures development and unseen films/series independently', () => {
  const improvements = [];
  for (const set of ['development', 'generalization']) for (const mediaType of ['movie', 'tv']) {
    const before = recording.baseline.filter(run => run.set === set && run.mediaType === mediaType);
    const after = runs.filter(run => run.set === set && run.mediaType === mediaType);
    assert.equal(before.length, after.length);
    const sum = (values, field) => values.reduce((total, row) => total + row[field], 0);
    // Pool membership is the guarantee: an expected work that the baseline
    // retrieved must still be retrieved. Inside the pool, pre-ranking order now
    // follows how many described concepts a candidate answers, so a work can
    // lose one place to a better multi-concept match while staying in the pool.
    assert.ok(sum(after, 'candidateRecallAt20') >= sum(before, 'candidateRecallAt20'),
      `${set}/${mediaType}/candidateRecallAt20 regressed`);
    for (const field of ['candidateRecallAt10', 'candidateRecallAt20']) {
      if (sum(after, field) > sum(before, field)) improvements.push(`${set}/${mediaType}/${field}`);
    }
  }
  // Non-regression everywhere, and a measurable gain on the development set.
  // A bucket already at its maximum (every expected work retrieved) cannot
  // improve further; the requirement is that at least one development measure
  // does, which is what the multi-concept angles are for.
  assert.ok(improvements.some(entry => entry.startsWith('development')),
    `development recall did not improve anywhere (gains: ${improvements.join(', ') || 'aucun'})`);
  // Equality on the generalization set is non-regression, NOT mission success.
});
