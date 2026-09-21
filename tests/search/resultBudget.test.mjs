import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCandidates, toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import {
  INTENT_TYPES, PRECISE_RECOMMENDATION_RICHNESS, RESULT_BUDGETS, RESULT_BUDGET_BUCKETS,
  RESULT_BUDGET_FLAG, SEARCH_INTENT_SHAPES, applyResultBudget,
  intentSignalRichness, isConfidentIdentification, isResultBudgetEnabled,
  resolveResultBudget, resolveSearchIntentShape
} from '../../src/search/resultBudget.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import { ELICINE_RANKING_CONFIG, publicMatchScore, scoreSearchCandidate } from '../../src/search/searchRanker.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';

const intent = input => createCanonicalIntent(input);
const resolved = (resolvedTitles = [], resolvedPeople = []) => ({ resolvedTitles, resolvedPeople,
  unresolvedTitles: [], metrics: {} });
const semanticContext = (intentType, extra = {}) => ({ intentType, ...extra });

/** A description rich enough to identify one work (genre + theme + keyword + mood). */
const workIntent = mediaType => intent({ mediaType, genres: ['Science Fiction', 'Action'],
  themes: ['shared dreams', 'subconscious'], keywords: ['dream', 'heist'], moods: ['twisty'] });

/** Ranked candidate carrying only the fields the budget reads. */
const ranked = (id, finalScore, { convergenceScore = 0.5, mediaType = 'movie' } = {}) => ({
  tmdbId: id, mediaType, title: `Title ${id}`, sources: ['legacy'], retrievalSignals: [],
  ranking: { finalScore, convergenceScore }
});

/** Smoothly decaying ranked pool: adjacent drops stay well below the cliff. */
const decayingPool = (count, top = 0.8, decay = 0.955, options = {}) =>
  Array.from({ length: count }, (_, index) => ranked(index + 1, top * decay ** index, options));

test('each bucket advertises the documented grid window', () => {
  const windows = Object.fromEntries(Object.values(RESULT_BUDGET_BUCKETS).map(bucket =>
    [bucket, [RESULT_BUDGETS[bucket].target, RESULT_BUDGETS[bucket].minKeep]]));
  assert.deepEqual(windows, {
    identification_confident: [1, 1],
    identification_ambiguous: [3, 2],
    precise_recommendation: [10, 6],
    similar_to_title: [12, 8],
    normal_recommendation: [12, 10],
    broad_discovery: [20, 12]
  });
});

test('identification and selection are separated by the interpreted intent type', () => {
  assert.equal(resolveSearchIntentShape(INTENT_TYPES.SPECIFIC_TITLE_DESCRIPTION, intent(), {}),
    SEARCH_INTENT_SHAPES.IDENTIFICATION);
  assert.equal(resolveSearchIntentShape(INTENT_TYPES.SIMILAR_TO_TITLE, intent({ knownTitles: ['Reference'] }), {}),
    SEARCH_INTENT_SHAPES.SELECTION);
  assert.equal(resolveSearchIntentShape(INTENT_TYPES.PERSON_SEARCH, intent({ keywords: ['shared dreams'] }), {}),
    SEARCH_INTENT_SHAPES.IDENTIFICATION);
  assert.equal(resolveSearchIntentShape(INTENT_TYPES.PERSON_SEARCH, intent(), {}), SEARCH_INTENT_SHAPES.SELECTION);
  for (const intentType of [INTENT_TYPES.THEMATIC_SEARCH, INTENT_TYPES.MOOD_SEARCH,
    INTENT_TYPES.CONSTRAINT_SEARCH, INTENT_TYPES.MIXED, null]) {
    assert.equal(resolveSearchIntentShape(intentType, intent(), {}), SEARCH_INTENT_SHAPES.SELECTION);
  }
});

