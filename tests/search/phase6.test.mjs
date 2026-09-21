import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { hybridRetrieve } from '../../src/search/hybridRetriever.js';
import {
  buildMediaIndexText, buildVectorQueryText, createEmbeddingClient, createQueryEmbeddingService,
  createSupabaseVectorSource, isVectorRetrievalEnabled, validateEmbedding,
  VECTOR_EMBEDDING_DIMENSION, VECTOR_EMBEDDING_MODEL, VECTOR_EMBEDDING_VERSION
} from '../../src/search/vectorRetrieval.js';
import { reindexMediaBatch } from '../../scripts/reindex-media-embeddings.mjs';

const vector = (length = VECTOR_EMBEDDING_DIMENSION) => Array.from({ length }, (_, i) => i / 10000);
const media = (id, type = 'movie', extra = {}) => ({ tmdb_id: id, media_type: type,
  title: `Media ${id}`, original_title: `Original ${id}`, overview: 'A meaningful story',
  genre_ids: [18], similarity: 0.82, ...extra });
const rpcClient = handler => ({ rpc(name, args) {
  const promise = Promise.resolve().then(() => handler(name, args));
  promise.abortSignal = () => promise;
  return promise;
} });
const queryService = (value = vector()) => ({ get: async () => value });
const canonical = input => createCanonicalIntent(input);

test('Phase 6 constants identify one model, dimension and version', () => {
  assert.equal(VECTOR_EMBEDDING_MODEL, 'text-embedding-3-small');
  assert.equal(VECTOR_EMBEDDING_DIMENSION, 1024);
  assert.equal(VECTOR_EMBEDDING_VERSION, 'text-embedding-3-small:1024:v1');
  assert.equal(validateEmbedding(vector()).length, 1024);
});

test('1536D and malformed vectors are rejected before pgvector', () => {
  assert.throws(() => validateEmbedding(vector(1536)), /EMBEDDING_DIMENSION_MISMATCH/);
  assert.throws(() => validateEmbedding([...vector().slice(0, -1), NaN]), /EMBEDDING_DIMENSION_MISMATCH/);
});

test('embedding client requests the fixed 1024D model and validates the response', async () => {
  let request;
  const client = createEmbeddingClient({ apiKey: 'fixture', fetchImpl: async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ data: [{ index: 0, embedding: vector() }] }) };
  } });
  const result = await client.embed('canonical text');
  assert.equal(result.length, 1024);
  assert.equal(request.body.model, VECTOR_EMBEDDING_MODEL);
  assert.equal(request.body.dimensions, 1024);
  assert.equal(request.body.input, 'canonical text');
});

test('configured and provider dimensions cannot silently mix 1024D and 1536D', async () => {
  const badConfig = createEmbeddingClient({ apiKey: 'fixture', configuredDimension: 1536,
    fetchImpl: async () => assert.fail('provider must not be called') });
  await assert.rejects(badConfig.embed('query'), /EMBEDDING_CONFIGURATION_MISMATCH/);
  const badResponse = createEmbeddingClient({ apiKey: 'fixture', fetchImpl: async () =>
    ({ ok: true, json: async () => ({ data: [{ index: 0, embedding: vector(1536) }] }) }) });
  await assert.rejects(badResponse.embed('query'), /EMBEDDING_DIMENSION_MISMATCH/);
});

test('query text and movie/TV index text are deterministic and contain useful existing fields', () => {
  const intent = canonical({ mediaType: 'tv', genres: ['War'], themes: ['aviation'], yearMin: 2015 });
  assert.equal(buildVectorQueryText(intent), buildVectorQueryText(intent));
  assert.match(buildVectorQueryText(intent), /media_type: tv[\s\S]*themes: aviation/);
  const movie = buildMediaIndexText(media(1, 'movie', { tagline: 'Tag', keywords: ['pilot'] }));
  const tv = buildMediaIndexText(media(2, 'tv', { first_air_date: '2020-01-01', moods: ['tense'] }));
  assert.match(movie, /media_type: movie/); assert.match(movie, /keywords: pilot/);
  assert.match(tv, /media_type: tv/); assert.match(tv, /moods: tense/);
});

