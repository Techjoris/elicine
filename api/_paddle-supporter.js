/**
 * Paddle Billing — produit « Eliciné Supporter ».
 *
 * Soutiens ponctuels (one-time) uniquement : un paiement Supporter ne doit JAMAIS activer le
 * Pass Pro. Le produit est reconnu par `product_type = elicine_supporter`, porté par le
 * custom_data du produit/prix dans Paddle, et par nos propres métadonnées de checkout en
 * secours. Les price_id connus servent de dernier filet.
 */

export const SUPPORTER_PRODUCT_TYPE = 'elicine_supporter';
export const SUPPORTER_AMOUNTS = [1, 2, 3, 5, 7, 10, 50];

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();

const readEnv = name => clean(process.env[name] || process.env[`VITE_${name}`]);

/** price_id configurés côté Paddle (variables d'environnement PADDLE_SUPPORTER_PRICE_<montant>). */
export function supporterPriceIds() {
  const ids = {};
  for (const amount of SUPPORTER_AMOUNTS) {
    const id = readEnv(`PADDLE_SUPPORTER_PRICE_${amount}`);
    if (id) ids[amount] = id;
  }
  return ids;
}

const productTypeOf = item => lower(
  item?.product?.custom_data?.product_type ||
  item?.product?.customData?.product_type ||
  item?.price?.custom_data?.product_type ||
  item?.price?.customData?.product_type
);

const priceIdOf = item => clean(item?.price?.id || item?.priceId || item?.price_id);

/**
 * A Supporter purchase is a completed one-time transaction. Anything carrying a subscription
 * identifier is a subscription payment and is left to the Pro flow.
 */
export function isSupporterTransaction(event) {
  if (!event) return false;
  if (event.eventType !== 'transaction.completed' && event.eventType !== 'transaction.paid') return false;
  const data = event.data || {};
  if (event.subscriptionId || data.subscription_id) return false;
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.some(item => item?.price?.billing_cycle || item?.price?.billing_cycle_id)) return false;
  if (items.some(item => item?.product?.type && lower(item.product.type) !== 'standard')) return false;

  const customData = event.customData || data.custom_data || {};
  const declared = [
    lower(customData.product_type),
    lower(customData.productType),
    productTypeOf(data),
    ...items.map(productTypeOf)
  ];
  if (declared.includes(SUPPORTER_PRODUCT_TYPE)) return true;

  // Last resort: the price belongs to the Supporter product even without the marker.
  const known = new Set(Object.values(supporterPriceIds()));
  return known.size > 0 && items.some(item => known.has(priceIdOf(item)));
}

/** Amount actually paid, in the smallest currency unit (Paddle totals are already cents). */
export function supporterContribution(event) {
  const data = event?.data || {};
  const totals = data.details?.totals || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const summed = items.reduce((total, item) => total + (Number(item?.totals?.subtotal ?? item?.totals?.total ?? 0) || 0), 0);
  const amountCents = Math.max(0, Math.round(Number(totals.grand_total ?? totals.total ?? summed) || 0));
  return {
    amountCents,
    currency: clean(data.currency_code || totals.currency_code || 'EUR').toUpperCase(),
    transactionId: event?.transactionId || null,
    occurredAt: event?.occurredAt || null,
    priceId: items.map(priceIdOf).find(Boolean) || null,
    email: event?.email || null
  };
}

/**
 * Records the contribution through one atomic RPC: the event identifier is inserted first, so a
 * replayed webhook can neither add the amount twice nor touch the profile twice.
 */
export async function applyPaddleSupporter({ supabase, identity, event, now = new Date().toISOString() } = {}) {
  if (!supabase) return { success: false, processed: false, retryable: true, error: 'SUPABASE_NOT_CONFIGURED' };
  const contribution = supporterContribution(event);
  if (!contribution.amountCents) {
    return { success: false, processed: false, retryable: false, error: 'SUPPORTER_AMOUNT_MISSING', ...contribution };
  }
  const email = identity?.email || contribution.email || null;
  const userId = identity?.userId || null;
  if (!email && !userId) {
    return { success: false, processed: false, retryable: true, error: 'PADDLE_IDENTITY_NOT_RESOLVED', ...contribution };
  }

  try {
    const { data, error } = await supabase.rpc('record_supporter_contribution', {
      p_event_id: event.eventId,
      p_email: email,
      p_user_id: userId,
      p_amount_cents: contribution.amountCents,
      p_currency: contribution.currency,
      p_transaction_id: contribution.transactionId,
      p_occurred_at: contribution.occurredAt || now
    });
    if (error) return { success: false, processed: false, retryable: true, error: error.message, ...contribution };
    const result = typeof data === 'string' ? (() => { try { return JSON.parse(data); } catch { return null; } })() : data;
    const duplicate = result?.recorded === false;
    return {
      success: true,
      processed: !duplicate,
      duplicate,
      supporter: true,
      isPro: false,
      isSupporter: true,
      profilesUpdated: Number(result?.profilesUpdated) || 0,
      email,
      userId,
      ...contribution
    };
  } catch (error) {
    return { success: false, processed: false, retryable: true, error: error?.message || 'SUPPORTER_RPC_FAILED', ...contribution };
  }
}