test('a precisely described film resolves to a single result', () => {
  const candidates = [ranked(101, 0.71, { convergenceScore: 0.8 }), ranked(102, 0.21, { convergenceScore: 0.25 }),
    ranked(103, 0.18, { convergenceScore: 0.2 })];
  const canonical = workIntent('movie');
  assert.equal(isConfidentIdentification(candidates, 4), true);
  const plan = resolveResultBudget(canonical, semanticContext(INTENT_TYPES.SPECIFIC_TITLE_DESCRIPTION),
    candidates, resolved());
  assert.equal(plan.bucket, RESULT_BUDGET_BUCKETS.IDENTIFICATION_CONFIDENT);
  assert.equal(plan.shape, SEARCH_INTENT_SHAPES.IDENTIFICATION);
  const kept = applyResultBudget(candidates, canonical, resolved(),
    { semanticIntentContext: semanticContext(INTENT_TYPES.SPECIFIC_TITLE_DESCRIPTION) });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].tmdbId, 101);
});

test('the identification rule is identical for a precisely described series', () => {
  const candidates = [ranked(301, 0.69, { convergenceScore: 0.78, mediaType: 'tv' }),
    ranked(302, 0.2, { convergenceScore: 0.22, mediaType: 'tv' }),
    ranked(303, 0.17, { convergenceScore: 0.2, mediaType: 'tv' })];
  const kept = applyResultBudget(candidates, workIntent('tv'), resolved(),
    { semanticIntentContext: semanticContext(INTENT_TYPES.SPECIFIC_TITLE_DESCRIPTION) });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].tmdbId, 301);
  assert.equal(kept[0].mediaType, 'tv');
});

test('a comparable runner-up keeps an ambiguous identification at two or three works', () => {
  const candidates = [ranked(201, 0.62, { convergenceScore: 0.6 }), ranked(202, 0.56, { convergenceScore: 0.55 }),
    ranked(203, 0.5, { convergenceScore: 0.5 }), ranked(204, 0.2, { convergenceScore: 0.2 })];
  const canonical = intent({ mediaType: 'movie', themes: ['memory'] });
  assert.equal(isConfidentIdentification(candidates, 1), false);
  const kept = applyResultBudget(candidates, canonical, resolved(),
    { semanticIntentContext: semanticContext(INTENT_TYPES.SPECIFIC_TITLE_DESCRIPTION) });
  assert.ok(kept.length >= 2 && kept.length <= 3, `length=${kept.length}`);
});

/** Resolved work the raw query names, as the orchestrator publishes it. */
const requestedWork = (tmdbId, mediaType) => ({ tmdbId, mediaType, canonicalTitle: 'Requested work',
  originalTitle: 'Requested work', inputTitle: 'Requested work' });
const withRequested = (requestedTitles, resolvedTitles = requestedTitles) => ({ resolvedTitles,
  requestedTitles, resolvedPeople: [], unresolvedTitles: [], metrics: {} });

test('a work the query names is answered by that work alone, for films and series alike', () => {
  for (const mediaType of ['movie', 'tv']) {
    const candidates = [ranked(1, 0.62, { mediaType }), ranked(2, 0.34, { mediaType }),
      ranked(3, 0.3, { mediaType }), ranked(4, 0.27, { mediaType })];
    const context = semanticContext(INTENT_TYPES.THEMATIC_SEARCH);
    const plan = resolveResultBudget(workIntent(mediaType), context, candidates,
      withRequested([requestedWork(1, mediaType)]));
    assert.equal(plan.bucket, RESULT_BUDGET_BUCKETS.IDENTIFICATION_CONFIDENT, mediaType);
    assert.equal(plan.shape, SEARCH_INTENT_SHAPES.IDENTIFICATION, mediaType);
    assert.equal(plan.target, 1, mediaType);
    const kept = applyResultBudget(candidates, workIntent(mediaType),
      withRequested([requestedWork(1, mediaType)]), { semanticIntentContext: context });
    assert.equal(kept.length, 1, mediaType);
    assert.equal(kept[0].tmdbId, 1, mediaType);
    assert.equal(kept[0].mediaType, mediaType, mediaType);
  }
});

