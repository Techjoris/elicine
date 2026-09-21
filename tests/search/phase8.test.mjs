import assert from 'node:assert/strict';
import test from 'node:test';
import qualityCorpus from './quality-phase5.json' with { type: 'json' };
import { enrichWithBadges } from '../../api/search.js';
import { mergeCandidates, toLegacyRankingCandidate, toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import {
  ELICINE_RANKING_CONFIG, ELICINE_RANKING_FLAG, isElicineRankingEnabled,
  rankSearchCandidates, scoreSearchCandidate, toElicineRankedResult
} from '../../src/search/searchRanker.js';
import { extractReliableSemanticExclusions, filterStrictCandidates } from '../../src/search/strictConstraintFilter.js';
import { tmdbGenreIds } from '../../src/search/tmdbRetrievalParams.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';

const raw = (id, type = 'movie', extra = {}) => ({
  id, media_type: type, title: `Candidate ${id}`, original_title: `Original ${id}`,
  overview: 'A grounded dramatic story.', genre_ids: [18], vote_average: 7,
  vote_count: 1000, popularity: 20,
  release_date: type === 'movie' ? '2021-01-01' : undefined,
  first_air_date: type === 'tv' ? '2021-01-01' : undefined,
  original_language: 'en', ...extra
});
const candidate = (id, type = 'movie', extra = {}, source = 'legacy', signals = {}) =>
  toRetrievalCandidate(raw(id, type, extra), source, signals);
const multiSource = (id, type, extra, sources) => mergeCandidates(sources.map(({ source, signals = {} }) =>
  candidate(id, type, extra, source, signals))).candidates[0];
const intent = input => createCanonicalIntent(input);
const enabled = { [ELICINE_RANKING_FLAG]: 'true' };
const context = resolvedTitles => ({ resolvedTitles, unresolvedTitles: [], metrics: {} });

test('ranking weights are centralized, normalized and flag rollback is exact', () => {
  const total = Object.values(ELICINE_RANKING_CONFIG.weights).reduce((sum, value) => sum + value, 0);
  assert.equal(Number(total.toFixed(6)), 1);
  assert.equal(isElicineRankingEnabled({}), true);
  assert.equal(isElicineRankingEnabled(enabled), true);
  assert.equal(isElicineRankingEnabled({ [ELICINE_RANKING_FLAG]: 'false' }), false);
  const pool = [candidate(2), candidate(1)];
  assert.equal(rankSearchCandidates(pool, intent(), context([]), { enabled: false }), pool);
});

test('all components and final score stay in 0..1 and public match derives from finalScore', () => {
  const canonical = intent({ genres: ['Thriller'], themes: ['memory'], moods: ['dark'], keywords: ['identity'],
    knownTitles: ['Reference'], yearMin: 2015, languages: ['en'], countries: ['US'] });
  const resolved = context([{ tmdbId: 99, mediaType: 'movie', canonicalTitle: 'Reference', genreIds: [53] }]);
  const item = multiSource(1, 'movie', {
    genre_ids: [53], overview: 'A dark story about memory and identity.', themes: ['memory'], moods: ['dark'],
    keywords: ['identity'], release_date: '2022-01-01', original_language: 'en',
    production_countries: [{ iso_3166_1: 'US' }], vote_average: 8.2, vote_count: 40000, popularity: 120
  }, [{ source: 'tmdb_recommendations', signals: { seedTmdbId: 99 } },
    { source: 'supabase_vector', signals: { sourceScore: 0.91 } }]);
  const score = scoreSearchCandidate(item, canonical, resolved);
  for (const [name, value] of Object.entries(score)) {
    if (name === 'matchScore') continue;
    assert.ok(value >= 0 && value <= 1, `${name}=${value}`);
  }
  assert.equal(score.matchScore, Math.round(score.finalScore * 100));
  const publicResult = toElicineRankedResult(rankSearchCandidates([item], canonical, resolved, { enabled: true })[0]);
  assert.equal(publicResult.match_rate, score.matchScore);
  for (const field of ['ranking', 'sources', 'retrievalSignals', 'constraintData']) assert.equal(publicResult[field], undefined);
});

test('intent relevance dominates popularity and quality signals', () => {
  const canonical = intent({ genres: ['Thriller'], themes: ['psychological'], moods: ['dark'], keywords: ['memory'] });
  const relevant = candidate(1, 'movie', { genre_ids: [53], overview: 'A dark psychological mystery about memory.',
    themes: ['psychological'], moods: ['dark'], keywords: ['memory'], vote_average: 7.2, vote_count: 800, popularity: 8 });
  const popularOffIntent = candidate(2, 'movie', { genre_ids: [35], overview: 'A broad sunny comedy.',
    vote_average: 8.8, vote_count: 80000, popularity: 1000 }, 'tmdb_discover');
  const ranked = rankSearchCandidates([popularOffIntent, relevant], canonical, context([]), { enabled: true });
  assert.equal(ranked[0].tmdbId, 1);
  assert.ok(ranked[0].ranking.intentScore > ranked[1].ranking.intentScore);
});

test('Bayesian quality does not let 9.5 with three votes beat 8.2 with forty thousand', () => {
  const tiny = scoreSearchCandidate(candidate(1, 'movie', { vote_average: 9.5, vote_count: 3 }), intent(), context([]));
  const established = scoreSearchCandidate(candidate(2, 'movie', { vote_average: 8.2, vote_count: 40000 }), intent(), context([]));
  assert.ok(established.qualityScore > tiny.qualityScore);
});

test('multi-source is a bounded positive signal and cannot overpower intent', () => {
  const canonical = intent({ genres: ['War'], themes: ['aviation'] });
  const oneSource = candidate(1, 'movie', { genre_ids: [10752], overview: 'Military aviation pilots.', themes: ['aviation'] });
  const sameMulti = multiSource(2, 'movie', { genre_ids: [10752], overview: 'Military aviation pilots.', themes: ['aviation'] },
    [{ source: 'tmdb_discover' }, { source: 'tmdb_recommendations' }, { source: 'supabase_vector', signals: { sourceScore: 0.8 } }]);
  const offIntentMulti = multiSource(3, 'movie', { genre_ids: [35], overview: 'A romantic comedy.' },
    [{ source: 'tmdb_discover' }, { source: 'tmdb_recommendations' }, { source: 'supabase_vector', signals: { sourceScore: 0.4 } }]);
  const ranked = rankSearchCandidates([offIntentMulti, oneSource, sameMulti], canonical, context([]), { enabled: true });
  assert.equal(ranked[0].tmdbId, 2);
  assert.ok(ranked.find(item => item.tmdbId === 2).ranking.sourceConfidenceScore >
    ranked.find(item => item.tmdbId === 1).ranking.sourceConfidenceScore);
  assert.notEqual(ranked[0].tmdbId, 3);
});

test('resolved knownTitles reward recommendations/similar but not the reference itself', () => {
  const canonical = intent({ genres: ['Thriller'], knownTitles: ['Gone Girl'] });
  const resolved = context([{ tmdbId: 210577, mediaType: 'movie', canonicalTitle: 'Gone Girl',
    originalTitle: 'Gone Girl', genreIds: [53] }]);
  const self = candidate(210577, 'movie', { title: 'Gone Girl', genre_ids: [53], vote_average: 8.1, vote_count: 50000 }, 'tmdb_search');
  const recommendation = candidate(2, 'movie', { genre_ids: [53], overview: 'A tense mystery.' },
    'tmdb_recommendations', { seedTmdbId: 210577 });
  const unrelated = candidate(3, 'movie', { genre_ids: [35], overview: 'A comedy.' }, 'tmdb_discover');
  const ranked = rankSearchCandidates([self, unrelated, recommendation], canonical, resolved, { enabled: true });
  assert.equal(ranked[0].tmdbId, 2);
  assert.equal(ranked.find(item => item.tmdbId === 210577).ranking.referenceScore, 0);
  assert.equal(ranked.find(item => item.tmdbId === 210577).ranking.titleScore, 0);
  assert.equal(ranked.find(item => item.tmdbId === 2).ranking.referenceScore, 1);
});

test('available reference themes and keywords contribute without network enrichment', () => {
  const canonical = intent({ knownTitles: ['Reference'] });
  const resolved = context([{ tmdbId: 99, mediaType: 'movie', canonicalTitle: 'Reference', genreIds: [],
    themes: ['memory'], keywords: ['identity'] }]);
  const close = candidate(1, 'movie', { themes: ['memory'], keywords: ['identity'], overview: 'Memory and identity.' });
  const far = candidate(2, 'movie', { overview: 'A sports comedy.' });
  const closeScore = scoreSearchCandidate(close, canonical, resolved);
  const farScore = scoreSearchCandidate(far, canonical, resolved);
  assert.ok(closeScore.referenceScore > farScore.referenceScore);
});

test('orchestrator applies unified ranking only when the feature flag is enabled', async () => {
  const canonical = intent({ genres: ['Thriller'], themes: ['psychological'] });
  const off = raw(1, 'movie', { genre_ids: [35], overview: 'A popular comedy.', popularity: 900 });
  const relevant = raw(2, 'movie', { genre_ids: [53], overview: 'A psychological thriller.', themes: ['psychological'] });
  const orchestration = { canonicalIntent: canonical, resolvedIntentContext: context([]) };
  const historical = await orchestrateCandidateRetrieval({ orchestration,
    services: { legacy: async () => [off, relevant] }, context: { telemetry: {} },
    env: { [ELICINE_RANKING_FLAG]: 'false' } });
  const ranked = await orchestrateCandidateRetrieval({ orchestration,
    services: { legacy: async () => [off, relevant] }, context: { telemetry: {} }, env: enabled });
  assert.equal(historical[0].tmdbId, 1);
  assert.equal(historical[0].ranking, undefined);
  assert.equal(ranked[0].tmdbId, 2);
  assert.ok(ranked[0].ranking);
});

test('ties are stable and use tmdbId after deterministic tie-breakers', () => {
  const canonical = intent({ genres: ['Drama'] });
  const first = candidate(20, 'movie', { genre_ids: [18] });
  const second = candidate(10, 'movie', { genre_ids: [18] });
  const a = rankSearchCandidates([first, second], canonical, context([]), { enabled: true }).map(item => item.tmdbId);
  const b = rankSearchCandidates([second, first], canonical, context([]), { enabled: true }).map(item => item.tmdbId);
  assert.deepEqual(a, [10, 20]);
  assert.deepEqual(b, a);
});

test('modern-war aviation series rank above generic war series', () => {
  const canonical = intent({ mediaType: 'tv', genres: ['War'], themes: ['guerre moderne', 'aviation militaire', 'avions de combat'] });
  const aviation = candidate(1, 'tv', { genre_ids: [10768], overview: 'Modern warfare led by fighter jet pilots.',
    themes: ['guerre moderne', 'aviation militaire', 'avions de combat'] }, 'supabase_vector', { sourceScore: 0.92 });
  const generic = candidate(2, 'tv', { genre_ids: [10768], overview: 'A historical war drama.', popularity: 500 }, 'tmdb_discover');
  const ranked = rankSearchCandidates([generic, aviation], canonical, context([]), { enabled: true });
  assert.equal(ranked[0].tmdbId, 1);
});

test('psychological thriller exclusions run before atmospheric ranking', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['Thriller'], themes: ['psychological'], moods: ['dark'],
    semanticExclusions: ['murder', 'police_investigation'] });
  const pool = [
    candidate(1, 'movie', { title: 'Psychose', genre_ids: [53], overview: 'A dark psychological murder story.' }),
    candidate(2, 'movie', { title: 'Shining', genre_ids: [53], overview: 'Isolation and murder.' }),
    candidate(3, 'movie', { genre_ids: [53], overview: 'A dark psychological portrait of memory.', themes: ['psychological'], moods: ['dark'] }),
    candidate(4, 'movie', { genre_ids: [53], overview: 'A conventional chase thriller.' })
  ];
  const admissible = filterStrictCandidates(pool, canonical, { enabled: true }).candidates;
  const ranked = rankSearchCandidates(admissible, canonical, context([]), { enabled: true });
  assert.deepEqual(admissible.map(item => item.tmdbId), [3, 4]);
  assert.equal(ranked[0].tmdbId, 3);
});

