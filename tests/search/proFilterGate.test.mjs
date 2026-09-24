/**
 * The advanced filters reserved for Pass Pro are the rating floor and the
 * streaming platform. The media format is NOT one of them: the server derives
 * it from the wording of the request itself, and the client sends back the
 * format it just derived. Counting it as a paid filter rejected every free
 * search containing "film" or "série" with a 403 PRO_REQUIRED.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

for (const key of Object.keys(process.env)) {
  if (/API_KEY|SUPABASE|DASHSCOPE|SEARCH_OBSERVABILITY/i.test(key)) delete process.env[key];
}
process.env.HYBRID_RETRIEVAL_ENABLED = 'true';
process.env.STRICT_CONSTRAINT_FILTER_ENABLED = 'true';
process.env.ELICINE_RANKING_ENABLED = 'true';

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [], total_pages: 1 }) });
globalThis.console.log = globalThis.console.info = globalThis.console.warn = globalThis.console.error = () => {};

const { default: handler } = await import('../../api/search.js');

async function search(filters, remoteAddress = '203.0.113.7') {
  const response = {
    statusCode: 200, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
    end() {}
  };
  await handler({
    method: 'POST', query: {}, headers: {}, socket: { remoteAddress },
    body: { query: 'un film de guerre moderne', rawQuery: 'un film de guerre moderne', filters }
  }, response);
  return { status: response.statusCode, payload: response.payload || {} };
}

test('the media format alone never requires Pass Pro', async () => {
  const films = await search({ platform: 'all', minRating: 0, mediaType: 'Films' });
  assert.notEqual(films.payload.code, 'PRO_REQUIRED');
  assert.notEqual(films.status, 403);

  const series = await search({ platform: 'all', minRating: 0, mediaType: 'Séries TV' }, '203.0.113.8');
  assert.notEqual(series.payload.code, 'PRO_REQUIRED');
  assert.notEqual(series.status, 403);
});

test('a rating floor still requires Pass Pro', async () => {
  const gated = await search({ platform: 'all', minRating: 7, mediaType: 'Tous' }, '203.0.113.9');
  assert.equal(gated.status, 403);
  assert.equal(gated.payload.code, 'PRO_REQUIRED');
});

test('a platform filter still requires Pass Pro', async () => {
  const gated = await search({ platform: 'netflix', minRating: 0, mediaType: 'Tous' }, '203.0.113.10');
  assert.equal(gated.status, 403);
  assert.equal(gated.payload.code, 'PRO_REQUIRED');
});

test.after(() => { globalThis.fetch = originalFetch; });