test('request-scoped query service creates at most one embedding', async () => {
  let calls = 0;
  const telemetry = {};
  const service = createQueryEmbeddingService({ telemetry, client: { embed: async () => { calls++; return vector(); } } });
  const intent = canonical({ themes: ['fighter jets'] });
  const [first, second] = await Promise.all([service.get(intent), service.get(intent)]);
  assert.equal(calls, 1); assert.equal(first, second); assert.equal(first.length, 1024);
  assert.equal(typeof telemetry.embeddingDurationMs, 'number');
});

for (const type of ['movie', 'tv', null]) test(`match_media handles mediaType ${type}`, async () => {
  let rpc;
  const telemetry = {};
  const source = createSupabaseVectorSource({ telemetry, queryEmbedding: queryService(),
    client: rpcClient((name, args) => {
      rpc = { name, args };
      return { data: [media(1, 'movie'), media(2, 'tv')], error: null };
    }) });
  const rows = await source(canonical({ mediaType: type, themes: ['war'] }));
  assert.equal(rpc.name, 'match_media');
  assert.equal(rpc.args.match_media_type, type);
  assert.equal(rpc.args.match_embedding_version, VECTOR_EMBEDDING_VERSION);
  assert.ok(rows.every(row => !type || row.media_type === type));
  assert.equal(rows.length, type ? 1 : 2);
  assert.equal(telemetry.vectorRetrievalSucceeded, true);
});

test('empty RPC response is a successful zero-candidate vector retrieval', async () => {
  const telemetry = {};
  const source = createSupabaseVectorSource({ telemetry, queryEmbedding: queryService(),
    client: rpcClient(() => ({ data: [], error: null })) });
  assert.deepEqual(await source(canonical({ keywords: ['detective'] })), []);
  assert.equal(telemetry.vectorRetrievalAttempted, true);
  assert.equal(telemetry.vectorRetrievalSucceeded, true);
  assert.equal(telemetry.vectorRetrievalCandidateCount, 0);
  assert.equal(telemetry.vectorRetrievalError, null);
});

test('embedding error is fixed-code telemetry and prevents the RPC', async () => {
  let rpcCalls = 0;
  const telemetry = {};
  const source = createSupabaseVectorSource({ telemetry,
    queryEmbedding: { get: async () => { throw new Error('provider private message'); } },
    client: rpcClient(() => { rpcCalls++; return { data: [], error: null }; }) });
  await assert.rejects(source(canonical({ themes: ['war'] })));
  assert.equal(rpcCalls, 0); assert.equal(telemetry.vectorRetrievalError, 'EMBEDDING_FAILED');
  assert.equal(JSON.stringify(telemetry).includes('private'), false);
});

test('Supabase error is isolated with fixed-code telemetry', async () => {
  const telemetry = {};
  const source = createSupabaseVectorSource({ telemetry, queryEmbedding: queryService(),
    client: rpcClient(() => ({ data: null, error: { message: 'database private message' } })) });
  await assert.rejects(source(canonical({ themes: ['war'] })), /VECTOR_RPC_FAILED/);
  assert.equal(telemetry.vectorRetrievalError, 'VECTOR_RPC_FAILED');
  assert.equal(JSON.stringify(telemetry).includes('private'), false);
});

test('hybrid retrieval continues after vector failure', async () => {
  const telemetry = {};
  const candidates = await hybridRetrieve({ intent: canonical({ mediaType: 'movie' }), context: { telemetry }, services: {
    vector: async () => { Object.assign(telemetry, { vectorRetrievalAttempted: true,
      vectorRetrievalSucceeded: false, vectorRetrievalError: 'VECTOR_RPC_FAILED' }); throw new Error('fail'); },
    legacy: async () => [media(1, 'movie')]
  } });
  assert.equal(candidates.length, 1); assert.deepEqual(candidates[0].sources, ['legacy']);
  assert.equal(telemetry.vectorRetrievalError, 'VECTOR_RPC_FAILED');
  assert.equal(telemetry.retrievalSourceErrorCount, 1);
});