test('Gone Girl reference with no couple story rejects relationship metadata before ranking', () => {
  const exclusions = extractReliableSemanticExclusions('un film comme Gone Girl mais sans histoire de couple');
  assert.deepEqual(exclusions, ['relationship']);
  const canonical = intent({ genres: ['Thriller'], knownTitles: ['Gone Girl'], semanticExclusions: exclusions });
  const resolved = context([{ tmdbId: 210577, mediaType: 'movie', canonicalTitle: 'Gone Girl', genreIds: [53] }]);
  const pool = [
    candidate(1, 'movie', { genre_ids: [53], overview: 'A mystery centered on a troubled couple relationship.' }),
    candidate(2, 'movie', { genre_ids: [53], overview: 'A tense identity mystery without romantic stakes.' },
      'tmdb_recommendations', { seedTmdbId: 210577 })
  ];
  const admissible = filterStrictCandidates(pool, canonical, { enabled: true }).candidates;
  const ranked = rankSearchCandidates(admissible, canonical, resolved, { enabled: true });
  assert.deepEqual(ranked.map(item => item.tmdbId), [2]);
});

test('recent action series similar to Mindhunter receives reference, theme and year priority', () => {
  const canonical = intent({ mediaType: 'tv', genres: ['Crime'], themes: ['action'], knownTitles: ['Mindhunter'], yearMin: 2018 });
  const resolved = context([{ tmdbId: 67744, mediaType: 'tv', canonicalTitle: 'Mindhunter', genreIds: [80] }]);
  const recentAction = candidate(1, 'tv', { genre_ids: [80], first_air_date: '2023-01-01',
    overview: 'An action-heavy criminal hunt.', themes: ['action'] }, 'tmdb_recommendations', { seedTmdbId: 67744 });
  const olderSlow = candidate(2, 'tv', { genre_ids: [80], first_air_date: '2019-01-01',
    overview: 'A slow procedural drama.' }, 'tmdb_similar', { seedTmdbId: 67744 });
  assert.equal(rankSearchCandidates([olderSlow, recentAction], canonical, resolved, { enabled: true })[0].tmdbId, 1);
});

