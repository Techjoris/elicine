import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { buildNarrativeRetrievalPlan, narrativeKeywordId, narrativeLexicalFilter } from '../../src/search/narrativeRetrieval.js';
import { hybridRetrieve } from '../../src/search/hybridRetriever.js';
import { createSupabaseLexicalSource, createTmdbRetrievalClient } from '../../src/search/retrievalServices.js';
import { buildVectorQueryText, createQueryEmbeddingService } from '../../src/search/vectorRetrieval.js';
import { createSearchEvaluationTrace, evaluateCandidateRecall, recordEvaluationSource } from '../../src/search/searchEvaluation.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';

const intent = createCanonicalIntent({ genres: ['Crime', 'Drama'], keywords: ['crime'] });
const semantic = { intentType: 'specific_title_description', semanticConcepts: ['federal investigators', 'serial killers'],
  narrativeMotifs: ['prison interviews', 'criminal psychology'], people: ['Example Person'] };
const row = (id, type = 'tv', overview = '') => ({ id, media_type: type, title: `Work ${id}`, overview,
  genre_ids: [80, 18], vote_average: 8, popularity: 100 - id });

test('keyword inflections retain specificity and ambiguous IDs are rejected', () => {
  assert.equal(narrativeKeywordId('serial killers', [{ id: 1, name: 'serial killer' }]), 1);
  assert.equal(narrativeKeywordId('serial killers', [{ id: 1, name: 'killer' }]), null);
  assert.equal(narrativeKeywordId('hidden cameras', [{ id: 1, name: 'hidden camera' }, { id: 2, name: 'hidden cameras' }]), null);
  assert.equal(buildNarrativeRetrievalPlan({}, { semanticConcepts: ['serial killer', 'serial killers'] }).rich, false);
});

test('semantic context survives canonical truncation with separate dimensions and no genre replacement', () => {
  const plan = buildNarrativeRetrievalPlan(intent, semantic);
  assert.equal(plan.rich, true);
  for (const term of [...semantic.semanticConcepts, ...semantic.narrativeMotifs]) assert.ok(plan.keywordQueries.includes(term));
  assert.ok(!plan.keywordQueries.includes('crime'));
  assert.equal(plan.maxVariants, 5);
  assert.deepEqual(plan, buildNarrativeRetrievalPlan(intent, semantic));
  const text = buildVectorQueryText(intent, semantic);
  for (const term of [...semantic.semanticConcepts, ...semantic.narrativeMotifs, ...semantic.people]) assert.ok(text.includes(term));
  assert.ok(text.indexOf('semantic_concepts') < text.indexOf('genres:'));
});

test('one embedding receives rich context even across repeated consumers', async () => {
  const texts = [];
  const service = createQueryEmbeddingService({ client: { embed: async text => { texts.push(text); return [1]; } } });
  const context = { semanticIntentContext: semantic, evaluationTrace: createSearchEvaluationTrace() };
  await Promise.all([service.get(intent, { context }), service.get(intent, { context })]);
  assert.equal(texts.length, 1);
  assert.match(texts[0], /narrative_motifs: prison interviews, criminal psychology/);
  assert.equal(context.evaluationTrace.vectorQueryText, texts[0]);
});

for (const type of ['movie', 'tv']) test(`${type}: narrative conjunction finds a work absent from a broad top 20`, async () => {
  const queries = [];
  const genreFilters = [];
  const trace = createSearchEvaluationTrace();
  const pool = await hybridRetrieve({ intent: createCanonicalIntent({ ...intent, mediaType: type }),
    context: { semanticIntentContext: semantic, evaluationTrace: trace }, services: {
      keyword: async term => [{ id: ['federal investigators', 'prison interviews', 'serial killers', 'criminal psychology'].indexOf(term) + 1, name: term }],
      discover: async (mediaType, params) => {
        queries.push(params.with_keywords);
        genreFilters.push(params.with_genres ?? null);
        return params.with_keywords.includes(',') ? [row(99, mediaType)] : Array.from({ length: 20 }, (_, i) => row(i + 1, mediaType));
      }
    } });
  // Two keyword intersections, the broad backoff, and the genre-free angle -
  // which goes three pages deep so a less popular multi-concept work is not
  // eliminated by the popularity ordering of page one.
  assert.equal(queries.length, 6);
  assert.equal(queries.filter(query => query.split(',').length === 2).length, 2);
  assert.equal(genreFilters.filter(filter => filter === null).length, 3, 'the concept angle drops the declared genre on every page');
  assert.equal(pool.length, 21);
  assert.equal(pool[0].tmdbId, 99);
  assert.equal(trace.sources.tmdb_discover.uniqueCandidateCount, 21);
  assert.equal(evaluateCandidateRecall(trace.candidatePool, [{ tmdbId: 99, mediaType: type }]).candidateRecallAt20, 1);
});

