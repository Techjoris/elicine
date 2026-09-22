/**
 * Résolution automatique des price_id du produit Paddle « Eliciné Supporter » :
 * plus aucun identifiant à recopier à la main, et les soutiens restent ponctuels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { findSupporterPrices, mapSupporterPrices } from '../../api/supporter-prices.js';
import { isSupporterTierAvailable, resolveSupporterPrices, effectiveSupporterPriceId, SUPPORTER_TIERS } from '../../src/services/supporterService.ts';

const price = (id, euros, extra = {}) => ({
  id, product_id: 'pro_supporter', status: 'active',
  unit_price: { amount: String(euros * 100), currency_code: 'EUR' },
  billing_cycle: null, ...extra
});

function stubPaddle({ products, prices, status = 200 }) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/products')) return { ok: status === 200, status, json: async () => ({ data: products || [] }) };
    if (href.includes('/prices')) return { ok: status === 200, status, json: async () => ({ data: prices || [] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

const supporterProduct = { id: 'pro_supporter', name: 'Eliciné Supporter', custom_data: { product_type: 'elicine_supporter' } };

test('only one-time EUR prices matching our seven amounts are kept', () => {
  const mapped = mapSupporterPrices([
    price('pri_1', 1), price('pri_2', 2), price('pri_3', 3), price('pri_5', 5),
    price('pri_7', 7), price('pri_10', 10), price('pri_50', 50),
    price('pri_recurring', 5, { billing_cycle: { interval: 'month', frequency: 1 } }),
    price('pri_usd', 5, { unit_price: { amount: '500', currency_code: 'USD' } }),
    price('pri_other', 12)
  ]);
  assert.deepEqual(mapped, {
    1: 'pri_1', 2: 'pri_2', 3: 'pri_3', 5: 'pri_5', 7: 'pri_7', 10: 'pri_10', 50: 'pri_50'
  });
});

test('the product is found through product_type, then through its name', async () => {
  const stub = stubPaddle({ products: [supporterProduct], prices: [price('pri_5', 5)] });
  try {
    const result = await findSupporterPrices({ key: 'pdl_test', base: 'https://api.paddle.com' });
    assert.equal(result.productId, 'pro_supporter');
    assert.deepEqual(result.prices, { 5: 'pri_5' });
    assert.ok(stub.calls.some(url => url.includes('product_id=pro_supporter')));
  } finally { stub.restore(); }

  const byName = stubPaddle({ products: [{ id: 'pro_other', name: 'Eliciné Supporter' }], prices: [price('pri_1', 1)] });
  try {
    assert.equal((await findSupporterPrices({ key: 'pdl_test', base: 'https://api.paddle.com' })).productId, 'pro_other');
  } finally { byName.restore(); }
});

test('a missing API key, a missing product and a product without prices are reported clearly', async () => {
  await assert.rejects(findSupporterPrices({ key: '', base: 'https://api.paddle.com' }), /PADDLE_API_KEY_MISSING/);

  const noProduct = stubPaddle({ products: [{ id: 'pro_pro', name: 'Éliciné Pass Pro' }], prices: [] });
  try { await assert.rejects(findSupporterPrices({ key: 'pdl_test', base: 'https://api.paddle.com' }), /PRODUCT_NOT_FOUND/); }
  finally { noProduct.restore(); }

  const noPrice = stubPaddle({ products: [supporterProduct], prices: [price('pri_99', 99)] });
  try { await assert.rejects(findSupporterPrices({ key: 'pdl_test', base: 'https://api.paddle.com' }), /NO_PRICES_FOUND/); }
  finally { noPrice.restore(); }
});

function fakeResponse() {
  return {
    headers: {}, code: null, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

test('GET /api/supporter-prices answers the price map and is cacheable', async () => {
  const previous = process.env.PADDLE_API_KEY;
  process.env.PADDLE_API_KEY = 'pdl_test';
  const stub = stubPaddle({
    products: [supporterProduct],
    prices: [1, 2, 3, 5, 7, 10, 50].map(amount => price(`pri_${amount}`, amount))
  });
  try {
    const res = fakeResponse();
    await handler({ method: 'GET' }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.complete, true);
    assert.equal(res.body.prices['50'], 'pri_50');
    assert.match(res.headers['Cache-Control'], /s-maxage=600/);
  } finally {
    stub.restore();
    if (previous === undefined) delete process.env.PADDLE_API_KEY; else process.env.PADDLE_API_KEY = previous;
  }
});

test('the endpoint refuses other methods and fails closed without a key', async () => {
  const post = fakeResponse();
  await handler({ method: 'POST' }, post);
  assert.equal(post.code, 405);

  const previous = process.env.PADDLE_API_KEY;
  delete process.env.PADDLE_API_KEY;
  delete process.env.VITE_PADDLE_API_KEY;
  try {
    const res = fakeResponse();
    await handler({ method: 'GET' }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body.success, false);
  } finally {
    if (previous !== undefined) process.env.PADDLE_API_KEY = previous;
  }
});

test('the client fills the missing amounts from the API and keeps them usable', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async url => ({
    ok: true, status: 200,
    json: async () => ({ success: true, prices: { 1: 'pri_apisupporter01', 5: 'pri_apisupporter05' } })
  });
  try {
    await resolveSupporterPrices();
    assert.equal(effectiveSupporterPriceId(1), 'pri_apisupporter01');
    assert.equal(effectiveSupporterPriceId(5), 'pri_apisupporter05');
    assert.equal(isSupporterTierAvailable(SUPPORTER_TIERS[0]), true);
    assert.equal(isSupporterTierAvailable(SUPPORTER_TIERS.find(tier => tier.amount === 50)), false, 'les montants absents restent indisponibles');
    assert.equal(effectiveSupporterPriceId(50), '');
  } finally { globalThis.fetch = previous; }
});