test('Top Gun and Dunkirk combined proximity wins over one-reference proximity', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['War'], themes: ['aviation'], knownTitles: ['Top Gun', 'Dunkirk'] });
  const resolved = context([
    { tmdbId: 744, mediaType: 'movie', canonicalTitle: 'Top Gun', genreIds: [10752] },
    { tmdbId: 374720, mediaType: 'movie', canonicalTitle: 'Dunkirk', genreIds: [10752] }
  ]);
  const combined = multiSource(1, 'movie', { genre_ids: [10752], overview: 'War aviation and fighter pilots.', themes: ['aviation'] }, [
    { source: 'tmdb_recommendations', signals: { seedTmdbId: 744 } },
    { source: 'tmdb_similar', signals: { seedTmdbId: 374720 } },
    { source: 'supabase_vector', signals: { sourceScore: 0.9 } }
  ]);
  const oneSide = candidate(2, 'movie', { genre_ids: [10752], overview: 'A ground war drama.' },
    'tmdb_similar', { seedTmdbId: 374720 });
  assert.equal(rankSearchCandidates([oneSide, combined], canonical, resolved, { enabled: true })[0].tmdbId, 1);
});

test('melancholic memory science-fiction excludes aliens then ranks the intended atmosphere', () => {
  const canonical = intent({ genres: ['Science Fiction'], themes: ['memory'], moods: ['melancholic'], semanticExclusions: ['aliens'] });
  const pool = [
    candidate(1, 'movie', { genre_ids: [878], overview: 'Aliens invade Earth.' }),
    candidate(2, 'movie', { genre_ids: [878], overview: 'A melancholic exploration of memory.', themes: ['memory'], moods: ['melancholic'] }),
    candidate(3, 'movie', { genre_ids: [878], overview: 'A fast technological adventure.' })
  ];
  const admissible = filterStrictCandidates(pool, canonical, { enabled: true }).candidates;
  const ranked = rankSearchCandidates(admissible, canonical, context([]), { enabled: true });
  assert.deepEqual(ranked.map(item => item.tmdbId), [2, 3]);
});