test('two named works keep the ambiguity window instead of a single answer', () => {
  const candidates = [ranked(1, 0.62), ranked(2, 0.59), ranked(3, 0.55), ranked(4, 0.2)];
  const context = semanticContext(INTENT_TYPES.SIMILAR_TO_TITLE);
  const kept = applyResultBudget(candidates, workIntent('movie'),
    withRequested([requestedWork(1, 'movie'), requestedWork(2, 'movie')]), { semanticIntentContext: context });
  assert.ok(kept.length >= 2 && kept.length <= 3, `length=${kept.length}`);
});

test('the requested-work rule only applies to a ranked pool', () => {
  const unranked = Array.from({ length: 20 }, (_, index) => ({ tmdbId: index + 1, mediaType: 'movie',
    title: `Title ${index + 1}` }));
  const kept = applyResultBudget(unranked, intent({ knownTitles: ['Reference'] }),
    withRequested([requestedWork(1, 'movie')]),
    { semanticIntentContext: semanticContext(INTENT_TYPES.SIMILAR_TO_TITLE) });
  // A direct resolution carries no evidence of which entry is the named work, so
  // it stays capped by its own bucket exactly as before.
  assert.equal(kept.length, 12);
});

test('the requested work is reported in the budget telemetry', () => {
  const telemetry = {};
  applyResultBudget(decayingPool(20), workIntent('movie'), withRequested([requestedWork(1, 'movie')]),
    { semanticIntentContext: semanticContext(INTENT_TYPES.THEMATIC_SEARCH), telemetry });
  assert.equal(telemetry.resultBudgetBucket, RESULT_BUDGET_BUCKETS.IDENTIFICATION_CONFIDENT);
  assert.equal(telemetry.resultBudgetTarget, 1);
  assert.equal(telemetry.resultBudgetOutputCount, 1);
});

test('similar_to_title keeps a twelve-item window and cuts the tail', () => {
  const kept = applyResultBudget(decayingPool(30), intent({ knownTitles: ['Reference'] }), resolved(),
    { semanticIntentContext: semanticContext(INTENT_TYPES.SIMILAR_TO_TITLE) });
  assert.equal(kept.length, 12);
});

test('a precise recommendation stays inside six to ten works', () => {
  const canonical = intent({ genres: ['War'], moods: ['dark'], themes: ['modern warfare'],
    keywords: ['fighter aircraft'] });
  const context = semanticContext(INTENT_TYPES.THEMATIC_SEARCH, { semanticConcepts: ['modern warfare'],
    narrativeMotifs: ['aerial combat'] });
  assert.ok(intentSignalRichness(canonical, context, resolved()) >= PRECISE_RECOMMENDATION_RICHNESS);
  const kept = applyResultBudget(decayingPool(40), canonical, resolved(), { semanticIntentContext: context });
  assert.ok(kept.length >= 6 && kept.length <= 10, `length=${kept.length}`);
});

test('a normal recommendation never exceeds twelve and a broad discovery twenty', () => {
  const context = semanticContext(INTENT_TYPES.MOOD_SEARCH);
  const normal = intent({ genres: ['Drama'], themes: ['memory'] });
  assert.equal(intentSignalRichness(normal, context, resolved()), 2);
  const keptNormal = applyResultBudget(decayingPool(50), normal, resolved(), { semanticIntentContext: context });
  assert.equal(keptNormal.length, 12);

  const broad = intent({ genres: ['Drama'] });
  assert.equal(intentSignalRichness(broad, context, resolved()), 1);
  const keptBroad = applyResultBudget(decayingPool(50), broad, resolved(), { semanticIntentContext: context });
  assert.equal(keptBroad.length, RESULT_BUDGETS[RESULT_BUDGET_BUCKETS.BROAD_DISCOVERY].target);
  assert.ok(keptBroad.length <= 20);
});

