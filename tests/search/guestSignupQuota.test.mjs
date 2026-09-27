import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
const { GuestSignupPrompt } = await import('../../src/components/auth/GuestSignupPrompt.tsx');

function response() {
  return {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
    end() {}
  };
}

test('visitor gets one search, then a free account keeps a three-search ceiling', async () => {
  serverSearchCount = 0;
  assert.deepEqual(await searchQuotaService.getQuota(null).then(q => [q.remaining, q.max]), [1, 1]);
  assert.equal(searchQuotaService.canSearch(null), true);
  assert.deepEqual(await searchQuotaService.recordSuccessfulSearch(null).then(q => [q.remaining, q.max]), [0, 1]);
  assert.equal(searchQuotaService.canSearch(null), false);

  const member = { id: 'member-test', email: 'member@example.test', isPro: false };
  serverSearchCount = 1; // The visitor search already used this IP today.
  assert.deepEqual(await searchQuotaService.getQuota(member).then(q => [q.remaining, q.max]), [2, 3]);
  assert.deepEqual(await searchQuotaService.recordSuccessfulSearch(member).then(q => [q.remaining, q.max]), [1, 3]);
  serverSearchCount = 3; // Another device has exhausted the shared IP ceiling.
  assert.deepEqual(await searchQuotaService.getQuota(member).then(q => [q.remaining, q.max]), [0, 3]);
});

test('server exposes a one-search visitor quota and rejects another request', async () => {
  const address = '198.51.100.161';
  const headers = { 'x-forwarded-for': address };
  const quotaResponse = response();
  await searchHandler({ method: 'GET', query: { action: 'quota' }, headers, body: {} }, quotaResponse);
  assert.equal(quotaResponse.payload.max, 1);
  assert.equal(quotaResponse.payload.remaining, 1);

  const first = response();
  await searchHandler({
    method: 'POST', query: {}, headers,
    body: { query: 'un thriller spatial', rawQuery: 'un thriller spatial', filters: { mediaType: 'Films' } }
  }, first);
  assert.equal(first.statusCode, 200);
  const afterFirst = response();
  await searchHandler({ method: 'GET', query: { action: 'quota' }, headers, body: {} }, afterFirst);
  assert.equal(afterFirst.payload.remaining, 0);

  const blocked = response();
  await searchHandler({
    method: 'POST', query: {}, headers,
    body: { query: 'un thriller spatial', rawQuery: 'un thriller spatial', filters: { mediaType: 'Films' } }
  }, blocked);
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.payload.code, 'QUOTA_EXCEEDED');
  assert.equal(blocked.payload.max, 1);
});

test('signup invitation is stronger than login and leaves results in the page flow', () => {
  const markup = renderToStaticMarkup(React.createElement(GuestSignupPrompt, {
    onSignup() {}, onLogin() {}, onDismiss() {}
  }));
  assert.match(markup, /Inscris-toi gratuitement pour profiter de 3 recherches par jour\./);
  assert.ok(markup.indexOf('S’inscrire gratuitement') < markup.indexOf('Se connecter'));
  assert.match(markup, /bg-\[#e50914\]/);
  assert.match(markup, /max-w-xl min-w-0/);
  assert.doesNotMatch(markup, /fixed inset-0|aria-modal|backdrop-blur/);
  assert.match(markup, /Tes résultats restent disponibles juste au-dessus\./);
  assert.doesNotMatch(markup, /role="status"/);
});

test.after(() => { globalThis.fetch = originalFetch; });