for (const type of ['movie', 'tv']) test(`${type}: compare all person credits before the per-source cap`, async () => {
  const pool = await hybridRetrieve({ intent: createCanonicalIntent({ mediaType: type }),
    resolvedContext: { resolvedPeople: [{ tmdbId: 12 }] },
    context: { semanticIntentContext: semantic }, services: {
      personCredits: async () => [...Array.from({ length: 40 }, (_, i) => row(i + 1, type, 'ordinary romance')),
        row(99, type, 'Federal investigators interview serial killers. Prison interviews develop criminal psychology.')],
      vector: async () => [row(98, type, 'Federal investigators interview serial killers.')]
    } });
  assert.equal(pool[0].tmdbId, 99);
  assert.equal(pool[1].tmdbId, 98);
  assert.equal(pool.filter(candidate => candidate.sources.includes('tmdb_person_credits')).length, 20);
});

test('lexical expression requires two distinct concepts and sanitizes provider strings', () => {
  const plan = buildNarrativeRetrievalPlan(intent, semantic);
  const filter = narrativeLexicalFilter(plan);
  assert.ok(filter.startsWith('and(or('));
  assert.match(filter, /serial killers/);
  assert.doesNotMatch(filter, /%crime%/);
  const hostile = narrativeLexicalFilter(buildNarrativeRetrievalPlan({}, { semanticConcepts: ['x),id.gt.0', 'robots'] }));
  assert.doesNotMatch(hostile, /id\.gt/);
  assert.ok(filter.length < 16000);
});

test('TV lexical recall uses the canonical catalog, without film relabeling or vote ordering', async () => {
  const calls = [];
  const client = { from(table) {
    const call = { table }; calls.push(call);
    return { select() { return this; }, or(filter) { call.filter = filter; return this; },
      eq(key, value) { call[key] = value; return this; }, order() { assert.fail('rating cannot truncate narrative recall'); },
      limit(limit) { call.limit = limit; return this; }, abortSignal: async () => ({ data: [
        { ...row(1), tmdb_id: 1 }, { ...row(2, 'movie'), tmdb_id: 2 }] }) };
  } };
  const rows = await createSupabaseLexicalSource(client)(createCanonicalIntent({ mediaType: 'tv' }),
    { context: { semanticIntentContext: semantic } });
  assert.deepEqual(rows.map(row => row.tmdb_id), [1]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'media_embeddings');
  assert.equal(calls[0].media_type, 'tv');
  assert.match(calls[0].filter, /profile_text.ilike/);
});

test('pre-ranking recall is distinct from final position and preserves all 20 source identities', async () => {
  const trace = createSearchEvaluationTrace();
  const rows = Array.from({ length: 20 }, (_, i) => row(i + 1));
  recordEvaluationSource(trace, 'test', { candidates: rows, expectedMediaType: 'tv' });
  assert.equal(trace.sources.test.uniqueCandidateCount, 20);
  assert.equal(trace.sources.test.mediaTypeConformity, 1);
  await orchestrateCandidateRetrieval({ orchestration: { canonicalIntent: createCanonicalIntent({ mediaType: 'tv' }) },
    services: { vector: async () => rows }, context: { telemetry: {}, evaluationTrace: trace },
    rankCandidates: rows => [...rows].reverse(), diversifyCandidates: rows => rows, budgetCandidates: rows => rows });
  const metric = evaluateCandidateRecall(trace.candidatePool, [{ tmdbId: 20, mediaType: 'tv' }]);
  assert.equal(metric.candidateRecallAt10, 0);
  assert.equal(metric.candidateRecallAt20, 1);
  assert.equal(metric.expectedPositions[0].position, 20);
  assert.equal(trace.finalResults[0].tmdbId, 20);
});

test('narrative queries reserve Discover capacity inside the existing shared TMDB budget', async () => {
  const requests = [];
  const client = createTmdbRetrievalClient({ apiKey: 'test', fetchImpl: async raw => {
    const url = new URL(raw); requests.push(url.pathname); const id = requests.length;
    return { ok: true, json: async () => ({ results: url.pathname.includes('keyword')
      ? [{ id, name: url.searchParams.get('query') }] : [] }) };
  } });
  for (let i = 0; i < 20; i++) await client.search(`seed ${i}`, 'tv');
  await hybridRetrieve({ intent: createCanonicalIntent({ mediaType: 'tv' }),
    context: { semanticIntentContext: semantic }, services: { ...client,
      legacy: () => Promise.all(Array.from({ length: 10 }, (_, i) => client.search(`hint ${i}`, 'tv'))).then(rows => rows.flat()) } });
  assert.ok(requests.length <= 30);
  assert.equal(requests.filter(path => path === '/3/discover/tv').length, 3);
});
