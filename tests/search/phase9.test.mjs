import assert from 'node:assert/strict';
import test from 'node:test';
import { toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import {
  DIVERSIFICATION_CONFIG, DIVERSIFIED_RANKING_FLAG, diversifyRankedCandidates,
  isDiversifiedRankingEnabled
} from '../../src/search/resultDiversifier.js';
import { toElicineRankedResult } from '../../src/search/searchRanker.js';
import { filterStrictCandidates } from '../../src/search/strictConstraintFilter.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';

const enabled = { [DIVERSIFIED_RANKING_FLAG]: 'true' };
const intent = input => createCanonicalIntent(input);
const context = resolvedTitles => ({ resolvedTitles, unresolvedTitles: [], metrics: {} });
const raw = (id, extra = {}, type = 'movie') => ({
  id, media_type: type, title: `Candidate ${id}`, original_title: `Candidate ${id}`,
  release_date: type === 'movie' ? '2022-01-01' : undefined,
  first_air_date: type === 'tv' ? '2022-01-01' : undefined,
  genre_ids: [18], vote_average: 7, vote_count: 1000, ...extra
});
const ranked = (id, score, extra = {}, type = 'movie', ranking = {}) => ({
  ...toRetrievalCandidate(raw(id, extra, type), 'legacy'),
  ranking: { finalScore: score, matchScore: Math.round(score * 100), referenceScore: 0, ...ranking }
});
const ids = candidates => candidates.map(candidate => candidate.tmdbId);

test('configuration is centralized and feature rollback preserves the exact Phase 8 array', () => {
  assert.equal(DIVERSIFICATION_CONFIG.windowSize, 20);
  assert.ok(Object.values(DIVERSIFICATION_CONFIG.penalties).every(value => value > 0 && value <= 0.08));
  assert.equal(isDiversifiedRankingEnabled({}), true);
  assert.equal(isDiversifiedRankingEnabled(enabled), true);
  assert.equal(isDiversifiedRankingEnabled({ [DIVERSIFIED_RANKING_FLAG]: 'false' }), false);
  const pool = [ranked(1, 0.9), ranked(2, 0.8)];
  assert.equal(diversifyRankedCandidates(pool, intent(), context([]), { enabled: false }), pool);
});

test('greedy order is deterministic and always preserves Phase 8 top 1', () => {
  const pool = [ranked(1, 0.95, { genre_ids: [18], themes: ['identity'] }),
    ranked(2, 0.9, { genre_ids: [18], themes: ['identity'] }),
    ranked(3, 0.88, { genre_ids: [35], themes: ['friendship'] })];
  const first = diversifyRankedCandidates(pool, intent(), context([]), { enabled: true });
  const second = diversifyRankedCandidates(pool, intent(), context([]), { enabled: true });
  assert.equal(first[0].tmdbId, 1);
  assert.deepEqual(ids(first), ids(second));
});

test('exact media identity duplicates are eliminated while movie and TV namespaces remain distinct', () => {
  const movie = ranked(1, 0.95);
  const duplicate = { ...movie };
  const tv = ranked(1, 0.85, {}, 'tv');
  const result = diversifyRankedCandidates([movie, duplicate, tv], intent(), context([]), { enabled: true });
  assert.deepEqual(result.map(candidate => `${candidate.mediaType}:${candidate.tmdbId}`), ['movie:1', 'tv:1']);
});

test('an explicit collection moderately diversifies franchise-heavy positions after top 1', () => {
  const pool = [ranked(1, 0.95, { belongs_to_collection: { id: 10, name: 'Saga' } }),
    ranked(2, 0.9, { belongs_to_collection: { id: 10, name: 'Saga' } }),
    ranked(3, 0.88, { belongs_to_collection: { id: 20, name: 'Other' } })];
  assert.deepEqual(ids(diversifyRankedCandidates(pool, intent(), context([]), { enabled: true })), [1, 3, 2]);
});

test('identical genre profiles are penalized without treating one shared genre as a duplicate', () => {
  const exact = [ranked(1, 0.95, { genre_ids: [18, 53] }), ranked(2, 0.9, { genre_ids: [18, 53] }),
    ranked(3, 0.88, { genre_ids: [18, 9648] })];
  assert.deepEqual(ids(diversifyRankedCandidates(exact, intent(), context([]), { enabled: true })), [1, 3, 2]);
});

test('identical themes are diversified but candidates with different themes retain relevance order', () => {
  const pool = [ranked(1, 0.95, { themes: ['memory', 'identity'] }),
    ranked(2, 0.9, { themes: ['memory', 'identity'] }),
    ranked(3, 0.88, { themes: ['grief', 'family'] })];
  assert.deepEqual(ids(diversifyRankedCandidates(pool, intent(), context([]), { enabled: true })), [1, 3, 2]);
});

test('same director is used only when existing structured metadata is available', () => {
  const pool = [ranked(1, 0.95, { director: 'Jane Doe' }), ranked(2, 0.9, { director: 'Jane Doe' }),
    ranked(3, 0.89, { director: 'John Roe' })];
  assert.deepEqual(ids(diversifyRankedCandidates(pool, intent(), context([]), { enabled: true })), [1, 3, 2]);
});

test('same normalized title and release year identifies a near-duplicate variant', () => {
  const pool = [ranked(1, 0.95, { title: 'The Work', original_title: 'Original Work', release_date: '2022-01-01' }),
    ranked(2, 0.9, { title: 'The Work — Alternate', original_title: 'Original Work', release_date: '2022-06-01' }),
    ranked(3, 0.85, { title: 'Different Work', original_title: 'Different Work' })];
  assert.deepEqual(ids(diversifyRankedCandidates(pool, intent(), context([]), { enabled: true })), [1, 3, 2]);
});

test('moderate capped penalties cannot displace a markedly more relevant candidate', () => {
  const common = { genre_ids: [18, 53], themes: ['memory', 'identity'], director: 'Jane Doe',
    belongs_to_collection: { id: 10, name: 'Saga' } };
  const pool = [ranked(1, 0.98, common), ranked(2, 0.9, common),
    ranked(3, 0.65, { genre_ids: [35], themes: ['friendship'], director: 'John Roe' })];
  assert.deepEqual(ids(diversifyRankedCandidates(pool, intent(), context([]), { enabled: true })), [1, 2, 3]);
});

test('different candidates keep Phase 8 relevance order', () => {
  const pool = [ranked(1, 0.94, { genre_ids: [18], themes: ['memory'] }),
    ranked(2, 0.91, { genre_ids: [35], themes: ['friendship'] }),
    ranked(3, 0.88, { genre_ids: [99], themes: ['music'] })];
  assert.deepEqual(ids(diversifyRankedCandidates(pool, intent(), context([]), { enabled: true })), [1, 2, 3]);
});

test('explicit varied intent modestly increases diversity pressure', () => {
  const common = { belongs_to_collection: { id: 10, name: 'Saga' } };
  const pool = [ranked(1, 0.95, common), ranked(2, 0.9, common), ranked(3, 0.845)];
  const ordinary = diversifyRankedCandidates(pool, intent(), context([]), { enabled: true });
  const varied = diversifyRankedCandidates(pool, intent({ themes: ['variés'] }), context([]), { enabled: true });
  assert.deepEqual(ids(ordinary), [1, 2, 3]);
  assert.deepEqual(ids(varied), [1, 3, 2]);
});

test('Avengers reference intent keeps directly relevant MCU works prioritized', () => {
  const canonical = intent({ knownTitles: ['Avengers: Doomsday'], themes: ['superhero'] });
  const resolved = context([{ tmdbId: 100, mediaType: 'movie', canonicalTitle: 'Avengers: Doomsday' }]);
  const mcu = { genre_ids: [28, 878], themes: ['superhero'], belongs_to_collection: { id: 86311, name: 'MCU' } };
  const pool = [ranked(1, 0.96, mcu, 'movie', { referenceScore: 1 }),
    ranked(2, 0.93, mcu, 'movie', { referenceScore: 0.92 }),
    ranked(3, 0.91, mcu, 'tv', { referenceScore: 0.85 }),
    ranked(4, 0.84, { genre_ids: [28], themes: ['unrelated action'] })];
  assert.deepEqual(ids(diversifyRankedCandidates(pool, canonical, resolved, { enabled: true })).slice(0, 3), [1, 2, 3]);
});

test('Phase 8 finalScore and public match remain unchanged and diversification internals do not leak', () => {
  const pool = [ranked(1, 0.93, { themes: ['memory'] }), ranked(2, 0.9, { themes: ['memory'] })];
  const result = diversifyRankedCandidates(pool, intent(), context([]), { enabled: true });
  assert.equal(result[1].ranking.finalScore, pool.find(candidate => candidate.tmdbId === result[1].tmdbId).ranking.finalScore);
  const publicResult = toElicineRankedResult(result[1]);
  assert.equal(publicResult.match_rate, result[1].ranking.matchScore);
  assert.equal(publicResult.diversifiedScore, undefined);
  assert.equal(publicResult.diversityData, undefined);
});

test('only the top 20 is reranked and the tail remains in Phase 8 order', () => {
  const pool = Array.from({ length: 24 }, (_, index) => ranked(index + 1, 0.99 - index * 0.01,
    { genre_ids: index < 20 ? [18] : [index], themes: index < 20 ? ['same'] : [`theme-${index}`] }));
  const result = diversifyRankedCandidates(pool, intent(), context([]), { enabled: true });
  assert.deepEqual(ids(result).slice(20), [21, 22, 23, 24]);
});

test('aggregate telemetry contains only the four Phase 9 fields', () => {
  const telemetry = {};
  diversifyRankedCandidates([ranked(1, 0.95), ranked(2, 0.9)], intent(), context([]),
    { enabled: true, telemetry });
  assert.equal(telemetry.diversificationAttempted, true);
  assert.equal(telemetry.diversificationCandidateCount, 2);
  assert.equal(typeof telemetry.diversificationReorderedCount, 'number');
  assert.equal(typeof telemetry.diversificationDurationMs, 'number');
  assert.deepEqual(Object.keys(telemetry).sort(), ['diversificationAttempted',
    'diversificationCandidateCount', 'diversificationDurationMs', 'diversificationReorderedCount'].sort());
});

test('canonical orchestrator runs diversification after Phase 8 ranking', async () => {
  const canonical = intent({ genres: ['Drama'], themes: ['memory'] });
  const telemetry = {};
  const result = await orchestrateCandidateRetrieval({
    orchestration: { canonicalIntent: canonical, resolvedIntentContext: context([]) },
    services: { legacy: async () => [raw(1, { genre_ids: [18], themes: ['memory'] }),
      raw(2, { genre_ids: [35], themes: ['friendship'] })] },
    context: { telemetry },
    env: { ELICINE_RANKING_ENABLED: 'true', [DIVERSIFIED_RANKING_FLAG]: 'true' }
  });
  assert.equal(telemetry.rankingAttempted, true);
  assert.equal(telemetry.diversificationAttempted, true);
  assert.ok(result.every(candidate => Number.isFinite(candidate.diversifiedScore)));
});

test('psychological-thriller exclusions remain removed before diversification', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['Thriller'], themes: ['psychological'],
    moods: ['dark'], semanticExclusions: ['murder', 'police_investigation'] });
  const pool = [ranked(1, 0.96, { genre_ids: [53], overview: 'A psychological murder investigation.' }),
    ranked(2, 0.92, { genre_ids: [53], overview: 'A dark psychological portrait.', themes: ['identity'] }),
    ranked(3, 0.9, { genre_ids: [53], overview: 'A dark psychological dream.', themes: ['memory'] })];
  const admissible = filterStrictCandidates(pool, canonical, { enabled: true }).candidates;
  const result = diversifyRankedCandidates(admissible, canonical, context([]), { enabled: true });
  assert.deepEqual(ids(result).sort(), [2, 3]);
});

test('modern-war aviation diversification preserves a TV-only relevant pool', () => {
  const canonical = intent({ mediaType: 'tv', genres: ['War'], themes: ['guerre moderne', 'avions de combat'] });
  const pool = [ranked(1, 0.96, { genre_ids: [10768], themes: ['guerre moderne', 'avions de combat'] }, 'tv'),
    ranked(2, 0.92, { genre_ids: [10768], themes: ['guerre moderne', 'aviation militaire'] }, 'tv'),
    ranked(3, 0.88, { genre_ids: [10768], themes: ['strategie militaire'] }, 'tv')];
  const result = diversifyRankedCandidates(pool, canonical, context([]), { enabled: true });
  assert.equal(result[0].tmdbId, 1);
  assert.ok(result.every(candidate => candidate.mediaType === 'tv'));
});

test('diversification is purely local and performs no fetch or provider callback', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls += 1; throw new Error('network forbidden'); };
  try {
    const result = diversifyRankedCandidates([ranked(1, 0.9), ranked(2, 0.8)], intent(), context([]), { enabled: true });
    assert.equal(result.length, 2);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
