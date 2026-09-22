/**
 * Audit de configuration Paddle : il doit confirmer ce qui est prêt et signaler
 * précisément ce qui manque, sans jamais exposer de secret.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { auditPaddle } from '../../api/paddle-diagnostics.js';

const PRO_MONTHLY = 'pri_01m2x2nctwa8k7cqazmebqnxm3';
const PRO_YEARLY = 'pri_01m2x8yc8y1k9b5bej81me7dbd';

const recurring = (id, euros, interval = 'month') => ({
  id, product_id: 'pro_elicline', status: 'active',
  unit_price: { amount: String(euros * 100), currency_code: 'EUR' },
  billing_cycle: { interval, frequency: 1 }
});
const oneTime = (id, euros) => ({
  id, product_id: 'pro_supporter', status: 'active',
  unit_price: { amount: String(euros * 100), currency_code: 'EUR' },
  billing_cycle: null
});

function stubPaddleApi({ products, prices, notifications, transactions = [] }) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    const href = String(url);
    calls.push(href);
    const data = href.includes('/products') ? products
      : href.includes('/prices') ? prices
        : href.includes('/notification-settings') ? notifications
          : href.includes('/transactions') ? transactions : [];
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

const goodConfiguration = () => stubPaddleApi({
  products: [
    { id: 'pro_elicline', name: 'Éliciné Pass Pro', status: 'active' },
    { id: 'pro_supporter', name: 'Eliciné Supporter', status: 'active', custom_data: { product_type: 'elicine_supporter' } }
  ],
  prices: [
    recurring(PRO_MONTHLY, 1.99), recurring(PRO_YEARLY, 19.9, 'year'),
    ...[1, 2, 3, 5, 7, 10, 50].map(amount => oneTime(`pri_supporter_${amount}`, amount))
  ],
  notifications: [{
    id: 'ntf_1', type: 'url', active: true,
    destination: 'https://elicine.app/api/paddle-webhook',
    subscribed_events: ['transaction.completed', 'subscription.created', 'subscription.updated', 'subscription.canceled']
      .map(name => ({ name, group: 'Transaction', available_versions: [1] }))
  }],
  transactions: [{ id: 'txn_1', status: 'completed', created_at: '2026-09-23T09:00:00Z', currency_code: 'EUR', details: { totals: { grand_total: '500' } } }]
});

test('a fully configured Paddle account raises no warning', async () => {
  const stub = goodConfiguration();
  try {
    const audit = await auditPaddle({ key: 'pdl_test_key_value', base: 'https://api.paddle.com' });
    assert.deepEqual(audit.warnings, []);
    assert.equal(audit.pro.monthly.recurring, true);
    assert.equal(audit.pro.monthly.amount, 1.99);
    assert.equal(audit.pro.yearly.interval, 'year');
    assert.equal(audit.supporter.product.productType, 'elicine_supporter');
    assert.deepEqual(audit.supporter.missingAmounts, []);
    assert.equal(audit.supporter.amounts['50'], 'pri_supporter_50');
    assert.equal(audit.recentTransactions[0].total, 5);
    assert.ok(!JSON.stringify(audit).includes('pdl_test_key_value'), 'aucune clé API dans le rapport');
  } finally { stub.restore(); }
});

test('the audit names exactly what is missing or misconfigured', async () => {
  const stub = stubPaddleApi({
    products: [
      { id: 'pro_elicline', name: 'Éliciné Pass Pro', status: 'active' },
      { id: 'pro_other', name: 'Eliciné Supporter', status: 'active' }
    ],
    prices: [
      { ...recurring(PRO_MONTHLY, 1.99), billing_cycle: null },
      recurring(PRO_YEARLY, 19.9, 'year'),
      { ...oneTime('pri_supporter_1', 1), product_id: 'pro_other' },
      { ...oneTime('pri_supporter_2', 2), product_id: 'pro_other' },
      { ...oneTime('pri_supporter_5', 5), product_id: 'pro_other' },
      { ...recurring('pri_supporter_7', 7), product_id: 'pro_other' }
    ],
    notifications: [{
      id: 'ntf_2', type: 'url', active: false,
      destination: 'https://exemple.test/webhook',
      subscribed_events: [{ name: 'transaction.completed' }]
    }]
  });
  try {
    const audit = await auditPaddle({ key: 'pdl_test', base: 'https://api.paddle.com' });
    const warnings = audit.warnings.join(' | ');
    assert.match(warnings, /Le prix Pro monthly n'est pas récurrent/);
    assert.match(warnings, /Montants Supporter sans prix ponctuel en euros : 3, 7, 10, 50/);
    assert.match(warnings, /Aucune notification Paddle ne pointe vers/);
    assert.deepEqual(audit.supporter.missingAmounts, [3, 7, 10, 50]);
    assert.equal(audit.supporter.product.productType, null, 'produit reconnu par son nom');
  } finally { stub.restore(); }
});

test('an inactive webhook subscription and missing events are reported', async () => {
  const stub = stubPaddleApi({
    products: [
      { id: 'pro_elicline', name: 'Éliciné Pass Pro', status: 'active' },
      { id: 'pro_supporter', name: 'Eliciné Supporter', status: 'active', custom_data: { product_type: 'elicine_supporter' } }
    ],
    prices: [recurring(PRO_MONTHLY, 1.99), recurring(PRO_YEARLY, 19.9, 'year'), ...[1, 2, 3, 5, 7, 10, 50].map(amount => oneTime(`pri_supporter_${amount}`, amount))],
    notifications: [{
      id: 'ntf_3', type: 'url', active: false,
      destination: 'https://elicine.app/api/paddle-webhook',
      subscribed_events: [{ name: 'transaction.completed' }]
    }]
  });
  try {
    const audit = await auditPaddle({ key: 'pdl_test', base: 'https://api.paddle.com' });
    const warnings = audit.warnings.join(' | ');
    assert.match(warnings, /La notification Paddle vers notre webhook est désactivée/);
    assert.match(warnings, /Événements non souscrits : subscription.created, subscription.updated, subscription.canceled/);
    assert.equal(audit.webhook.id, 'ntf_3');
  } finally { stub.restore(); }
});

test('a wildcard subscription counts as everything and raises no event warning', async () => {
  const stub = stubPaddleApi({
    products: [
      { id: 'pro_elicline', name: 'Éliciné Pass Pro', status: 'active' },
      { id: 'pro_supporter', name: 'Eliciné Supporter', status: 'active', custom_data: { product_type: 'elicine_supporter' } }
    ],
    prices: [recurring(PRO_MONTHLY, 1.99), recurring(PRO_YEARLY, 19.9, 'year'), ...[1, 2, 3, 5, 7, 10, 50].map(amount => oneTime(`pri_supporter_${amount}`, amount))],
    notifications: [{ id: 'ntf_4', type: 'url', active: true, destination: 'https://elicine.app/api/paddle-webhook', subscribed_events: [{ name: '*' }] }]
  });
  try {
    const audit = await auditPaddle({ key: 'pdl_test', base: 'https://api.paddle.com' });
    assert.deepEqual(audit.warnings, []);
    assert.equal(audit.webhook.subscribesToEverything, true);
  } finally { stub.restore(); }
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

test('the endpoint is closed by default and only opens with its token', async () => {
  const previousToken = process.env.PADDLE_DIAGNOSTICS_TOKEN;
  const previousKey = process.env.PADDLE_API_KEY;
  delete process.env.PADDLE_DIAGNOSTICS_TOKEN;
  delete process.env.PADDLE_API_KEY;
  try {
    const closed = fakeResponse();
    await handler({ method: 'GET', headers: {} }, closed);
    assert.equal(closed.code, 503);

    process.env.PADDLE_DIAGNOSTICS_TOKEN = 'jeton-de-test';
    const unauthorised = fakeResponse();
    await handler({ method: 'GET', headers: { authorization: 'Bearer mauvais' } }, unauthorised);
    assert.equal(unauthorised.code, 401);

    const stub = goodConfiguration();
    try {
      process.env.PADDLE_API_KEY = 'pdl_test_key_value';
      const res = fakeResponse();
      await handler({ method: 'GET', headers: { authorization: 'Bearer jeton-de-test' } }, res);
      assert.equal(res.code, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.env.PADDLE_API_KEY, true);
      assert.equal(res.body.paddle.supporter.amounts['5'], 'pri_supporter_5');
      assert.ok(res.body.warnings.some(warning => /SUPABASE_SERVICE_ROLE_KEY/.test(warning)));
      assert.ok(!JSON.stringify(res.body).includes('pdl_test_key_value'));
    } finally { stub.restore(); }
  } finally {
    if (previousToken === undefined) delete process.env.PADDLE_DIAGNOSTICS_TOKEN; else process.env.PADDLE_DIAGNOSTICS_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.PADDLE_API_KEY; else process.env.PADDLE_API_KEY = previousKey;
  }
});

test('the endpoint refuses other methods', async () => {
  const res = fakeResponse();
  await handler({ method: 'POST', headers: {} }, res);
  assert.equal(res.code, 405);
});