test('a relevance drop ends the grid instead of padding it to the bucket minimum', () => {
  const head = decayingPool(4, 0.8, 0.97);
  const tail = Array.from({ length: 15 }, (_, index) => ranked(50 + index, 0.2 - index * 0.005));
  const kept = applyResultBudget([...head, ...tail], intent({ genres: ['Drama'], themes: ['memory'] }),
    resolved(), { semanticIntentContext: semanticContext(INTENT_TYPES.MOOD_SEARCH) });
  const plan = RESULT_BUDGETS[RESULT_BUDGET_BUCKETS.NORMAL_RECOMMENDATION];
  assert.equal(kept.length, 4);
  assert.ok(kept.length < plan.minKeep);
  // Everything under the relative floor is tail, so the grid stops there
  // instead of being padded up to the bucket minimum.
  assert.ok(head.at(-1).ranking.finalScore >= plan.minScoreRatio * head[0].ranking.finalScore);
  assert.ok(tail[0].ranking.finalScore < plan.minScoreRatio * head[0].ranking.finalScore);
});

test('a short relevant pool is never padded to fill the grid', () => {
  const kept = applyResultBudget(decayingPool(3), intent({ knownTitles: ['Reference'] }), resolved(),
    { semanticIntentContext: semanticContext(INTENT_TYPES.SIMILAR_TO_TITLE) });
  assert.equal(kept.length, 3);
});

test('the selection rule does not depend on the media type', () => {
  const canonical = mediaType => intent({ mediaType, knownTitles: ['Reference'] });
  const forMovie = applyResultBudget(decayingPool(30, 0.8, 0.955, { mediaType: 'movie' }), canonical('movie'),
    resolved(), { semanticIntentContext: semanticContext(INTENT_TYPES.SIMILAR_TO_TITLE) });
  const forTv = applyResultBudget(decayingPool(30, 0.8, 0.955, { mediaType: 'tv' }), canonical('tv'),
    resolved(), { semanticIntentContext: semanticContext(INTENT_TYPES.SIMILAR_TO_TITLE) });
  assert.equal(forMovie.length, forTv.length);
  assert.equal(forMovie.length, 12);
});

test('an unranked direct resolution is only capped', () => {
  const unranked = Array.from({ length: 20 }, (_, index) => ({ tmdbId: index + 1, mediaType: 'movie',
    title: `Title ${index + 1}` }));
  const kept = applyResultBudget(unranked, intent({ knownTitles: ['Reference'] }), resolved(),
    { semanticIntentContext: semanticContext(INTENT_TYPES.SIMILAR_TO_TITLE) });
  assert.equal(kept.length, 12);
});

test('the public score is monotone, bounded and discriminating', () => {
  const grid = Array.from({ length: 201 }, (_, index) => index / 200);
  const values = grid.map(publicMatchScore);
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] >= values[index - 1], `not monotone at ${grid[index]}`);
  }
  assert.ok(values.every(value => Number.isInteger(value) && value >= 0 && value <= 100));
  assert.equal(publicMatchScore(0), 22);
  assert.equal(publicMatchScore(1), 100);
  assert.ok(publicMatchScore(0.8) - publicMatchScore(0.4) >= 25);
});

test('close but different candidates never display the same public score', () => {
  const displayed = [0.5, 0.52, 0.54, 0.56, 0.58].map(publicMatchScore);
  assert.equal(new Set(displayed).size, displayed.length, displayed.join(','));
});