test('recent short French comedy constraints precede genre ranking', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['Comedy'], yearMin: 2021, runtimeMax: 105,
    languages: ['fr'], countries: ['FR'] });
  const pool = [
    candidate(1, 'movie', { genre_ids: [35], release_date: '2023-01-01', runtime: 100,
      original_language: 'fr', production_countries: [{ iso_3166_1: 'FR' }] }),
    candidate(2, 'movie', { genre_ids: [35], release_date: '2022-01-01', runtime: 120,
      original_language: 'fr', production_countries: [{ iso_3166_1: 'FR' }] }),
    candidate(3, 'movie', { genre_ids: [18], release_date: '2024-01-01', runtime: 95,
      original_language: 'fr', production_countries: [{ iso_3166_1: 'FR' }], popularity: 900 })
  ];
  const admissible = filterStrictCandidates(pool, canonical, { enabled: true }).candidates;
  const ranked = rankSearchCandidates(admissible, canonical, context([]), { enabled: true });
  assert.deepEqual(admissible.map(item => item.tmdbId), [1, 3]);
  assert.equal(ranked[0].tmdbId, 1);
});

test('ranking telemetry is aggregate-only and contains no raw query', () => {
  const telemetry = {};
  const canonical = intent({ genres: ['Drama'] });
  rankSearchCandidates([candidate(1, 'movie', { genre_ids: [18] }), candidate(2, 'movie', { genre_ids: [18] })],
    canonical, context([]), { telemetry, enabled: true });
  assert.equal(telemetry.rankingAttempted, true);
  assert.equal(telemetry.rankingCandidateCount, 2);
  assert.ok(telemetry.rankingTopScore >= telemetry.rankingAverageScore);
  assert.equal(typeof telemetry.rankingDurationMs, 'number');
  assert.deepEqual(Object.keys(telemetry).sort(), ['rankingAttempted', 'rankingAverageScore',
    'rankingCandidateCount', 'rankingDurationMs', 'rankingTopScore'].sort());
});

