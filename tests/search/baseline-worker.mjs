// Isolated process: no real credentials, network, database writes or quota use.
import assert from 'node:assert/strict';
import corpus from './baseline-corpus.v1.json' with { type: 'json' };

const mode = process.argv[2];
assert.ok(['legacy', 'canonical', 'hybrid'].includes(mode), 'Expected legacy, canonical or hybrid mode');
for (const key of Object.keys(process.env)) {
  if (/API_KEY|SUPABASE|DASHSCOPE|SEARCH_OBSERVABILITY/i.test(key)) delete process.env[key];
}
process.env.HYBRID_RETRIEVAL_ENABLED = mode === 'hybrid' ? 'true' : 'false';
if (mode !== 'legacy') process.env.CANONICAL_SEARCH_ENGINE_ENABLED = 'true';
else process.env.CANONICAL_SEARCH_ENGINE_ENABLED = 'false';
console.log = console.info = console.warn = console.error = () => {};
const { default: handler } = await import('../../api/search.js');
const { getBufferedSearchTelemetry } = await import('../../api/searchPhase0.js');

let requests = [];
let activeCase;
let scenario;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ url: String(url), method: options.method || 'GET', body });
  if (parsed.hostname === 'api.deepseek.com') {
    if (scenario === 'provider-error') {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    const media = activeCase.expectedMediaTypes.length === 1 ? activeCase.expectedMediaTypes[0] : 'all';
    const personIntent = activeCase.intent === 'person';
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      media_type: media,
      intent_type: personIntent ? 'person_search'
        : (activeCase.references.length ? 'similar_to_title' : 'thematic_search'),
      genres: ['Thriller'], moods: ['dark'], themes: ['psychological tension'],
      keywords: ['detective'], semantic_concepts: ['psychological tension'],
      known_titles: personIntent ? [] : activeCase.references,
      people: personIntent ? activeCase.references : [],
      clean_query: activeCase.query,
      recommended_titles: [
        { title: 'Fixture Alpha', type: media === 'tv' ? 'tv' : 'movie', release_year: 2001, match_percentage: 97 },
        { title: 'Fixture Beta', type: 'tv', release_year: 2002, match_percentage: 85 }
      ]
    }) } }] }) };
  }
  if (parsed.hostname === 'api.themoviedb.org') {
    if (!['direct', 'duplicates'].includes(scenario)) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    const title = parsed.searchParams.get('query') || 'Fixture';
    const tv = parsed.pathname.includes('/tv');
    const item = {
      id: scenario === 'duplicates' ? 100 : (title === 'Fixture Alpha' ? 100 : 200), poster_path: '/fixture.jpg',
      overview: 'Deterministic fixture', vote_count: 1000, vote_average: 8,
      genre_ids: [80, 18],
      ...(tv ? { name: title, first_air_date: '2001-01-01' } : { title, release_date: '2001-01-01' })
    };
    return { ok: true, json: async () => ({ results: [item] }) };
  }
  throw new Error('Unexpected network target: ' + parsed.hostname);
};

const snapshots = [];
for (const [scenarioIndex, name] of ['direct', 'empty', 'heuristic', 'provider-error', 'duplicates'].entries()) {
  scenario = name;
  for (const [index, entry] of corpus.queries.entries()) {
    activeCase = entry;
    requests = [];
    const ip = '192.0.' + scenarioIndex + '.' + (index + 1);
    const invoke = async (method = 'POST', body = {}) => {
      const response = {
        statusCode: 200, headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return payload; },
        end() {}
      };
      await handler({
        method, query: method === 'GET' ? { action: 'quota' } : {},
        headers: {}, socket: { remoteAddress: ip },
        body: { query: entry.query, rawQuery: entry.query, tmdbApiKey: 'fixture-tmdb',
          ...(scenario === 'heuristic' ? {} : { deepseekApiKey: 'fixture-deepseek' }), ...body }
      }, response);
      return { status: response.statusCode, payload: response.payload };
    };
    const response = await invoke();
    assert.equal(response.status, 200, entry.id + '/' + scenario);
    const telemetry = getBufferedSearchTelemetry().at(-1);
    if (mode !== 'legacy') {
      assert.equal(telemetry.searchEnginePath, 'canonical');
      assert.equal(telemetry.orchestrationSucceeded, true);
      assert.equal(telemetry.canonicalIntentGenerated, true);
      assert.equal(telemetry.canonicalIntentValid, true);
    } else {
      assert.equal(telemetry.searchEnginePath, 'legacy');
    }
    // An empty canonical intent deliberately performs zero vague retrieval calls.
    if (mode !== 'hybrid') assert.ok(requests.length > 0);
    const responseResults = response.payload.results || response.payload.movies || [];
    assert.ok(Array.isArray(responseResults));
    if (scenario === 'duplicates') {
      assert.equal(new Set(responseResults.map(item => mode === 'hybrid' ? `${item.media_type}:${item.id}` : item.id)).size, responseResults.length);
    }
    const quota = [await invoke('GET')];
    // Exercise the unchanged free quota boundary as well as successful searches.
    if (['direct', 'duplicates'].includes(scenario)) {
      quota.push(await invoke(), await invoke(), await invoke(), await invoke('GET'));
      assert.equal(quota[3].payload.code, 'QUOTA_EXCEEDED');
    }
    snapshots.push({ id: entry.id, scenario, response, quota, requests,
      metrics: { attempted: telemetry.hybridRetrievalAttempted, pool: telemetry.retrievalCandidateCountFinal,
        errors: telemetry.retrievalSourceErrorCount, llmCalls: telemetry.llmCalls, tmdbCalls: telemetry.tmdbCalls } });
  }
}
process.stdout.write(JSON.stringify(snapshots));
