import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent as intent } from '../../src/types/canonicalIntent.runtime.js';
import { hybridRetrieve, isHybridRetrievalEnabled } from '../../src/search/hybridRetriever.js';
import { mergeCandidates, toRetrievalCandidate, toLegacyRankingCandidate } from '../../src/search/retrievalCandidate.js';
import { discoverParams, keywordTerms, reliableKeywordId, tmdbGenreIds } from '../../src/search/tmdbRetrievalParams.js';
import { createTmdbRetrievalClient, createSupabaseLexicalSource, retrieveLegacyHints, TMDB_REQUEST_LIMIT } from '../../src/search/retrievalServices.js';
import { orchestrateSearch, orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import { resolveKnownTitles } from '../../src/search/entityResolver.js';

export const row = (id, media_type = 'movie', extra = {}) => ({ id, media_type, title: `Fixture ${id}`,
  original_title: `Original ${id}`, poster_path: '/fixture.jpg', vote_count: 900, vote_average: 7,
  genre_ids: [18], original_language: 'en', ...extra });
const run = (input = {}, services = {}, resolvedContext = {}, context = {}) => hybridRetrieve({ intent: intent(input), services, resolvedContext, context });

test('flag supports explicit activation and rollback', () => {
  assert.equal(isHybridRetrievalEnabled({}), true);
  assert.equal(isHybridRetrievalEnabled({ HYBRID_RETRIEVAL_ENABLED: 'true' }), true);
  assert.equal(isHybridRetrievalEnabled({ HYBRID_RETRIEVAL_ENABLED: 'false' }), false);
});
test('empty intent makes no vague Search/Discover/keyword request', async () => {
  let calls = 0;
  assert.deepEqual(await run({}, { search: () => ++calls, discover: () => ++calls, keyword: () => ++calls }), []);
  assert.equal(calls, 0);
});
for (const type of ['movie', 'tv', null]) test(`mediaType ${type}: Discover endpoints and strict candidate boundary`, async () => {
  const types = [];
  const candidates = await run({ mediaType: type, genres: ['Drama'] }, { discover: async t => {
    types.push(t); return [row(t === 'tv' ? 2 : 1, t), row(3, 'person')];
  }, legacy: async () => [row(10, 'movie'), row(10, 'tv')] });
  assert.deepEqual(types, type ? [type] : ['movie', 'tv']);
  assert.ok(candidates.every(c => ['movie', 'tv'].includes(c.mediaType) && (!type || c.mediaType === type)));
  assert.equal(candidates.length, type ? 2 : 4);
});
for (const [field, value, movieKey, tvKey, expected] of [
  ['yearMin', 2016, 'primary_release_date.gte', 'first_air_date.gte', '2016-01-01'],
  ['yearMax', 2025, 'primary_release_date.lte', 'first_air_date.lte', '2025-12-31'],
  ['runtimeMin', 40, 'with_runtime.gte', 'with_runtime.gte', 40],
  ['runtimeMax', 120, 'with_runtime.lte', 'with_runtime.lte', 120],
  ['minRating', 7.5, 'vote_average.gte', 'vote_average.gte', 7.5],
  ['adult', true, 'include_adult', 'include_adult', true],
  ['adult', false, 'include_adult', 'include_adult', false],
  ['languages', ['fr'], 'with_original_language', 'with_original_language', 'fr']
]) test(`Discover ${field}=${value}`, () => {
  const input = intent({ [field]: value });
  assert.equal(discoverParams(input, 'movie')[movieKey], expected);
  assert.equal(discoverParams(input, 'tv')[tvKey], expected);
});
test('genre mapping is typed, aliases deduplicated, unknown genres ignored', () => {
  assert.deepEqual(tmdbGenreIds(['Science-fiction', 'sf', 'War', 'Thriller', 'unknown'], 'movie'), [878, 10752, 53]);
  assert.deepEqual(tmdbGenreIds(['Science-fiction', 'sf', 'War', 'Thriller', 'unknown'], 'tv'), [10765, 10768]);
  assert.equal(discoverParams(intent({ moods: ['dark'] }), 'tv').with_genres, undefined);
});
test('multiple or unsupported languages do not silently invent an API filter', () => {
  for (const languages of [['fr', 'en'], ['eng']]) assert.equal(discoverParams(intent({ languages }), 'movie').with_original_language, undefined);
});
for (const type of ['movie', 'tv']) test(`resolved ${type} ID drives both seed endpoints without text search`, async () => {
  const calls = [];
  const seed = { tmdbId: 42, mediaType: type, inputTitle: 'Seed', canonicalTitle: 'Seed' };
  const candidates = await run({ mediaType: type, knownTitles: ['Seed'] }, {
    search() { assert.fail('resolved title must not be searched'); },
    similar: async s => { calls.push(['similar', s.tmdbId, s.mediaType]); return [row(5, type)]; },
    recommendations: async s => { calls.push(['recommendations', s.tmdbId, s.mediaType]); return [row(5, type)]; }
  }, { resolvedTitles: [seed] });
  assert.deepEqual(calls, [['similar', 42, type], ['recommendations', 42, type]]);
  assert.deepEqual(candidates[0].sources, ['tmdb_similar', 'tmdb_recommendations']);
  assert.equal(candidates[0].retrievalSignals[0].seedTmdbId, 42);
});
test('three unique compatible seeds maximum, duplicate ID discarded only within its type', async () => {
  const ids = [];
  const seeds = [1, 1, 2, 3, 4, 5].map(tmdbId => ({ tmdbId, mediaType: 'tv' }));
  seeds.unshift({ tmdbId: 99, mediaType: 'movie' });
  await run({ mediaType: 'tv' }, { similar: async seed => { ids.push(seed.tmdbId); return []; } }, { resolvedTitles: seeds });
  assert.deepEqual(ids, [1, 2, 3]);
});
test('unresolved titles use at most two Search calls, never moods or the whole query', async () => {
  const calls = [];
  const candidates = await run({ knownTitles: ['Unknown One', 'Unknown Two', 'Unknown Three'], moods: ['sad'] }, {
    search: async (title, type) => { calls.push([title, type]); return [row(1)]; }
  });
  assert.equal(calls.length, 2); assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].sources, ['tmdb_search']);
});
test('keywords exact-only, ambiguous IDs and weak matches ignored', () => {
  assert.equal(reliableKeywordId('fighter jet', [{ id: 1, name: 'Fighter Jet' }]), 1);
  assert.equal(reliableKeywordId('fighter jet', [{ id: 1, name: 'jet' }]), null);
  assert.equal(reliableKeywordId('war', [{ id: 1, name: 'war' }, { id: 2, name: 'war' }]), null);
  const expanded = keywordTerms(intent({ themes: ['avions de combat'], keywords: ['fighter jet'] }));
  assert.ok(expanded.includes('fighter aircraft')); assert.ok(expanded.includes('fighter jets'));
  assert.equal(new Set(expanded).size, expanded.length); assert.ok(expanded.length <= 8);
});
test('five distinct terms, three keyword IDs, only Discover waits for keywords', async () => {
  const calls = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const input = { mediaType: 'tv', keywords: ['one', 'two', 'three', 'four', 'five', 'six'] };
  const pending = run(input, {
    legacy: async () => { calls.push('legacy'); release(); return []; },
    keyword: async term => { await gate; calls.push(term); return [{ id: input.keywords.indexOf(term) + 1, name: term }]; },
    discover: async (type, params) => { assert.equal(params.with_keywords, '1|2|3'); return [row(8, type)]; }
  });
  await pending; assert.equal(calls.length, 6); assert.equal(calls[0], 'legacy');
});
test('all six sources, strict type filtering, provenance/signals union', async () => {
  const mixed = async () => [row(1, 'tv'), row(2, 'movie')];
  const candidates = await run({ mediaType: 'tv', knownTitles: ['Unknown'] },
    { search: mixed, discover: mixed, similar: mixed, recommendations: mixed, legacy: mixed, lexical: mixed },
    { resolvedTitles: [{ tmdbId: 99, mediaType: 'tv' }] });
  assert.equal(candidates.length, 1); assert.equal(candidates[0].sources.length, 6);
  assert.equal(candidates[0].retrievalSignals.length, 6);
});
test('dedup identity retains same ID and same title across movie and TV', () => {
  const candidates = [row(1, 'movie'), row(1, 'tv'), row(2, 'movie')].map(r => toRetrievalCandidate(r, 'legacy'));
  const merged = mergeCandidates([...candidates, ...candidates]);
  assert.equal(merged.afterDedup, 3); assert.equal(merged.candidates.length, 3);
});
test('priority is multi-source > seeded > discover > search > legacy; cap after dedup', () => {
  const candidates = Array.from({ length: 70 }, (_, i) => toRetrievalCandidate(row(i + 1), 'legacy', { sourceRank: i + 1 }));
  candidates.push(toRetrievalCandidate(row(70), 'tmdb_discover'), toRetrievalCandidate(row(71), 'tmdb_similar'),
    toRetrievalCandidate(row(72), 'tmdb_discover'), toRetrievalCandidate(row(73), 'tmdb_search'));
  const merged = mergeCandidates(candidates);
  assert.equal(merged.afterDedup, 73); assert.equal(merged.candidates.length, 50);
  assert.deepEqual(merged.candidates.slice(0, 4).map(c => c.tmdbId), [70, 71, 72, 73]);
});
test('error isolation and aggregate telemetry contain no query/provider exception', async () => {
  const telemetry = {};
  const candidates = await run({ mediaType: 'movie' }, { discover: () => { throw new Error('PRIVATE QUERY'); }, legacy: async () => [row(1)] }, {}, { telemetry });
  assert.equal(candidates.length, 1); assert.equal(telemetry.retrievalSourceErrorCount, 1);
  assert.equal(telemetry.hybridRetrievalSucceeded, true);
  assert.equal(JSON.stringify(telemetry).includes('PRIVATE'), false);
});
test('source timeout aborts and does not discard completed sources', async () => {
  let signal;
  const telemetry = {};
  const candidates = await run({ mediaType: 'tv' }, { discover: (type, params, options) => {
    signal = options.signal; return new Promise(() => {});
  }, legacy: async () => [row(2, 'tv')] }, {}, { telemetry, sourceTimeoutMs: 15 });
  assert.equal(signal.aborted, true); assert.equal(candidates.length, 1);
  assert.equal(telemetry.retrievalSourceErrors[0].code, 'TIMEOUT');
});
test('all source errors and empty pools are explicit, not crashes', async () => {
  const telemetry = {};
  const fail = async () => { throw new Error('fail'); };
  assert.deepEqual(await run({ mediaType: 'tv' }, { discover: fail, legacy: fail, lexical: fail }, {}, { telemetry }), []);
  assert.equal(telemetry.hybridRetrievalSucceeded, false); assert.equal(telemetry.retrievalSourceErrorCount, 3);
  assert.deepEqual(await run({ mediaType: 'tv' }, { discover: async () => [] }), []);
});
test('adapter preserves metadata without leaking sources, signals or arbitrary fields', () => {
  const candidate = toRetrievalCandidate(row(42, 'tv', { name: 'Show', first_air_date: '2020-01-01', secret: 'no' }), 'tmdb_discover');
  const legacy = toLegacyRankingCandidate(candidate);
  assert.equal(legacy.media_type, 'tv'); assert.equal(legacy.release_date, '2020-01-01');
  assert.equal(legacy.poster_path, 'https://image.tmdb.org/t/p/w500/fixture.jpg');
  for (const field of ['sources', 'retrievalSignals', 'metadata', 'secret']) assert.equal(legacy[field], undefined);
});
test('request cache shares pending URL, seed and Phase 4 entity with legacy without re-search', async () => {
  let calls = 0;
  const client = createTmdbRetrievalClient({ apiKey: 'fixture', fetchImpl: async () => {
    calls++; return { ok: true, json: async () => ({ results: [row(42, 'movie', { title: 'Seed' })] }) };
  } });
  const input = intent({ mediaType: 'movie', knownTitles: ['Seed'] });
  const resolved = await resolveKnownTitles(input, { searchCandidates: client.search });
  assert.equal(resolved.resolvedTitles[0].tmdbId, 42);
  const hints = await retrieveLegacyHints([{ title: 'Seed', type: 'movie', release_year: 2000 }], resolved, client);
  assert.equal(hints.length, 1); assert.equal(calls, 1);
  await Promise.all([client.search('Seed', 'movie'), client.search('Seed', 'movie')]);
  assert.equal(calls, 1);
  await Promise.all([client.similar(resolved.resolvedTitles[0]), client.similar(resolved.resolvedTitles[0])]);
  assert.equal(calls, 2);
});
test('failed URL also memoized; no duplicate failed network attempts', async () => {
  let calls = 0;
  const client = createTmdbRetrievalClient({ apiKey: 'fixture', fetchImpl: async () => { calls++; throw new Error('offline'); } });
  await Promise.allSettled([client.search('Title', 'tv'), client.search('Title', 'tv')]);
  assert.equal(calls, 1);
});
test('network deadline includes stalled JSON body and aborts', async () => {
  let signal;
  const client = createTmdbRetrievalClient({ apiKey: 'fixture', timeoutMs: 15, fetchImpl: async (url, options) => {
    signal = options.signal; return { ok: true, json: () => new Promise(() => {}) };
  } });
  await assert.rejects(client.search('Title', 'movie'), /RETRIEVAL_TIMEOUT/);
  assert.equal(signal.aborted, true);
});
test('absolute TMDB request budget is independent of result count', async () => {
  let calls = 0;
  const client = createTmdbRetrievalClient({ apiKey: 'fixture', fetchImpl: async () => {
    calls++; return { ok: true, json: async () => ({ results: [] }) };
  } });
  await Promise.allSettled(Array.from({ length: 50 }, (_, i) => client.search(`Title ${i}`, 'movie')));
  assert.equal(calls, TMDB_REQUEST_LIMIT);
});
test('Supabase lexical uses existing text columns, explicit TMDB identities and no RPC', async () => {
  const calls = [];
  const client = { from(table) {
    calls.push(table); const builder = { select() { return this; }, or(filter) {
      assert.match(filter, /overview.ilike/); assert.equal(filter.includes('genres.ilike'), false); return this;
    }, order() { return this; }, limit(n) { assert.equal(n, 16); return this; },
    abortSignal() { return Promise.resolve({ data: table === 'movies' ? [] : [row(1, 'movie', { tmdb_id: 1 }), { id: 2, title: 'Not a TMDB identity' }] }); } };
    return builder;
  } };
  assert.equal(createSupabaseLexicalSource(null), null);
  const candidates = await run({ keywords: ['detective'] }, { lexical: createSupabaseLexicalSource(client) });
  assert.deepEqual(calls, ['movies', 'movies_embeddings']); assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].sources, ['supabase_lexical']);
});
test('canonical fallback / disabled flag does not start hybrid providers or a second LLM', async () => {
  let calls = 0;
  const services = { discover: () => { calls++; } };
  assert.equal(await orchestrateCandidateRetrieval({ orchestration: { canonicalIntent: intent({ mediaType: 'movie' }) }, services,
    context: { telemetry: {} }, env: { HYBRID_RETRIEVAL_ENABLED: 'false' } }), null);
  assert.equal(await orchestrateCandidateRetrieval({ orchestration: { canonicalIntent: null }, services,
    context: { telemetry: {} }, env: { HYBRID_RETRIEVAL_ENABLED: 'true' } }), null);
  assert.equal(calls, 0);
});
test('explicit requested media type wins over wrong LLM type on the hybrid path', async () => {
  const result = await orchestrateSearch({ interpreted: { media_type: 'movie' }, requestedMediaType: 'Séries TV', enforceRequestedMediaType: true });
  assert.equal(result.canonicalIntent.mediaType, 'tv');
});