test('multi-signal convergence outranks a generic genre match', () => {
  const canonical = intent({ genres: ['Thriller'], moods: ['dark'], themes: ['memory'],
    keywords: ['identity'], knownTitles: ['Reference'] });
  const reference = resolved([{ tmdbId: 99, mediaType: 'movie', canonicalTitle: 'Reference', genreIds: [53] }]);
  const row = (id, extra, source, signals = {}) => toRetrievalCandidate({ id, media_type: 'movie',
    title: `Candidate ${id}`, original_title: `Candidate ${id}`, overview: 'A story.', genre_ids: [53],
    vote_average: 7, vote_count: 1000, popularity: 20, release_date: '2020-01-01',
    original_language: 'en', ...extra }, source, signals);
  const onIntent = { genre_ids: [53], themes: ['memory'], moods: ['dark'], keywords: ['identity'],
    overview: 'A dark story about memory and identity.' };
  const convergent = mergeCandidates([
    row(1, onIntent, 'tmdb_recommendations', { seedTmdbId: 99 }),
    row(1, onIntent, 'tmdb_similar', { seedTmdbId: 99 }),
    row(1, onIntent, 'supabase_vector', { sourceScore: 0.9 })
  ]).candidates[0];
  const generic = row(2, { overview: 'A generic thriller.' }, 'tmdb_discover');
  const convergentScore = scoreSearchCandidate(convergent, canonical, reference);
  const genericScore = scoreSearchCandidate(generic, canonical, reference);
  assert.ok(convergentScore.convergenceScore > genericScore.convergenceScore);
  assert.ok(convergentScore.finalScore > genericScore.finalScore);
  assert.ok(convergentScore.matchScore - genericScore.matchScore >= 10,
    `${convergentScore.matchScore} vs ${genericScore.matchScore}`);
  const weightTotal = Object.values(ELICINE_RANKING_CONFIG.weights).reduce((sum, value) => sum + value, 0);
  assert.equal(weightTotal.toFixed(6), '1.000000');
});

test('the budget reports bounded telemetry', () => {
  const telemetry = {};
  applyResultBudget(decayingPool(30), intent({ knownTitles: ['Reference'] }), resolved(),
    { semanticIntentContext: semanticContext(INTENT_TYPES.SIMILAR_TO_TITLE), telemetry });
  assert.equal(telemetry.resultBudgetApplied, true);
  assert.equal(telemetry.resultBudgetShape, SEARCH_INTENT_SHAPES.SELECTION);
  assert.equal(telemetry.resultBudgetBucket, RESULT_BUDGET_BUCKETS.SIMILAR_TO_TITLE);
  assert.equal(telemetry.resultBudgetTarget, 12);
  assert.equal(telemetry.resultBudgetMinKeep, 8);
  assert.equal(telemetry.resultBudgetInputCount, 30);
  assert.equal(telemetry.resultBudgetOutputCount, 12);
});

test('the flag rolls the budget back exactly', () => {
  const pool = [ranked(1, 0.9), ranked(2, 0.8)];
  assert.equal(isResultBudgetEnabled({}), true);
  assert.equal(isResultBudgetEnabled({ [RESULT_BUDGET_FLAG]: 'false' }), false);
  assert.equal(applyResultBudget(pool, intent(), resolved(), { env: { [RESULT_BUDGET_FLAG]: 'false' } }), pool);
});

test('the canonical pipeline applies the budget after diversification', async () => {
  const row = (id, extra) => ({ id, media_type: 'movie', title: `Candidate ${id}`,
    original_title: `Candidate ${id}`, overview: 'A story.', genre_ids: [18], vote_average: 7,
    vote_count: 1000, popularity: 20, release_date: '2020-01-01', original_language: 'en', ...extra });
  const telemetry = {};
  const results = await orchestrateCandidateRetrieval({
    orchestration: { canonicalIntent: intent({ genres: ['Drama'], themes: ['memory'] }),
      resolvedIntentContext: resolved() },
    services: { legacy: async () => [row(1, { themes: ['memory'] }), row(2, {}), row(3, {})] },
    context: { telemetry, semanticIntentContext: semanticContext(INTENT_TYPES.MOOD_SEARCH) },
    env: { ELICINE_RANKING_ENABLED: 'true' }
  });
  assert.equal(telemetry.resultBudgetApplied, true);
  assert.ok(results.length >= 1);
  assert.ok(results.length <= RESULT_BUDGETS[telemetry.resultBudgetBucket].target);
});
