import assert from 'node:assert/strict';
import test from 'node:test';
import corpus from './quality-phase5.json' with { type: 'json' };
import critical from './quality-phase4.json' with { type: 'json' };
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { hybridRetrieve } from '../../src/search/hybridRetriever.js';
import { resolveKnownTitles } from '../../src/search/entityResolver.js';
import { createTmdbRetrievalClient, retrieveLegacyHints } from '../../src/search/retrievalServices.js';
import { toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';

const forbidden = ['Dilwale Dulhania Le Jayenge', 'Your Name', 'Forrest Gump', 'Cinema Paradiso', 'A Silent Voice'];
const row = (id, type, title = `Corpus candidate ${id}`) => ({ id, media_type: type,
  ...(type === 'tv' ? { name: title, first_air_date: '2020-01-01' } : { title, release_date: '2020-01-01' }),
  poster_path: '/fixture.jpg', genre_ids: [18], vote_average: 8, vote_count: 1000 });

async function replay(entry, mode) {
  const intent = createCanonicalIntent({ ...entry, knownTitles: entry.seeds.map(s => s.title) });
  const calls = []; let simulatedMs = 0;
  const telemetry = {};
  const client = createTmdbRetrievalClient({ apiKey: 'fixture', telemetry, fetchImpl: async raw => {
    const url = new URL(raw);
    calls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
    // Deterministic virtual provider latency: 10 ms per sequential network wave.
    const start = simulatedMs;
    await Promise.resolve(); simulatedMs = Math.max(simulatedMs, start + 10);
    let results = [];
    if (url.pathname.includes('/search/keyword')) {
      const term = url.searchParams.get('query');
      const index = ['modern warfare', 'military aviation', 'fighter aircraft'].indexOf(term);
      results = index < 0 ? [] : [{ id: 100 + index, name: term }];
    } else if (url.pathname.includes('/search/')) {
      const term = url.searchParams.get('query');
      const seed = entry.seeds.find(s => s.title === term);
      results = seed ? [row(seed.id, seed.type, seed.title)] : [row(900, 'movie', term)];
    } else if (url.pathname.includes('/discover/')) {
      results = [row(701, entry.mediaType), row(702, entry.mediaType)];
      // Deliberately contaminated fixtures must be rejected, not relabelled.
      if (entry.mediaType === 'tv') results.push(...forbidden.map((title, i) => row(800 + i, 'movie', title)));
    } else if (url.pathname.endsWith('/similar')) {
      results = [row(701, entry.mediaType), row(703, entry.mediaType)];
    } else if (url.pathname.endsWith('/recommendations')) {
      results = [row(702, entry.mediaType), row(703, entry.mediaType)];
    } else assert.fail(`unexpected endpoint ${url.pathname}`);
    return { ok: true, json: async () => ({ results }) };
  } });
  // Deliberately bad movie hints for TV: mirrors the structural historical defect.
  const hints = entry.mediaType === 'tv' ? [{ title: forbidden[0], type: 'movie' }] :
    entry.seeds.length ? entry.seeds.map(s => ({ title: s.title, type: s.type })) : [{ title: 'Legacy film', type: 'movie' }];
  let candidates;
  if (mode === 'legacy') {
    candidates = (await retrieveLegacyHints(hints, {}, client)).map(r => toRetrievalCandidate(r, 'legacy'));
  } else {
    const resolvedContext = await resolveKnownTitles(intent, { searchCandidates: client.search });
    candidates = await hybridRetrieve({ intent, resolvedContext, services: {
      ...client, legacy: options => retrieveLegacyHints(hints, resolvedContext, client, options)
    }, context: { telemetry } });
  }
  return { intent, candidates, calls, telemetry, simulatedMs };
}

const measures = { legacy: [], hybrid: [] };
for (const entry of corpus) test(`retrieval quality ${entry.id}`, async () => {
  const legacy = await replay(entry, 'legacy');
  const hybrid = await replay(entry, 'hybrid');
  measures.legacy.push(legacy); measures.hybrid.push(hybrid);
  assert.equal(hybrid.intent.mediaType, entry.mediaType);
  assert.ok(hybrid.candidates.length > 0);
  assert.ok(hybrid.candidates.every(c => c.mediaType === entry.mediaType));
  assert.equal(new Set(hybrid.candidates.map(c => `${c.mediaType}:${c.tmdbId}`)).size, hybrid.candidates.length);
  assert.equal(new Set(hybrid.calls.map(c => JSON.stringify(c))).size, hybrid.calls.length);
  const discover = hybrid.calls.find(c => c.path === `/3/discover/${entry.mediaType}`);
  assert.ok(discover);
  if (entry.yearMin) assert.equal(discover.params['primary_release_date.gte'], `${entry.yearMin}-01-01`);
  if (entry.languages) assert.equal(discover.params.with_original_language, 'fr');
  for (const seed of entry.seeds) {
    assert.ok(hybrid.calls.some(c => c.path === `/3/${seed.type}/${seed.id}/similar`));
    assert.ok(hybrid.calls.some(c => c.path === `/3/${seed.type}/${seed.id}/recommendations`));
    assert.equal(hybrid.calls.filter(c => c.params.query === seed.title).length, 1);
  }
  if (entry.id === critical.id) {
    assert.equal(entry.query, critical.query); assert.deepEqual(entry.themes, critical.themes);
    assert.equal(discover.params.with_keywords, '100,101');
    assert.equal(hybrid.candidates.filter(c => c.mediaType === 'movie').length, 0);
    assert.equal(hybrid.candidates.filter(c => c.mediaType === 'tv').length, 2);
    assert.ok(hybrid.candidates.every(c => !forbidden.includes(c.title)));
    assert.ok(hybrid.calls.filter(c => /discover|similar|recommendations/.test(c.path)).every(c => c.path.includes('/tv')));
    console.log('PHASE5_CRITICAL', JSON.stringify({ canonicalIntent: hybrid.intent, pool: hybrid.candidates.length,
      sources: [...new Set(hybrid.candidates.flatMap(c => c.sources))], movie: 0, tv: 2 }));
  }
});

test('deterministic retrieval comparison metrics (not relevance scores)', () => {
  const avg = values => Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3));
  const summarize = runs => {
    const candidates = runs.flatMap(r => r.candidates);
    return {
      cases: runs.length, averageCandidates: avg(runs.map(r => r.candidates.length)),
      averageUnique: avg(runs.map(r => new Set(r.candidates.map(c => `${c.mediaType}:${c.tmdbId}`)).size)),
      mediaCompliance: candidates.filter((c, i) => c.mediaType === runs.flatMap(r => r.candidates.map(() => r.intent.mediaType))[i]).length / candidates.length,
      sourcesPerCandidate: avg(candidates.map(c => c.sources.length)), emptyPoolRate: runs.filter(r => !r.candidates.length).length / runs.length,
      averageTmdbCalls: avg(runs.map(r => r.calls.length)), maxTmdbCalls: Math.max(...runs.map(r => r.calls.length)),
      llmCallsDuringRetrieval: 0, averageSimulatedMs: avg(runs.map(r => r.simulatedMs)),
      maxSimulatedMs: Math.max(...runs.map(r => r.simulatedMs))
    };
  };
  assert.equal(measures.legacy.length, 7); assert.equal(measures.hybrid.length, 7);
  const result = { legacy: summarize(measures.legacy), hybrid: summarize(measures.hybrid) };
  assert.equal(result.hybrid.mediaCompliance, 1);
  assert.ok(result.hybrid.maxTmdbCalls <= 30);
  console.log('PHASE5_COMPARISON', JSON.stringify(result));
});
