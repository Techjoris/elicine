/**
 * Produit Paddle « Eliciné Supporter » : soutiens ponctuels qui ne doivent jamais
 * activer le Pass Pro, et qui ne peuvent pas être comptés deux fois.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupporterTransaction, supporterContribution, SUPPORTER_PRODUCT_TYPE } from '../../api/_paddle-supporter.js';
import { normalizePaddleEvent } from '../../api/_paddle-activation.js';
import { processPaddleWebhookEvent } from '../../api/paddle-webhook.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function createFakeSupabase({ profiles = [], events = [] } = {}) {
  const state = {
    profiles: profiles.map(row => ({ ...row })),
    subscriptions: [],
    paddle_webhook_events: events.map(row => ({ ...row })),
    supporter_contributions: []
  };
  const match = (row, filters) => filters.every(([op, column, value]) => op === 'eq'
    ? String(row[column]) === String(value)
    : String(row[column] ?? '').toLowerCase() === String(value).toLowerCase());

  class Query {
    constructor(table) { this.table = table; this.filters = []; this.operation = 'select'; this.payload = null; this.max = null; }
    select() { return this; }
    eq(column, value) { this.filters.push(['eq', column, value]); return this; }
    ilike(column, value) { this.filters.push(['ilike', column, value]); return this; }
    limit(value) { this.max = value; return this; }
    update(payload) { this.operation = 'update'; this.payload = payload; return this; }
    insert(payload) { this.operation = 'insert'; this.payload = payload; return Promise.resolve(this.execute()); }
    upsert(payload) { this.operation = 'upsert'; this.payload = payload; return Promise.resolve(this.execute()); }
    execute() {
      const rows = state[this.table] || (state[this.table] = []);
      if (this.operation === 'insert') {
        if (this.table === 'paddle_webhook_events' && rows.some(row => row.event_id === this.payload.event_id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        rows.push({ ...this.payload });
        return { data: [{ ...this.payload }], error: null };
      }
      if (this.operation === 'upsert') {
        const index = rows.findIndex(row => row.id === this.payload.id);
        if (index >= 0) rows[index] = { ...rows[index], ...this.payload };
        else rows.push({ ...this.payload });
        return { data: [{ ...this.payload }], error: null };
      }
      const selected = rows.filter(row => match(row, this.filters));
      if (this.operation === 'update') {
        selected.forEach(row => Object.assign(row, this.payload));
        return { data: selected.map(row => ({ id: row.id })), error: null };
      }
      return { data: (this.max == null ? selected : selected.slice(0, this.max)).map(row => ({ ...row })), error: null };
    }
    maybeSingle() { const result = this.execute(); return Promise.resolve({ data: result.data?.[0] || null, error: result.error }); }
    then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
  }

  return {
    state,
    client: {
      from(table) { return new Query(table); },
      // Même contrat que la fonction SQL record_supporter_contribution.
      async rpc(name, args) {
        assert.equal(name, 'record_supporter_contribution');
        if (state.supporter_contributions.some(row => row.event_id === args.p_event_id)) {
          return { data: { recorded: false, duplicate: true }, error: null };
        }
        state.supporter_contributions.push({
          event_id: args.p_event_id, email: args.p_email, user_id: args.p_user_id,
          amount_cents: args.p_amount_cents, currency: args.p_currency, transaction_id: args.p_transaction_id
        });
        const touched = state.profiles.filter(row =>
          (args.p_user_id && String(row.id) === String(args.p_user_id)) ||
          (args.p_email && String(row.email).toLowerCase() === String(args.p_email).toLowerCase()));
        touched.forEach(row => {
          row.is_supporter = true;
          row.supporter_total_cents = (row.supporter_total_cents || 0) + args.p_amount_cents;
          row.supporter_last_amount_cents = args.p_amount_cents;
        });
        return { data: { recorded: true, profilesUpdated: touched.length, amountCents: args.p_amount_cents }, error: null };
      }
    }
  };
}

const supporterPayload = (overrides = {}) => ({
  event_id: 'evt_supporter_1',
  event_type: 'transaction.completed',
  occurred_at: '2026-09-23T10:00:00.000Z',
  data: {
    id: 'txn_supporter_1',
    status: 'completed',
    currency_code: 'EUR',
    customer_id: 'ctm_supporter',
    custom_data: {
      product_type: SUPPORTER_PRODUCT_TYPE,
      purchase_type: 'one_time',
      supporter_amount: 5,
      user_id: USER_ID,
      user_email: 'supporter@example.com'
    },
    details: { totals: { grand_total: '500', currency_code: 'EUR' } },
    items: [{
      price: { id: 'pri_supporter_5', product_id: 'pro_supporter', billing_cycle: null, custom_data: { product_type: SUPPORTER_PRODUCT_TYPE } },
      product: { id: 'pro_supporter', custom_data: { product_type: SUPPORTER_PRODUCT_TYPE } },
      totals: { subtotal: 500 }
    }],
    ...overrides
  }
});

const subscriptionPayload = () => ({
  event_id: 'evt_pro_subscription',
  event_type: 'subscription.created',
  occurred_at: '2026-09-23T11:00:00.000Z',
  data: {
    id: 'sub_pro_1',
    customer_id: 'ctm_pro',
    status: 'active',
    currency_code: 'EUR',
    custom_data: { user_id: USER_ID, plan: 'monthly' },
    items: [{ price: { id: 'pri_01m2x2nctwa8k7cqazmebqnxm3' } }],
    current_billing_period: { ends_at: '2026-10-23T11:00:00.000Z' }
  }
});

test('a one-time Supporter transaction is recognised by product_type', () => {
  const event = normalizePaddleEvent(supporterPayload());
  assert.equal(event.priceId, 'pri_supporter_5');
  assert.equal(isSupporterTransaction(event), true);
  assert.deepEqual(supporterContribution(event), {
    amountCents: 500, currency: 'EUR', transactionId: 'txn_supporter_1',
    occurredAt: '2026-09-23T10:00:00.000Z', priceId: 'pri_supporter_5', email: 'supporter@example.com'
  });
});

test('a subscription payment is never treated as a Supporter contribution', () => {
  assert.equal(isSupporterTransaction(normalizePaddleEvent(subscriptionPayload())), false);
  const withSubscriptionId = normalizePaddleEvent(supporterPayload({ subscription_id: 'sub_x', items: [{ price: { id: 'pri_supporter_5', billing_cycle: { interval: 'month', frequency: 1 } } }] }));
  assert.equal(isSupporterTransaction(withSubscriptionId), false, 'a recurring price with a subscription id is left to the Pro flow');
});

test('a known Supporter price id is enough even without the product marker', () => {
  const previous = process.env.PADDLE_SUPPORTER_PRICE_7;
  process.env.PADDLE_SUPPORTER_PRICE_7 = 'pri_supporter_7';
  try {
    const payload = supporterPayload({ custom_data: {}, items: [{ price: { id: 'pri_supporter_7', billing_cycle: null } }] });
    payload.data.details.totals.grand_total = '700';
    assert.equal(isSupporterTransaction(normalizePaddleEvent(payload)), true);
    assert.equal(supporterContribution(normalizePaddleEvent(payload)).amountCents, 700);
  } finally {
    if (previous === undefined) delete process.env.PADDLE_SUPPORTER_PRICE_7; else process.env.PADDLE_SUPPORTER_PRICE_7 = previous;
  }
});

test('the Supporter webhook records the profile without ever granting Pro', async () => {
  const fake = createFakeSupabase({ profiles: [{ id: USER_ID, email: 'supporter@example.com', is_pro: false, expires_at: null, is_supporter: false, supporter_total_cents: 0 }] });
  const result = await processPaddleWebhookEvent(supporterPayload(), { supabase: fake.client, signatureVerified: true });

  assert.equal(result.success, true);
  assert.equal(result.supporter, true);
  assert.equal(result.isPro, false);
  assert.equal(result.processed, true);
  const profile = fake.state.profiles[0];
  assert.equal(profile.is_supporter, true);
  assert.equal(profile.supporter_total_cents, 500);
  assert.equal(profile.is_pro, false, 'un soutien ponctuel n’active jamais le Pass Pro');
  assert.equal(fake.state.subscriptions.length, 0, 'aucun abonnement créé');
});

test('replaying the same webhook never counts the contribution twice', async () => {
  const fake = createFakeSupabase({ profiles: [{ id: USER_ID, email: 'supporter@example.com', is_pro: false, is_supporter: true, supporter_total_cents: 500 }] });
  const first = await processPaddleWebhookEvent(supporterPayload(), { supabase: fake.client, signatureVerified: true });
  const second = await processPaddleWebhookEvent(supporterPayload(), { supabase: fake.client, signatureVerified: true });

  assert.equal(first.processed, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.processed, false);
  assert.equal(fake.state.profiles[0].supporter_total_cents, 1000, 'le total reste celui d’un seul paiement de 5 €');
  assert.equal(fake.state.supporter_contributions.length, 1);
});

test('a second, different contribution adds up on the same account', async () => {
  const fake = createFakeSupabase({ profiles: [{ id: USER_ID, email: 'supporter@example.com', is_pro: false, is_supporter: true, supporter_total_cents: 500 }] });
  await processPaddleWebhookEvent(supporterPayload(), { supabase: fake.client, signatureVerified: true });
  const bigger = supporterPayload({ id: 'txn_supporter_2' });
  bigger.event_id = 'evt_supporter_2';
  bigger.data.details.totals.grand_total = '5000';
  bigger.data.custom_data.supporter_amount = 50;
  await processPaddleWebhookEvent(bigger, { supabase: fake.client, signatureVerified: true });
  // 500 déjà présents + 500 (1 € → déjà compté dans le profil de départ) ... le premier
  // événement ajoute 5 €, le second 50 € : 500 + 500 + 5000.
  assert.equal(fake.state.profiles[0].supporter_total_cents, 6000);
});

test('a Supporter payment from an unknown visitor is still recorded', async () => {
  const fake = createFakeSupabase({ profiles: [] });
  const payload = supporterPayload();
  delete payload.data.custom_data.user_id;
  const result = await processPaddleWebhookEvent(payload, { supabase: fake.client, signatureVerified: true });
  assert.equal(result.success, true);
  assert.equal(result.supporter, true);
  assert.equal(fake.state.supporter_contributions.length, 1);
});

test('the Pro subscription flow still activates Pro (non-régression)', async () => {
  const fake = createFakeSupabase({ profiles: [{ id: USER_ID, email: 'paid@example.com', is_pro: false, expires_at: null, is_supporter: false }] });
  const result = await processPaddleWebhookEvent(subscriptionPayload(), { supabase: fake.client, signatureVerified: true });
  assert.equal(result.isPro, true);
  assert.equal(fake.state.profiles[0].is_pro, true);
  assert.equal(fake.state.profiles[0].is_supporter, false, 'un abonnement Pro ne rend pas Supporter');
});