test('targeted quality-corpus comparison measures intent position, off-topic top and stability', () => {
  const metrics = [];
  for (const [index, entry] of qualityCorpus.entries()) {
    const genreId = tmdbGenreIds(entry.genres || [], entry.mediaType)[0];
    const offGenreId = genreId === 35 ? 18 : 35;
    const canonical = intent({ ...entry, knownTitles: entry.seeds.map(seed => seed.title) });
    const resolved = context(entry.seeds.map(seed => ({ tmdbId: seed.id, mediaType: seed.type,
      canonicalTitle: seed.title, originalTitle: seed.title, genreIds: genreId ? [genreId] : [] })));
    const relevantRaw = raw(1000 + index, entry.mediaType, { title: `Relevant ${entry.id}`,
      genre_ids: genreId ? [genreId] : [], overview: [...(entry.themes || []), ...(entry.moods || []),
        'relevant intent'].join(' '), themes: entry.themes || [], moods: entry.moods || [],
      original_language: entry.languages?.[0] || 'en', vote_average: 7.4, vote_count: 1500, popularity: 20 });
    const offRaw = raw(2000 + index, entry.mediaType, { title: `Popular off-topic ${entry.id}`,
      genre_ids: [offGenreId], overview: 'Unrelated broad entertainment.', vote_average: 8.5,
      vote_count: 50000, popularity: 900 });
    const legacy = enrichWithBadges([offRaw, relevantRaw], [], 'Legacy', entry.query);
    const relevant = toRetrievalCandidate(relevantRaw, entry.seeds.length ? 'tmdb_recommendations' : 'tmdb_discover',
      entry.seeds.length ? { seedTmdbId: entry.seeds[0].id } : {});
    const off = toRetrievalCandidate(offRaw, 'legacy');
    const ranked = rankSearchCandidates([off, relevant], canonical, resolved, { enabled: true });
    const stable = rankSearchCandidates([relevant, off], canonical, resolved, { enabled: true });
    metrics.push({ id: entry.id,
      legacyRelevantPosition: legacy.findIndex(item => item.id === relevantRaw.id) + 1,
      elicineRelevantPosition: ranked.findIndex(item => item.tmdbId === relevantRaw.id) + 1,
      legacyOffTopicTop: !legacy[0].genre_ids.includes(genreId),
      elicineOffTopicTop: !ranked[0].genreIds.includes(genreId),
      legacyOffTopicCount: legacy.filter(item => !item.genre_ids.includes(genreId)).length,
      elicineOffTopicCount: ranked.filter(item => !item.genreIds.includes(genreId)).length,
      stable: ranked.map(item => item.tmdbId).join(',') === stable.map(item => item.tmdbId).join(',') });
  }
  assert.ok(metrics.every(item => item.elicineRelevantPosition <= item.legacyRelevantPosition));
  assert.ok(metrics.every(item => !item.elicineOffTopicTop && item.stable));
  console.log('PHASE8_COMPARISON', JSON.stringify(metrics));
});
