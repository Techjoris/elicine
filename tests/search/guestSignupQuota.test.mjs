import test from 'node:test';
import assert from 'node:assert/strict';

for (const key of Object.keys(process.env)) {
  if (/API_KEY|SUPABASE|DASHSCOPE|SEARCH_OBSERVABILITY/i.test(key)) delete process.env[key];
}

const store = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
};
const originalFetch = globalThis.fetch;
let serverSearchCount = 0;
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ searchCount: serverSearchCount })
});

const { searchQuotaService } = await import('../../src/services/searchQuotaService.ts');
const { default: searchHandler } = await import('../../api/search.js');

function response() {
  return {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
    end() {}
  };
}

test('visitor can use all three free searches without an account', async () => {
  serverSearchCount = 0;
  assert.deepEqual(await searchQuotaService.getQuota(null).then(q => [q.remaining, q.max]), [3, 3]);
  assert.equal(searchQuotaService.canSearch(null), true);
  assert.deepEqual(await searchQuotaService.recordSuccessfulSearch(null).then(q => [q.remaining, q.max]), [2, 3]);
  assert.equal(searchQuotaService.canSearch(null), true);
  assert.deepEqual(await searchQuotaService.recordSuccessfulSearch(null).then(q => [q.remaining, q.max]), [1, 3]);
  assert.equal(searchQuotaService.canSearch(null), true);
  assert.deepEqual(await searchQuotaService.recordSuccessfulSearch(null).then(q => [q.remaining, q.max]), [0, 3]);
  assert.equal(searchQuotaService.canSearch(null), false);

  const member = { id: 'member-test', email: 'member@example.test', isPro: false };
  serverSearchCount = 1; // The visitor search already used this IP today.
  assert.deepEqual(await searchQuotaService.getQuota(member).then(q => [q.remaining, q.max]), [2, 3]);
  assert.deepEqual(await searchQuotaService.recordSuccessfulSearch(member).then(q => [q.remaining, q.max]), [1, 3]);
  serverSearchCount = 3; // Another device has exhausted the shared IP ceiling.
  assert.deepEqual(await searchQuotaService.getQuota(member).then(q => [q.remaining, q.max]), [0, 3]);
});

test('server allows three visitor searches and rejects the fourth', async () => {
  const address = '198.51.100.161';
  const headers = { 'x-forwarded-for': address };
  const quotaResponse = response();
  await searchHandler({ method: 'GET', query: { action: 'quota' }, headers, body: {} }, quotaResponse);
  assert.equal(quotaResponse.payload.max, 3);
  assert.equal(quotaResponse.payload.remaining, 3);

  const searchRequest = () => ({
    method: 'POST', query: {}, headers,
    body: { query: 'un thriller spatial', rawQuery: 'un thriller spatial', filters: { mediaType: 'Films' } }
  });
  for (let searchNumber = 1; searchNumber <= 3; searchNumber++) {
    const result = response();
    await searchHandler(searchRequest(), result);
    assert.equal(result.statusCode, 200, `visitor search ${searchNumber}`);
    const currentQuota = response();
    await searchHandler({ method: 'GET', query: { action: 'quota' }, headers, body: {} }, currentQuota);
    assert.equal(currentQuota.payload.remaining, 3 - searchNumber);
  }

  const blocked = response();
  await searchHandler(searchRequest(), blocked);
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.payload.code, 'QUOTA_EXCEEDED');
  assert.equal(blocked.payload.max, 3);
});

test.after(() => { globalThis.fetch = originalFetch; });
