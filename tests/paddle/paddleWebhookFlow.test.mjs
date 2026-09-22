/**
 * Paddle Billing webhook flow (subscription mapping, status sync, idempotence,
 * raw-body signature). Fixtures follow Paddle Billing v2 webhook payloads.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import {
  applyPaddleSubscription,
  hasProcessedPaddleEvent,
  mapPaddleStatus,
  normalizePaddleEvent,
  recordPaddleEventProcessed,
  resolvePaddleIdentity
} from '../../api/_paddle-activation.js';
import { processPaddleWebhookEvent, verifyPaddleWebhookSignature } from '../../api/paddle-webhook.ts';

function createFakeSupabase({ profiles = [], subscriptions = [], events = [] } = {}) {
  const state = {
    profiles: profiles.map(row => ({ ...row })),
    subscriptions: subscriptions.map(row => ({ ...row })),
    paddle_webhook_events: events.map(row => ({ ...row }))
  };
  const calls = [];
  const match = (row, filters) => filters.every(([op, column, value]) => op === 'eq'
    ? String(row[column]) === String(value)
    : String(row[column] ?? '').toLowerCase() === String(value).toLowerCase());

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.operation = 'select';
      this.payload = null;
      this.max = null;
    }
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
        if (this.table === 'paddle_webhook_events' &&
            rows.some(row => row.event_id === this.payload.event_id)) {
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

    maybeSingle() {
      const result = this.execute();
      return Promise.resolve({ data: result.data?.[0] || null, error: result.error });
    }

    then(resolve, reject) {
      return Promise.resolve(this.execute()).then(resolve, reject);
    }
  }

  return {
    state,
    calls,
    client: {
      from(table) {
        calls.push({ table, op: 'from' });
        return new Query(table);
      }
    }
  };
}

const subscriptionCreated = (overrides = {}) => ({
  event_id: 'evt_01test_subscription_created',
  event_type: 'subscription.created',
  occurred_at: '2026-09-22T18:00:00.000Z',
  data: {
    id: 'sub_01test',
    customer_id: 'ctm_01test',
    status: 'active',
    currency_code: 'EUR',
    custom_data: { user_id: '11111111-1111-4111-8111-111111111111', plan: 'monthly', billing_cycle: 'monthly' },
    items: [{ price: { id: 'pri_01m2x2nctwa8k7cqazmebqnxm3' } }],
    current_billing_period: { ends_at: '2026-10-22T18:00:00.000Z' },
    ...overrides
  }
});

test('subscription.created maps customer_id and custom_data.user_id without requiring an email', async () => {
  const fake = createFakeSupabase({ profiles: [{
    id: '11111111-1111-4111-8111-111111111111',
    email: 'paid.user@example.com',
    is_pro: false,
    expires_at: null
  }] });
  const event = normalizePaddleEvent(subscriptionCreated());
  assert.equal(event.subscriptionId, 'sub_01test');
  assert.equal(event.customerId, 'ctm_01test');
  assert.equal(event.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal(event.email, null);

  const identity = await resolvePaddleIdentity({ supabase: fake.client, event });
  assert.deepEqual(identity, {
    email: 'paid.user@example.com',
    userId: '11111111-1111-4111-8111-111111111111',
    source: 'custom_data_user_id'
  });

  const result = await applyPaddleSubscription({ supabase: fake.client, identity, event });
  assert.equal(result.success, true);
  assert.equal(result.isPro, true);
  assert.equal(fake.state.profiles[0].is_pro, true);
  assert.equal(fake.state.profiles[0].expires_at, '2026-10-22T18:00:00.000Z');
  const subscription = fake.state.subscriptions[0];
  assert.equal(subscription.paddle_customer_id, 'ctm_01test');
  assert.equal(subscription.paddle_subscription_id, 'sub_01test');
  assert.equal(subscription.status, 'active');
});

test('subscription.updated synchronises active, trialing, past_due and canceled', async () => {
  const future = '2026-10-22T18:00:00.000Z';
  const past = '2026-09-01T00:00:00.000Z';
  assert.equal(mapPaddleStatus('trialing', { expiresAt: future }).isPro, true);
  assert.equal(mapPaddleStatus('past_due', { expiresAt: future }).isPro, true);
  assert.equal(mapPaddleStatus('past_due', { expiresAt: past }).isPro, false);
  assert.equal(mapPaddleStatus('canceled', { expiresAt: future }).isPro, true);
  assert.equal(mapPaddleStatus('canceled', { expiresAt: past }).isPro, false);
  assert.equal(mapPaddleStatus('paused', { expiresAt: future }).isPro, false);

  const fake = createFakeSupabase({ profiles: [{
    id: '11111111-1111-4111-8111-111111111111',
    email: 'paid.user@example.com',
    is_pro: true,
    expires_at: future
  }] });
  const event = normalizePaddleEvent({
    event_id: 'evt_01test_subscription_canceled',
    event_type: 'subscription.updated',
    data: {
      id: 'sub_01test',
      customer_id: 'ctm_01test',
      status: 'canceled',
      custom_data: { user_id: '11111111-1111-4111-8111-111111111111' },
      current_billing_period: { ends_at: future }
    }
  });
  const identity = await resolvePaddleIdentity({ supabase: fake.client, event });
  const result = await applyPaddleSubscription({ supabase: fake.client, identity, event });
  assert.equal(result.status, 'canceled');
  assert.equal(result.isPro, true);
  assert.equal(fake.state.subscriptions[0].status, 'canceled');
  assert.equal(fake.state.subscriptions[0].paddle_status, 'canceled');
});

test('transaction.completed activates only after the transaction status is mapped to access', async () => {
  const fake = createFakeSupabase({ profiles: [{
    id: '11111111-1111-4111-8111-111111111111',
    email: 'paid.user@example.com',
    is_pro: false,
    expires_at: null
  }] });
  const event = normalizePaddleEvent({
    event_id: 'evt_01test_transaction_completed',
    event_type: 'transaction.completed',
    data: {
      id: 'txn_01test',
      subscription_id: 'sub_01test',
      customer_id: 'ctm_01test',
      status: 'completed',
      custom_data: { user_id: '11111111-1111-4111-8111-111111111111', plan: 'monthly' },
      items: [{ price: { id: 'pri_01m2x2nctwa8k7cqazmebqnxm3' } }]
    }
  });
  const identity = await resolvePaddleIdentity({ supabase: fake.client, event });
  const result = await applyPaddleSubscription({ supabase: fake.client, identity, event });
  assert.equal(result.isPro, true);
  assert.equal(result.status, 'active');
  assert.equal(fake.state.profiles[0].is_pro, true);
});

test('events are idempotent through paddle_webhook_events', async () => {
  const fake = createFakeSupabase();
  const event = normalizePaddleEvent(subscriptionCreated());
  assert.equal(await hasProcessedPaddleEvent({ supabase: fake.client, eventId: event.eventId }), false);
  const first = await recordPaddleEventProcessed({ supabase: fake.client, event });
  assert.equal(first.recorded, true);
  assert.equal(await hasProcessedPaddleEvent({ supabase: fake.client, eventId: event.eventId }), true);
  const duplicate = await recordPaddleEventProcessed({ supabase: fake.client, event });
  assert.equal(duplicate.duplicate, true);
});

test('Paddle-Signature is verified on the exact raw body', async () => {
  const secret = 'pdl_ntfset_test_secret';
  const rawBody = JSON.stringify(subscriptionCreated());
  const timestamp = '1770000000';
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}:${rawBody}`).digest('hex');
  assert.equal(await verifyPaddleWebhookSignature(`ts=${timestamp};h1=${signature}`, rawBody, secret), true);
  assert.equal(await verifyPaddleWebhookSignature(`ts=${timestamp};h1=${signature}`, `${rawBody} `, secret), false);
  assert.equal(await verifyPaddleWebhookSignature(`ts=${timestamp};h1=deadbeef`, rawBody, secret), false);
});

test('the webhook handler activates a paid subscription and acknowledges the duplicate idempotently', async () => {
  const fake = createFakeSupabase({ profiles: [{
    id: '11111111-1111-4111-8111-111111111111',
    email: 'paid.user@example.com',
    is_pro: false,
    expires_at: null
  }] });
  const payload = subscriptionCreated();
  const first = await processPaddleWebhookEvent(payload, {
    supabase: fake.client,
    rawBody: JSON.stringify(payload),
    signatureVerified: true
  });
  assert.equal(first.success, true);
  assert.equal(first.processed, true);
  assert.equal(first.isPro, true);
  assert.equal(fake.state.profiles[0].is_pro, true);
  assert.equal(fake.state.subscriptions[0].paddle_subscription_id, 'sub_01test');
  assert.equal(fake.state.paddle_webhook_events.length, 1);

  const second = await processPaddleWebhookEvent(payload, {
    supabase: fake.client,
    rawBody: JSON.stringify(payload),
    signatureVerified: true
  });
  assert.equal(second.duplicate, true);
  assert.equal(fake.state.profiles[0].expires_at, '2026-10-22T18:00:00.000Z');
});
