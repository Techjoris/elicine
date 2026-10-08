/** Server-owned prices, account binding and gateway evidence for SasPay subscriptions. */
export const PRO_PRICES = {
  EUR: { monthly: 1.99, yearly: 17.90 }, USD: { monthly: 2.15, yearly: 18 },
  CAD: { monthly: 2.90, yearly: 24.50 }, XOF: { monthly: 1300, yearly: 11000 }, XAF: { monthly: 1300, yearly: 11000 }
};
export function proPrice(currency, plan) {
  if (!['monthly','yearly'].includes(plan) || !Object.hasOwn(PRO_PRICES, currency)) return null;
  return PRO_PRICES[currency][plan];
}
export function ownsSubscription(sub, user) {
  return Boolean(sub && user?.id && String(sub.user_id || sub.userId || '') === user.id);
}
export function validPaymentReference(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,160}$/.test(value);
}
export function gatewayMatchesSubscription(result, sub) {
  if (!result?.isSuccess || !sub || !validPaymentReference(sub.payment_reference || sub.paymentReference)) return false;
  const data = result.data || {};
  const ref = data.id || data.reference || data.session_id;
  const expectedRef = sub.payment_reference || sub.paymentReference;
  const amount = Number(data.amount);
  const currency = String(data.currency || '').toUpperCase();
  const email = String(data.customer?.email || data.customer_email || data.email || '').toLowerCase().trim();
  // Both the exact paid session and the amount/currency must match the stored checkout.
  return ref === expectedRef && Number.isFinite(amount) && Math.abs(amount - Number(sub.amount)) < 0.001
    && currency === String(sub.currency).toUpperCase() && (!email || email === String(sub.email).toLowerCase());
}
