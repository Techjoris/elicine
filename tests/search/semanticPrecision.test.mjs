/**
 * Semantic precision corpus (Mission 1/3).
 *
 * The cases replay the real pipeline locally through the shared harness, so a
 * semantic regression is caught without any provider call. The `development`
 * cases mirror the reported live phenomena; the `generalization` cases reuse
 * the same phenomena on other works, other wordings and the other media type.
 * Both sets must progress: a correction that only helps the reported examples
 * would not be a correction.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { replaySemanticPrecisionCase, semanticPrecisionCorpus as corpus,
  semanticPrecisionSet } from './semanticPrecisionHarness.mjs';
import { candidateIdentity, evaluateSearchQuality } from '../../src/search/searchEvaluation.js';

/** The public grid is bounded: a case never returns more than this. */
const MAX_GRID_SIZE = 20;

const development = semanticPrecisionSet('development');
const generalization = semanticPrecisionSet('generalization');

test('the corpus is versioned, mirrored across films and series, and split in two sets', () => {
  assert.ok(development.length >= 4);
  assert.ok(generalization.length >= 4);
  for (const entry of corpus) {
    assert.ok(entry.id && entry.query);
    assert.ok(['development', 'generalization'].includes(entry.set));
    assert.ok(['movie', 'tv'].includes(entry.expected.mediaType));
    assert.ok(entry.expected.mustInclude.length >= 1);
    assert.ok(Array.isArray(entry.expected.mustExclude));
    assert.equal(entry.candidates.every(candidate => candidate.mediaType === entry.expected.mediaType), true);
  }
  // Films and series are covered in mirror: no property is exercised on a
  // single media type only.
  for (const set of [development, generalization]) for (const mediaType of ['movie', 'tv']) {
    assert.ok(set.some(entry => entry.expected.mediaType === mediaType),
      `${set === development ? 'development' : 'generalization'} set has no ${mediaType} case`);
  }
});

const runs = new Map();
for (const entry of corpus) test(`semantic precision: ${entry.id}`, async () => {
  const run = await replaySemanticPrecisionCase(entry);
  runs.set(entry.id, run);
  const identities = run.results.map(candidateIdentity);
  const requiredIdentity = candidateIdentity(entry.expected.mustInclude[0]);
  assert.ok(identities.includes(requiredIdentity),
    `${entry.id}: ${requiredIdentity} missing from [${identities.join(', ')}]`);
  for (const forbidden of entry.expected.mustExclude) {
    assert.ok(!identities.includes(candidateIdentity(forbidden)),
      `${entry.id}: excluded ${candidateIdentity(forbidden)} was returned`);
  }
  for (const later of entry.expected.after || []) {
    const identity = candidateIdentity({ tmdbId: later, mediaType: entry.expected.mediaType });
    const index = identities.indexOf(identity);
    // An absent candidate was cut by the relevance floor, which is after the
    // answer too; only a present one must be ordered strictly below it.
    if (index >= 0) assert.ok(index > identities.indexOf(requiredIdentity),
      `${entry.id}: ${identity} must rank after ${requiredIdentity}`);
  }
  assert.ok(run.results.length <= MAX_GRID_SIZE,
    `${entry.id}: ${run.results.length} results exceed the ${MAX_GRID_SIZE}-result grid`);
  assert.ok(run.results.every(candidate => candidate.mediaType === entry.expected.mediaType));
});

const metricsFor = entries => evaluateSearchQuality(
  entries.map(entry => runs.get(entry.id)).filter(Boolean));

test('the development set lands the described work at the top without off-topic noise', () => {
  const metrics = metricsFor(development);
  assert.equal(metrics.overall.caseCount, development.length);
  assert.equal(metrics.overall.constraintViolationRate, 0);
  assert.ok(metrics.overall.top1 >= 0.875, `top1 ${metrics.overall.top1}`);
  assert.ok(metrics.overall.mrr >= 0.9, `mrr ${metrics.overall.mrr}`);
  assert.ok(metrics.overall.offTopicRate <= 0.2, `offTopicRate ${metrics.overall.offTopicRate}`);
  assert.ok(metrics.overall.averageSemanticCoverage >= 0.5,
    `coverage ${metrics.overall.averageSemanticCoverage}`);
  assert.ok(metrics.overall.averageResultCount <= MAX_GRID_SIZE);
  assert.deepEqual(Object.keys(metrics.byMediaType).sort(), ['movie', 'tv']);
  for (const type of ['movie', 'tv']) {
    assert.equal(metrics.byMediaType[type].constraintViolationRate, 0);
    assert.ok(metrics.byMediaType[type].top1 >= 0.75, `${type} top1 ${metrics.byMediaType[type].top1}`);
  }
});

test('the generalization set improves on other works and wordings too', () => {
  const metrics = metricsFor(generalization);
  assert.equal(metrics.overall.caseCount, generalization.length);
  assert.equal(metrics.overall.constraintViolationRate, 0);
  assert.ok(metrics.overall.top1 >= 0.75, `top1 ${metrics.overall.top1}`);
  assert.ok(metrics.overall.mrr >= 0.8, `mrr ${metrics.overall.mrr}`);
  assert.ok(metrics.overall.offTopicRate <= 0.25, `offTopicRate ${metrics.overall.offTopicRate}`);
  for (const type of ['movie', 'tv']) {
    assert.equal(metrics.byMediaType[type].constraintViolationRate, 0);
  }
});