test('supabase_vector merges and deduplicates with TMDB provenance', async () => {
  const candidates = await hybridRetrieve({ intent: canonical({ mediaType: 'movie' }), services: {
    vector: async () => [media(42, 'movie')], discover: async () => [media(42, 'movie')]
  } });
  assert.equal(candidates.length, 1);
  assert.deepEqual(new Set(candidates[0].sources), new Set(['tmdb_discover', 'supabase_vector']));
  assert.equal(candidates[0].retrievalSignals.find(s => s.source === 'supabase_vector').sourceScore, 0.82);
});

test('critical modern-war TV intent rejects every movie from vector source', async () => {
  const intent = canonical({ mediaType: 'tv', genres: ['War'], themes: ['guerre moderne', 'avions de combat'] });
  const telemetry = {};
  const source = createSupabaseVectorSource({ telemetry, queryEmbedding: queryService(),
    client: rpcClient(() => ({ data: [media(1, 'movie', { title: 'Top Gun' }), media(2, 'tv')], error: null })) });
  const candidates = await hybridRetrieve({ intent, services: { vector: source }, context: { telemetry } });
  assert.equal(candidates.length, 1); assert.equal(candidates[0].mediaType, 'tv');
  assert.deepEqual(candidates[0].sources, ['supabase_vector']);
  assert.equal(telemetry.vectorRetrievalAttempted, true);
  assert.equal(telemetry.vectorRetrievalSucceeded, true);
  assert.equal(telemetry.vectorRetrievalCandidateCount, 1);
  assert.equal(telemetry.retrievalSupabaseVectorCount, 1);
});

test('vector feature flag is enabled by default and provides explicit rollback', () => {
  assert.equal(isVectorRetrievalEnabled({}), true);
  assert.equal(isVectorRetrievalEnabled({ VECTOR_RETRIEVAL_ENABLED: 'true' }), true);
  assert.equal(isVectorRetrievalEnabled({ VECTOR_RETRIEVAL_ENABLED: 'false' }), false);
});

test('canonical migration defines only 1024D match_media and keeps version/type filters', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20260921000000_unify_vector_retrieval.sql', import.meta.url), 'utf8');
  assert.match(sql, /embedding vector\(1024\)/);
  assert.match(sql, /query_embedding vector\(1024\)/);
  assert.doesNotMatch(sql, /vector\(1536\)/);
  assert.match(sql, /USING hnsw/);
  assert.match(sql, /match_embedding_version/);
  assert.match(sql, /match_media_type/);
});

test('bounded reindex batch handles a movie and TV sample reproducibly', async () => {
  const rows = [media(1, 'movie'), media(2, 'tv', { name: 'Series', title: undefined, first_air_date: '2021-01-01' })];
  let embeddingCalls = 0;
  const writes = [];
  const result = await reindexMediaBatch({ rows, apply: true, batchSize: 2,
    embeddingClient: { embed: async texts => { embeddingCalls++; assert.equal(texts.length, 2); return [vector(), vector()]; } },
    upsert: async records => writes.push(...records) });
  assert.deepEqual(result, { planned: 2, indexed: 2, batches: 1, dryRun: false });
  assert.equal(embeddingCalls, 1); assert.deepEqual(writes.map(row => row.media_type), ['movie', 'tv']);
  assert.ok(writes.every(row => row.embedding.length === 1024 && row.embedding_version === VECTOR_EMBEDDING_VERSION));
});

test('reindex dry-run plans a bounded sample without embedding or writes', async () => {
  const result = await reindexMediaBatch({ rows: [media(1)], apply: false,
    embeddingClient: { embed: () => assert.fail('no cost in dry-run') }, upsert: () => assert.fail('no write') });
  assert.equal(result.planned, 1); assert.equal(result.indexed, 0); assert.equal(result.dryRun, true);
});
