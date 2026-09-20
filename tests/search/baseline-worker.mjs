// Isolated process: no real credentials, network, database writes or quota use.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import corpus from './baseline-corpus.v1.json' with { type: 'json' };

const mode = process.argv[2];
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const key of Object.keys(process.env)) {
  if (/API_KEY|SUPABASE|DASHSCOPE|SEARCH_OBSERVABILITY/i.test(key)) delete process.env[key];
}
console.log = console.info = console.warn = console.error = () => {};
const oldSource = execFileSync('git', [
  'show', '9b818b3f59bef875462f25a40ba29b7c78afdc6b:api/search.js'
], { cwd: root, encoding: 'utf8' });
const currentSource = readFileSync(new URL('../../api/search.js', import.meta.url), 'utf8');
const withoutShadow = currentSource.replace(/\r\n/g, '\n')
  .replace("import { generateCanonicalIntentShadow } from '../src/search/canonicalIntentShadow.js';\n", '')
  .replace("\n      // Phase 2: observational only; no canonical field feeds the legacy engine.\n      generateCanonicalIntentShadow(llmResult, { userQuery: req.body?.rawQuery || cleanQuery }, telemetry);\n", '');
assert.equal(withoutShadow, oldSource.replace(/\r\n/g, '\n'),
  'Only the Phase 2 import and shadow hook may differ from the pinned handler');
// Resolve imports without creating a temporary copy or changing the checkout.
const source = (mode === 'old' ? oldSource : currentSource).replace(
  /from '(\.\.?\/[^']+)'/g,
  (_, specifier) => "from '" + new URL(specifier, new URL('../../api/search.js', import.meta.url)).href + "'"
);
const { default: handler } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const { getBufferedSearchTelemetry } = await import('../../api/searchPhase0.js');
if (mode === 'failure') {
  const { canonicalIntentSchema } = await import('../../src/types/canonicalIntent.runtime.js');
  canonicalIntentSchema.parse = () => { throw new Error('Injected validation failure'); };
}

let requests = [];
let activeCase;
let scenario;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ url: String(url), method: options.method || 'GET', body });
  if (parsed.hostname === 'api.groq.com') {
    const media = activeCase.expectedMediaTypes.length === 1 ? activeCase.expectedMediaTypes[0] : 'all';
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      media_type: media,
      primary_genres: ['Thriller'], mood_tags: ['dark'],
      reference_titles: activeCase.intent === 'person' ? [] : activeCase.references,
      clean_query: activeCase.query,
      recommended_titles: [
        { title: 'Fixture Alpha', type: media === 'tv' ? 'tv' : 'movie', release_year: 2001, match_percentage: 97 },
        { title: 'Fixture Beta', type: 'tv', release_year: 2002, match_percentage: 85 }
      ]
    }) } }] }) };
  }
  if (parsed.hostname === 'api.themoviedb.org') {
    if (scenario !== 'direct') return { ok: true, json: async () => ({ results: [] }) };
    const title = parsed.searchParams.get('query') || 'Fixture';
    const tv = parsed.pathname.includes('/tv');
    const item = {
      id: title === 'Fixture Alpha' ? 100 : 200, poster_path: '/fixture.jpg',
      overview: 'Deterministic fixture', vote_count: 1000, vote_average: 8,
      genre_ids: [80, 18],
      ...(tv ? { name: title, first_air_date: '2001-01-01' } : { title, release_date: '2001-01-01' })
    };
    return { ok: true, json: async () => ({ results: [item] }) };
  }
  throw new Error('Unexpected network target: ' + parsed.hostname);
};

const snapshots = [];
for (const [scenarioIndex, name] of ['direct', 'empty', 'heuristic'].entries()) {
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
          ...(scenario === 'heuristic' ? {} : { groqApiKey: 'fixture-groq' }), ...body }
      }, response);
      return { status: response.statusCode, payload: response.payload };
    };
    const response = await invoke();
    // Existing Phase 1 defect: provider exhaustion references heuristicMood,
    // which is undefined. Record it explicitly; Phase 2 must not alter fallbacks.
    if (scenario === 'heuristic') {
      assert.ok([200, 500].includes(response.status));
      if (response.status === 500) assert.equal(response.payload.error, 'heuristicMood is not defined');
    } else assert.equal(response.status, 200);
    const telemetry = getBufferedSearchTelemetry().at(-1);
    if (mode !== 'old' && response.status === 200) {
      assert.equal(telemetry.canonicalIntentGenerated, mode !== 'failure');
      assert.equal(telemetry.canonicalIntentValid, mode !== 'failure');
      assert.equal(telemetry.canonicalIntentError, mode === 'failure' ? 'CANONICAL_INTENT_VALIDATION_FAILED' : null);
    }
    if (scenario !== 'heuristic') assert.ok(requests.length > 0);
    else if (response.status === 500) assert.equal(telemetry.canonicalIntentGenerated, undefined);
    if (scenario === 'direct') assert.ok(response.payload.results.length > 0);
    if (scenario === 'empty') assert.equal((response.payload.movies || []).length, 0);
    const quota = [await invoke('GET')];
    // Exercise the unchanged free quota boundary as well as successful searches.
    if (scenario === 'direct') {
      quota.push(await invoke(), await invoke(), await invoke(), await invoke('GET'));
      assert.equal(quota[3].payload.code, 'QUOTA_EXCEEDED');
    }
    snapshots.push({ id: entry.id, scenario, response, quota, requests });
  }
}
process.stdout.write(JSON.stringify(snapshots));
