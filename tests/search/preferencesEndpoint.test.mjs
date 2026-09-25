/**
 * The preference endpoint only ever works for an identified account: nothing is
 * stored for a visitor, and nothing is invented when the table is missing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

for (const key of Object.keys(process.env)) {
  if (/API_KEY|SUPABASE|DASHSCOPE|SEARCH_OBSERVABILITY/i.test(key)) delete process.env[key];
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
globalThis.console.log = globalThis.console.info = globalThis.console.warn = globalThis.console.error = () => {};

// Les préférences sont servies par la fonction de recherche, via la réécriture
// `/api/preferences` → `/api/search?action=preferences`.
const { default: handler } = await import('../../api/search.js');

async function call(method, body) {
  const response = {
    statusCode: 200, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
    end() { this.ended = true; return this; }
  };
  await handler({
    method, query: { action: 'preferences' }, headers: {}, socket: { remoteAddress: '198.51.100.4' },
    body: body || {}
  }, response);
  return response;
}

test('a visitor without an account gets an empty profile and nothing is recorded', async () => {
  const read = await call('GET');
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.payload.profile, {
    genres: {}, themes: {}, moods: {}, languages: {}, mediaTypes: {}, searches: 0, signals: 0
  });

  const write = await call('POST', {
    signal: { kind: 'watchlist' },
    work: { genreIds: [28, 53], mediaType: 'movie' }
  });
  assert.equal(write.statusCode, 200);
  assert.equal(write.payload.recorded, false, 'sans compte identifié, rien ne doit être enregistré');
});

test('an unknown signal kind is ignored instead of being stored', async () => {
  const write = await call('POST', { signal: { kind: 'n_importe_quoi' }, work: { genreIds: [28] } });
  assert.equal(write.payload.recorded, false);
});

test('preflight and unsupported methods are answered without failing', async () => {
  assert.equal((await call('OPTIONS')).statusCode, 200);
  assert.equal((await call('PUT')).statusCode, 405);
});

test.after(() => { globalThis.fetch = originalFetch; });
