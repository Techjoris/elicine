/**
 * Narrative candidate channel (the LLM proposal role restored from the 16-19/09
 * engine). Every case runs on fixtures with injected providers: no network, no
 * real provider key and no database.
 *
 * The contract under test is asymmetric on purpose: the model may propose, and
 * only the catalogue may confirm, and only the deterministic ranking may decide.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent as intent } from '../../src/types/canonicalIntent.runtime.js';
import { hybridRetrieve, RETRIEVAL_LIMITS } from '../../src/search/hybridRetriever.js';
import { toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { ELICINE_RANKING_CONFIG, rankSearchCandidates, scoreSearchCandidate } from '../../src/search/searchRanker.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import {
  buildNarrativeCandidateMessages, interpretNarrativeCandidates, isLlmCandidateChannelEnabled,
  LLM_CANDIDATE_CHANNEL_FLAG, NARRATIVE_CANDIDATE_LIMIT, parseNarrativeCandidates
} from '../../src/search/narrativeCandidateInterpreter.js';
import { pickBestTitleHit, resolveNarrativeCandidates } from '../../src/search/retrievalServices.js';

const row = (id, media_type = 'movie', extra = {}) => ({ id, media_type, title: `Fixture ${id}`,
  original_title: `Fixture ${id}`, poster_path: '/fixture.jpg', vote_count: 900, vote_average: 7.4,
  overview: 'A grounded story about a described journey.', genre_ids: [18],
  release_date: media_type === 'movie' ? '2015-01-01' : undefined,
  first_air_date: media_type === 'tv' ? '2015-01-01' : undefined, original_language: 'en', ...extra });

const proposal = (candidates, overrides = {}) => ({ path: 'primary', reason: null, provider: 'DeepSeek',
  providerId: 'deepseek', model: 'deepseek-chat', candidates, attempts: [], ...overrides });

const FULL_ENV = Object.freeze({ HYBRID_RETRIEVAL_ENABLED: 'true', STRICT_CONSTRAINT_FILTER_ENABLED: 'true',
  ELICINE_RANKING_ENABLED: 'true', DIVERSIFIED_RANKING_ENABLED: 'true', RESULT_BUDGET_ENABLED: 'true' });

test('the channel has an exact flag rollback', () => {
  assert.equal(isLlmCandidateChannelEnabled({}), true);
  assert.equal(isLlmCandidateChannelEnabled({ [LLM_CANDIDATE_CHANNEL_FLAG]: 'true' }), true);
  assert.equal(isLlmCandidateChannelEnabled({ [LLM_CANDIDATE_CHANNEL_FLAG]: 'false' }), false);
});

test('the proposal prompt carries the catalogue role, the media type and the exclusions', () => {
  const films = buildNarrativeCandidateMessages('un film pour pleurer un bon coup', 'Films');
  assert.equal(films.length, 2);
  assert.match(films[0].content, /encyclopédie universelle du cinéma/);
  assert.match(films[0].content, /racontent VÉRITABLEMENT cette histoire/);
  assert.match(films[1].content, /EXCLUSIVEMENT des films/);
  assert.match(buildNarrativeCandidateMessages('une série policière', 'Séries TV')[1].content,
    /EXCLUSIVEMENT des séries télévisées/);
  const undirected = buildNarrativeCandidateMessages('un braquage', 'Tous')[1].content;
  assert.doesNotMatch(undirected, /EXCLUSIVEMENT/);
  const grounded = buildNarrativeCandidateMessages('un braquage', 'Tous', { semanticContext: {
    semanticConcepts: ['heist', 'space station'], negativeConcepts: ['superhero'], styleReferences: ['Heat'] } })
    [1].content;
  assert.match(grounded, /heist, space station/);
  assert.match(grounded, /EXCLUS.*superhero/s);
  assert.match(grounded, /Heat/);
});

test('the proposal parser is strict, tolerant, deduplicated and bounded', () => {
  const payload = { atmosphere_summary: 'Ambiance', media_type: 'movie', candidates: [
    { title: 'Alpha', release_year: 2001, type: 'movie', reason: 'reason one' },
    { title: 'alpha' },
    ' Beta ',
    { name: 'Gamma', type: 'serie', release_year: 12 },
    { reason: 'no title' },
    ...Array.from({ length: 12 }, (_, index) => ({ title: `Extra ${index}` }))
  ] };
  const parsed = parseNarrativeCandidates('```json\n' + JSON.stringify(payload) + '\n```');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.atmosphereSummary, 'Ambiance');
  assert.equal(parsed.mediaType, 'movie');
  assert.deepEqual(parsed.candidates.slice(0, 3), [
    { title: 'Alpha', releaseYear: 2001, type: 'movie', reason: 'reason one' },
    { title: 'Beta', releaseYear: null, type: null, reason: '' },
    { title: 'Gamma', releaseYear: null, type: 'tv', reason: '' }
  ]);
  assert.equal(parsed.candidates.length, NARRATIVE_CANDIDATE_LIMIT);
  for (const invalid of ['', 'no json at all', '{"candidates":[]}', '{', null, undefined]) {
    const rejected = parseNarrativeCandidates(invalid);
    assert.equal(rejected.valid, false, String(invalid));
    assert.equal(rejected.reason, 'invalid_response');
    assert.deepEqual(rejected.candidates, []);
  }
});

test('title re-resolution prefers the exact title, then the stated year, and refuses a poster-less hit', () => {
  const hits = [
    { id: 1, title: 'Heat Wave', media_type: 'movie', poster_path: '/a.jpg', vote_count: 9000, release_date: '2015-01-01' },
    { id: 2, title: 'Heat', media_type: 'movie', poster_path: '/b.jpg', vote_count: 10, release_date: '1995-01-01' },
    { id: 3, title: 'Heat', media_type: 'movie', vote_count: 99999, release_date: '1995-01-01' }
  ];
  assert.equal(pickBestTitleHit(hits, 'Heat').id, 2);
  assert.equal(pickBestTitleHit(hits, 'Heat', 1995).id, 2);
  assert.equal(pickBestTitleHit([row(3, 'movie', { poster_path: null, title: 'Heat' })], 'Heat'), null);
  assert.equal(pickBestTitleHit([], 'Heat'), null);
  const dated = [
    { id: 4, title: 'Heat', media_type: 'movie', poster_path: '/c.jpg', vote_count: 10, release_date: '1995-01-01' },
    { id: 5, title: 'Heat', media_type: 'movie', poster_path: '/d.jpg', vote_count: 5000, release_date: '2020-01-01' }
  ];
  assert.equal(pickBestTitleHit(dated, 'Heat', 1995).id, 4);
  assert.equal(pickBestTitleHit(dated, 'Heat').id, 5);
});

test('an unconfirmable proposal never reaches the pool and fails soft', async () => {
  const client = { search: async title => (title === 'Known' ? [row(11)] : []) };
  const resolved = await resolveNarrativeCandidates([
    { title: 'Invented', releaseYear: null, type: null, reason: '' },
    { title: 'Known', releaseYear: null, type: null, reason: 'because' }
  ], client, { limit: 6 });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, 11);
  assert.equal(resolved[0].llm_rank, 2);
  assert.equal(resolved[0].llm_reason, 'because');
  assert.deepEqual(await resolveNarrativeCandidates([], client), []);
  const broken = { search: async () => { throw new Error('TMDB_UNAVAILABLE'); } };
  assert.deepEqual(await resolveNarrativeCandidates([{ title: 'Known' }], broken, { limit: 6 }), []);
  const seen = [];
  await resolveNarrativeCandidates(Array.from({ length: 12 }, (_, index) => ({ title: `T${index}` })),
    { search: async title => { seen.push(title); return []; } }, { limit: 6 });
  assert.equal(seen.length, 6);
});

test('without proposals the channel is inert: no source, no call, identical pool', async () => {
  const calls = [];
  const services = { discover: async type => { calls.push(type); return [row(type === 'tv' ? 2 : 1, type)]; },
    narrativeCandidates: async () => { throw new Error('MUST_NOT_RUN'); } };
  const without = await hybridRetrieve({ intent: intent({ genres: ['Drama'] }), services, resolvedContext: {},
    context: { telemetry: {} } });
  assert.deepEqual(calls, ['movie', 'tv']);
  calls.length = 0;
  const empty = await hybridRetrieve({ intent: intent({ genres: ['Drama'] }), services, resolvedContext: {},
    context: { telemetry: {}, narrativeCandidates: proposal([]) } });
  assert.deepEqual(without.map(candidate => `${candidate.mediaType}:${candidate.tmdbId}`),
    empty.map(candidate => `${candidate.mediaType}:${candidate.tmdbId}`));
  assert.equal(without.some(candidate => candidate.sources.includes('llm_candidates')), false);
  assert.deepEqual(calls, ['movie', 'tv']);
});

test('the proposal joins the pool as one more source and carries its rank and verdict', async () => {
  const telemetry = {};
  const services = {
    discover: async type => [row(type === 'tv' ? 2 : 1, type)],
    narrativeCandidates: async (candidates, { limit }) => {
      assert.equal(limit, RETRIEVAL_LIMITS.llmCandidates);
      return candidates.map((item, index) => ({ ...row(30 + index, item.type || 'movie'),
        llm_rank: index + 1, llm_reason: item.reason }));
    }
  };
  const pool = await hybridRetrieve({ intent: intent({ mediaType: 'movie', genres: ['Drama'] }), services,
    resolvedContext: {}, context: { telemetry, narrativeCandidates: proposal([
      { title: 'Proposed A', type: 'movie', reason: 'A grounded story about a described journey.' },
      { title: 'Proposed B', type: 'movie', reason: 'Nothing to do with the intent.' }
    ]) } });
  const proposed = pool.filter(candidate => candidate.sources.includes('llm_candidates'));
  assert.equal(proposed.length, 2);
  const first = proposed.find(candidate => candidate.tmdbId === 30);
  const signal = first.retrievalSignals.find(item => item.source === 'llm_candidates');
  assert.equal(signal.narrativeCandidateRank, 1);
  assert.equal(signal.narrativeCandidateReason, 'A grounded story about a described journey.');
  assert.equal(telemetry.retrievalLlmCandidatesCount, 2);
  assert.equal(telemetry.retrievalSourceErrorCount, 0);
});

test('a series proposal is dropped on a film-only intent', async () => {
  const services = { narrativeCandidates: async candidates => candidates.map((item, index) =>
    ({ ...row(40 + index, item.type), llm_rank: index + 1, llm_reason: item.reason })) };
  const pool = await hybridRetrieve({ intent: intent({ mediaType: 'movie' }), services, resolvedContext: {},
    context: { telemetry: {}, narrativeCandidates: proposal([
      { title: 'Film', type: 'movie' }, { title: 'Series', type: 'tv' }]) } });
  assert.deepEqual(pool.map(candidate => `${candidate.mediaType}:${candidate.tmdbId}`), ['movie:40']);
});

test('the proposal score promotes a candidate without touching the others or the documented weights', () => {
  const canonical = intent({ genres: ['Drama'], themes: ['a described journey'] });
  const resolved = { resolvedTitles: [], resolvedPeople: [], requestedTitles: [] };
  const plain = toRetrievalCandidate(row(1), 'tmdb_discover', { sourceRank: 1 });
  const proposed = toRetrievalCandidate(row(2), 'llm_candidates', { sourceRank: 1,
    narrativeCandidateRank: 1, narrativeCandidateReason: 'A grounded story about a described journey.' });
  const vague = toRetrievalCandidate(row(3), 'llm_candidates', { sourceRank: 1,
    narrativeCandidateRank: 2, narrativeCandidateReason: 'Totally unrelated wording.' });
  const plainScore = scoreSearchCandidate(plain, canonical, resolved);
  const proposedScore = scoreSearchCandidate(proposed, canonical, resolved);
  const vagueScore = scoreSearchCandidate(vague, canonical, resolved);
  assert.equal(plainScore.narrativeCandidateScore, 0);
  assert.ok(proposedScore.narrativeCandidateScore > vagueScore.narrativeCandidateScore);
  assert.ok(proposedScore.convergenceScore > vagueScore.convergenceScore);
  assert.ok(proposedScore.finalScore > plainScore.finalScore);
  const ranked = rankSearchCandidates([vague, plain, proposed], canonical, resolved, { telemetry: {} });
  assert.equal(ranked[0].tmdbId, 2);
  assert.equal(ranked[1].tmdbId, 3);
  const weightTotal = Object.values(ELICINE_RANKING_CONFIG.weights).reduce((sum, value) => sum + value, 0);
  assert.equal(weightTotal.toFixed(6), '1.000000');
});

test('an unusable provider chain yields an explicit reason and never an invented list', async () => {
  const unavailable = await interpretNarrativeCandidates({ query: 'un film sur le mariage et la mort',
    targetMediaType: 'Films', keys: {}, env: {}, fetchImpl: async () => { throw new Error('MUST_NOT_CALL'); } });
  assert.equal(unavailable.path, 'unavailable');
  assert.equal(unavailable.reason, 'unavailable');
  assert.deepEqual(unavailable.candidates, []);
  const fixture = { id: 'fixture', label: 'Fixture', primary: true, endpoints: ['https://fixture.test/v1/chat'],
    model: 'fixture-model', envModel: null, envKeys: ['FIXTURE_API_KEY'], requestKey: 'fixtureApiKey',
    jsonFormat: true, timeoutMs: 200 };
  const answered = await interpretNarrativeCandidates({ query: 'q', targetMediaType: 'Films', keys: {},
    env: { FIXTURE_API_KEY: 'fixture-key' }, providers: [fixture],
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: {
      content: JSON.stringify({ atmosphere_summary: 'Ambiance', media_type: 'movie',
        candidates: [{ title: 'Les Noces funèbres', type: 'movie', reason: 'mariage et mort' }] }) } }] }) }) });
  assert.equal(answered.path, 'primary');
  assert.equal(answered.providerId, 'fixture');
  assert.deepEqual(answered.candidates.map(candidate => candidate.title), ['Les Noces funèbres']);
});

test('the retrieval orchestration forwards the channel end to end', async () => {
  const telemetry = {};
  const results = await orchestrateCandidateRetrieval({
    orchestration: { canonicalIntent: intent({ mediaType: 'movie', genres: ['Drama'], themes: ['a described journey'] }),
      resolvedIntentContext: { resolvedTitles: [], requestedTitles: [], resolvedPeople: [] } },
    services: { narrativeCandidates: async candidates => candidates.map((item, index) =>
      ({ ...row(50 + index, 'movie'), llm_rank: index + 1, llm_reason: item.reason })) },
    context: { telemetry, narrativeCandidates: proposal([{ title: 'Proposed', type: 'movie',
      reason: 'A grounded story about a described journey.' }]) },
    env: FULL_ENV
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].tmdbId, 50);
  assert.ok(results[0].ranking.narrativeCandidateScore > 0);
  assert.equal(telemetry.retrievalLlmCandidatesCount, 1);
});
