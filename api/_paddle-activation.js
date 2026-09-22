/**
 * Paddle Billing subscription synchronisation.
 *
 * Paddle subscription webhooks are identified by `data.id` (sub_...) and
 * `data.customer_id` (ctm_...). They do not always carry the payer's email.
 * This module resolves the Supabase user from the checkout custom_data, the
 * stored Paddle identifiers or the customer API, then applies the real
 * subscription status. It is deliberately separate from the SASPay activation
 * path.
 */
export const PADDLE_SUBSCRIPTION_STATUSES = Object.freeze([
  'active', 'trialing', 'past_due', 'canceled', 'cancelled', 'paused'
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];

export function isPaddleUuid(value) {
  return UUID_RE.test(clean(value));
}

function payloadHash(rawBody) {
  // Small deterministic fingerprint for telemetry/idempotency inspection. The
  // signature remains the cryptographic guarantee; this hash is never used to
  // authenticate a request.
  let hash = 2166136261;
  for (let index = 0; index < rawBody.length; index += 1) {
    hash ^= rawBody.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function extractPaddleEmail(target) {
  if (!target) return null;
  if (typeof target === 'string') {
    const match = target.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? lower(match[0]) : null;
  }
  if (typeof target !== 'object') return null;

  const direct = [
    target.email,
    target.customer?.email,
    target.details?.customer?.email,
    target.custom_data?.email,
    target.custom_data?.user_email,
    target.custom_data?.customer_email,
    target.customer_email,
    target.user_email,
    target.buyer_email
  ];
  for (const value of direct) {
    if (typeof value === 'string' && value.includes('@')) return lower(value);
  }

  try {
    const serialized = JSON.stringify(target);
    const matches = serialized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    return matches.map(lower).find(value => !value.includes('paddle.com')) || lower(matches[0]) || null;
  } catch {
    return null;
  }
}

/**
 * Normalize one Paddle Billing event into the fields the sync needs. The event
 * identifier is the deduplication key; the subscription identifier is data.id
 * only for subscription events, never for a transaction.
 */
export function normalizePaddleEvent(payload = {}, rawBody = '') {
  const body = payload || {};
  const data = body.data || {};
  const eventType = lower(body.event_type || body.type || body.eventType);
  const isSubscriptionEvent = eventType.startsWith('subscription.');
  const isTransactionEvent = eventType.startsWith('transaction.');
  const customData = data.custom_data || body.custom_data || {};
  const subscriptionId = clean(
    data.subscription_id ||
    data.subscriptionId ||
    customData.subscription_id ||
    (isSubscriptionEvent ? data.id : '')
  ) || null;
  const transactionId = clean(
    data.transaction_id ||
    data.last_transaction_id ||
    (isTransactionEvent ? data.id : '') ||
    customData.transaction_id
  ) || null;
  const customerId = clean(data.customer_id || data.customer?.id) || null;
  const status = lower(data.status || data.subscription?.status) || null;
  const priceId = clean(
    data.items?.[0]?.price?.id ||
    data.items?.[0]?.price_id ||
    customData.price_id
  ) || null;
  const period = data.current_billing_period || data.billing_period || data.subscription?.current_billing_period || {};
  const expiresAt = clean(
    period.ends_at ||
    data.next_billed_at ||
    data.canceled_at ||
    customData.expires_at
  ) || null;

  return {
    eventId: clean(body.event_id || body.eventId || body.id) || null,
    eventType,
    occurredAt: clean(body.occurred_at || body.occurredAt) || null,
    data,
    customData,
    subscriptionId,
    transactionId,
    customerId,
    status,
    priceId,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    userId: clean(
      customData.user_id ||
      customData.userId ||
      customData.supabase_user_id
    ) || null,
    email: extractPaddleEmail(data) || extractPaddleEmail(body),
    payloadHash: rawBody ? payloadHash(rawBody) : null
  };
}

/**
 * Access policy: active and trialing grant Pro immediately. past_due and
 * canceled keep the existing grace period only until the paid period ends.
 * paused removes access.
 */
export function mapPaddleStatus(status, { expiresAt = null, now = Date.now() } = {}) {
  const normalized = lower(status) || 'unknown';
  const periodEnd = expiresAt ? new Date(expiresAt).getTime() : null;
  const periodIsFuture = Number.isFinite(periodEnd) && periodEnd > now;

  if (normalized === 'active' || normalized === 'trialing') {
    return { isPro: true, access: 'granted', subscriptionStatus: normalized };
  }
  if (normalized === 'past_due') {
    return { isPro: periodIsFuture, access: periodIsFuture ? 'grace_period' : 'denied',
      subscriptionStatus: normalized };
  }
  if (normalized === 'canceled' || normalized === 'cancelled') {
    return { isPro: periodIsFuture, access: periodIsFuture ? 'until_period_end' : 'denied',
      subscriptionStatus: 'canceled' };
  }
  if (normalized === 'paused') {
    return { isPro: false, access: 'denied', subscriptionStatus: normalized };
  }
  return { isPro: false, access: 'unknown', subscriptionStatus: normalized };
}

export function paddlePlanFromEvent(event = {}) {
  const plan = lower(event.customData?.plan || event.customData?.billing_cycle);
  if (plan === 'yearly' || plan === 'annual' || plan.includes('annu')) return 'yearly';
  if (event.priceId === 'pri_01m2x8yc8y1k9b5bej81me7dbd') return 'yearly';
  return 'monthly';
}

export function paddleExpiresAt(event = {}, { now = new Date().toISOString() } = {}) {
  if (event.expiresAt) return event.expiresAt;
  const status = lower(event.status);
  const grantsByStatus = status === 'active' || status === 'trialing';
  const isTransaction = event.eventType === 'transaction.completed' || event.eventType === 'transaction.paid';
  if (!grantsByStatus && !isTransaction) return null;
  const days = paddlePlanFromEvent(event) === 'yearly' ? 365 : 30;
  return new Date(new Date(now).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function legacyStatus(status) {
  const normalized = lower(status);
  if (normalized === 'active' || normalized === 'trialing' || normalized === 'past_due') return 'active';
  if (normalized === 'paused') return 'pending_payment';
  return 'cancelled';
}

function isSchemaError(error) {
  const code = String(error?.code || '');
  return code === 'PGRST205' || code === '42703' || code === '42P01' || code === '23514';
}

/**
 * Resolve the Supabase account behind a Paddle event. custom_data.user_id is
 * the direct hand-off from the checkout; customer_id and subscription_id are
 * the fallback so even an event without an email can be mapped.
 */
export async function resolvePaddleIdentity({ supabase, event, fetchCustomer = null, calls = [] } = {}) {
  if (event.email) return { email: event.email, userId: event.userId || null, source: 'event_email' };
  if (!supabase) return null;

  if (isPaddleUuid(event.userId)) {
    calls.push({ table: 'profiles', op: 'select', by: 'id', value: event.userId });
    const { data } = await supabase.from('profiles').select('id,email').eq('id', event.userId).maybeSingle();
    if (data?.email) return { email: lower(data.email), userId: data.id, source: 'custom_data_user_id' };
  }

  if (event.subscriptionId || event.customerId || event.transactionId) {
    const filter = event.subscriptionId
      ? { field: 'paddle_subscription_id', value: event.subscriptionId }
      : event.customerId
        ? { field: 'paddle_customer_id', value: event.customerId }
        : { field: 'payment_reference', value: event.transactionId };
    calls.push({ table: 'subscriptions', op: 'select', by: filter.field, value: filter.value });
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id,email,user_id,paddle_customer_id,paddle_subscription_id')
      .eq(filter.field, filter.value)
      .limit(1);
    if (!error && Array.isArray(data) && data[0]?.email) {
      return { email: lower(data[0].email), userId: data[0].user_id || event.userId || null,
        source: `subscriptions.${filter.field}` };
    }
  }

  if (event.customerId && typeof fetchCustomer === 'function') {
    try {
      const customer = await fetchCustomer(event.customerId);
      const email = extractPaddleEmail(customer);
      if (email) return { email, userId: event.userId || null, source: 'paddle_customer_api' };
    } catch (error) {
      calls.push({ table: 'paddle_api', op: 'customer', error: error?.message || String(error) });
    }
  }

  return null;
}

async function syncProfile({ supabase, identity, isPro, expiresAt, now, calls }) {
  const payload = {
    is_pro: Boolean(isPro),
    expires_at: expiresAt || null,
    updated_at: now
  };
  calls.push({ table: 'profiles', op: 'update', by: identity.userId ? 'id' : 'email',
    value: identity.userId || identity.email, payload });

  let query = supabase.from('profiles').update(payload);
  query = isPaddleUuid(identity.userId)
    ? query.eq('id', identity.userId)
    : query.ilike('email', identity.email);
  const { data, error } = await query.select('id');
  if (!error && Array.isArray(data) && data.length > 0) {
    return { updated: true, profileId: data[0].id || identity.userId || null, error: null };
  }

  if (!identity.userId && !error) {
    const byEmail = await supabase.from('profiles').select('id,email')
      .ilike('email', identity.email).maybeSingle();
    if (byEmail.data?.id) return { updated: true, profileId: byEmail.data.id, error: null };
  }

  if (isPaddleUuid(identity.userId)) {
    const insertPayload = {
      id: identity.userId,
      email: identity.email,
      is_pro: Boolean(isPro),
      expires_at: expiresAt || null,
      updated_at: now
    };
    calls.push({ table: 'profiles', op: 'insert', value: identity.userId, payload: insertPayload });
    const { error: insertError } = await supabase.from('profiles').insert(insertPayload);
    if (!insertError) return { updated: true, inserted: true, profileId: identity.userId, error: null };
    return { updated: false, profileId: null, error: insertError.message };
  }

  return { updated: false, profileId: null, error: error?.message || 'PROFILE_NOT_FOUND' };
}

async function syncSubscription({ supabase, identity, event, access, isPro, expiresAt, now, calls }) {
  const id = event.subscriptionId || event.transactionId || `paddle_${identity.email.replace(/[^a-z0-9]/gi, '_')}`;
  const basePayload = {
    id,
    user_id: isPaddleUuid(identity.userId) ? identity.userId : `usr_${identity.email.replace(/[^a-z0-9]/gi, '_')}`,
    email: identity.email,
    customer_name: event.data?.customer?.name || event.customData?.user_name || identity.email.split('@')[0],
    plan: paddlePlanFromEvent(event),
    amount: Number(event.data?.details?.totals?.total || event.data?.details?.totals?.grand_total || 1.99),
    currency: lower(event.data?.currency_code || event.data?.details?.totals?.currency_code || 'EUR').toUpperCase(),
    status: legacyStatus(access.subscriptionStatus),
    payment_reference: event.transactionId || event.subscriptionId || null,
    payment_provider: 'paddle',
    terms_accepted: true,
    expires_at: expiresAt || null,
    updated_at: now
  };
  const paddlePayload = {
    ...basePayload,
    status: access.subscriptionStatus,
    paddle_customer_id: event.customerId || null,
    paddle_subscription_id: event.subscriptionId || null,
    paddle_status: access.subscriptionStatus,
    paddle_last_event_id: event.eventId || null,
    paddle_event_at: event.occurredAt || now
  };

  calls.push({ table: 'subscriptions', op: 'upsert', payload: paddlePayload });
  const { error } = await supabase.from('subscriptions').upsert(paddlePayload);
  if (!error) return { synced: true, mode: 'paddle', error: null };

  if (isSchemaError(error)) {
    calls.push({ table: 'subscriptions', op: 'upsert_fallback', payload: basePayload, warning: error.message });
    const fallback = await supabase.from('subscriptions').upsert(basePayload);
    if (!fallback.error) return { synced: true, mode: 'legacy', warning: error.message };
    return { synced: false, mode: 'legacy', error: fallback.error.message };
  }
  return { synced: false, mode: 'paddle', error: error.message };
}

async function readExistingExpiry({ supabase, identity, calls = [] }) {
  try {
    calls.push({ table: 'profiles', op: 'select', by: identity.userId ? 'id' : 'email',
      value: identity.userId || identity.email, columns: 'expires_at' });
    const query = supabase.from('profiles').select('id,email,expires_at');
    const { data } = isPaddleUuid(identity.userId)
      ? await query.eq('id', identity.userId).maybeSingle()
      : await query.ilike('email', identity.email).maybeSingle();
    const expiresAt = data?.expires_at || null;
    return expiresAt && !Number.isNaN(new Date(expiresAt).getTime()) ? new Date(expiresAt).toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * Apply one normalized Paddle event. The absolute period end is always used,
 * so replaying the same event never extends Pro by another month.
 */
export async function applyPaddleSubscription({ supabase, identity, event, now = new Date().toISOString(), calls = [] } = {}) {
  if (!supabase) return { success: false, processed: false, retryable: true, error: 'SUPABASE_NOT_CONFIGURED' };
  if (!identity?.email) return { success: false, processed: false, retryable: true, error: 'PADDLE_IDENTITY_NOT_RESOLVED' };

  const isTransaction = event.eventType === 'transaction.completed' || event.eventType === 'transaction.paid';
  const eventStatus = isTransaction
    ? (['completed', 'paid', '', null, undefined].includes(event.status) ? 'active' : event.status)
    : (event.status || 'unknown');
  const existingExpiry = await readExistingExpiry({ supabase, identity, calls });
  const computedExpiry = paddleExpiresAt(event, { now });
  const expiresAt = event.expiresAt || (existingExpiry &&
    new Date(existingExpiry).getTime() > Date.parse(now) ? existingExpiry : computedExpiry);
  const access = mapPaddleStatus(eventStatus, { expiresAt, now: Date.parse(now) });
  const profile = await syncProfile({ supabase, identity, isPro: access.isPro, expiresAt, now, calls });
  const subscription = await syncSubscription({
    supabase, identity, event, access, isPro: access.isPro, expiresAt, now, calls
  });

  return {
    success: profile.updated,
    processed: profile.updated,
    retryable: !profile.updated,
    plan: paddlePlanFromEvent(event),
    isPro: access.isPro,
    access: access.access,
    status: access.subscriptionStatus,
    subscriptionId: event.subscriptionId || event.transactionId || null,
    customerId: event.customerId || null,
    expiresAt,
    dbUpdated: profile.updated,
    subscriptionSynced: subscription.synced,
    subscriptionError: subscription.error,
    profileError: profile.error,
    email: identity.email,
    userId: identity.userId || profile.profileId || null
  };
}

export async function hasProcessedPaddleEvent({ supabase, eventId } = {}) {
  if (!supabase || !eventId) return false;
  try {
    const { data, error } = await supabase.from('paddle_webhook_events')
      .select('event_id').eq('event_id', eventId).limit(1);
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export async function recordPaddleEventProcessed({ supabase, event, calls = [] } = {}) {
  if (!supabase || !event?.eventId) return { recorded: false };
  const payload = {
    event_id: event.eventId,
    event_type: event.eventType,
    subscription_id: event.subscriptionId || null,
    transaction_id: event.transactionId || null,
    customer_id: event.customerId || null,
    occurred_at: event.occurredAt || null,
    payload_hash: event.payloadHash || null,
    processed_at: new Date().toISOString(),
    status: 'processed'
  };
  calls.push({ table: 'paddle_webhook_events', op: 'insert', payload });
  try {
    const { error } = await supabase.from('paddle_webhook_events').insert(payload);
    if (error?.code === '23505') return { recorded: false, duplicate: true };
    return { recorded: !error, error: error?.message || null };
  } catch (error) {
    return { recorded: false, error: error?.message || String(error) };
  }
}
