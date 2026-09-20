import assert from 'node:assert/strict';
import test from 'node:test';
import searchHandler from '../../api/search.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
    end() {}
  };
}

test('the no-provider heuristic fallback never reads an undefined heuristicMood', async () => {
  const saved = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => /(?:API_KEY|DASHSCOPE)/.test(key)));
  for (const key of Object.keys(process.env)) {
    if (/(?:API_KEY|DASHSCOPE)/.test(key)) delete process.env[key];
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ results: [] }) });
  try {
    const res = response();
    await searchHandler({
      method: 'POST',
      query: {},
      headers: {},
      socket: { remoteAddress: '198.51.100.71' },
      body: { query: 'une intention sans fournisseur', rawQuery: 'une intention sans fournisseur' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    assert.notEqual(res.payload.error, 'heuristicMood is not defined');
    assert.ok(res.payload.movies.length > 0);
    assert.equal(res.payload.fallback_triggered, true);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (/(?:API_KEY|DASHSCOPE)/.test(key)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
});
