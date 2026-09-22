/**
 * GET /api/paddle-diagnostics — audit de configuration Paddle + base Supabase.
 *
 * Ne renvoie jamais de secret : uniquement des booléens de présence, des identifiants,
 * des noms, des montants et des statuts. Protégé par PADDLE_DIAGNOSTICS_TOKEN
 * (Authorization: Bearer <token>) et échoue fermé si le jeton n'est pas configuré.
 */
import { createClient } from '@supabase/supabase-js';
import { SUPPORTER_AMOUNTS, SUPPORTER_PRODUCT_TYPE } from './_paddle-supporter.js';
import { mapSupporterPrices } from './supporter-prices.js';

const PRO_PRICES = {
  monthly: 'pri_01m2x2nctwa8k7cqazmebqnxm3',
  yearly: 'pri_01m2x8yc8y1k9b5bej81me7dbd'
};

const EXPECTED_EVENTS = [
  'transaction.completed',
  'subscription.created',
  'subscription.updated',
  'subscription.canceled'
];

/** Paddle renvoie chaque événement sous forme d'objet { name, description, group }. */
const eventNames = setting => {
  const events = Array.isArray(setting?.subscribed_events) ? setting.subscribed_events : [];
  return events.map(event => clean(event?.name || event)).filter(Boolean);
};

const clean = value => String(value ?? '').trim();
const present = name => Boolean(clean(process.env[name]));

function paddleClient() {
  const key = clean(process.env.PADDLE_API_KEY || process.env.VITE_PADDLE_API_KEY);
  const env = clean(process.env.PADDLE_ENV || process.env.VITE_PADDLE_ENV).toLowerCase();
  return {
    key,
    environment: env === 'sandbox' ? 'sandbox' : 'live',
    base: env === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'
  };
}

async function paddleGet(path, key, base) {
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`PADDLE_${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

const summarizePrice = price => ({
  id: price?.id || null,
  status: price?.status || null,
  currency: clean(price?.unit_price?.currency_code).toUpperCase() || null,
  amount: price?.unit_price?.amount != null ? Number(price.unit_price.amount) / 100 : null,
  recurring: Boolean(price?.billing_cycle || price?.billing_cycle_id),
  interval: price?.billing_cycle?.interval || null,
  frequency: price?.billing_cycle?.frequency ?? null,
  productId: price?.product_id || null,
  description: price?.description || null
});

/** Audit Paddle : produits, prix Pro, produit Supporter et notifications. */
export async function auditPaddle({ key, base }) {
  const warnings = [];
  const products = await paddleGet('/products?per_page=200', key, base);
  const prices = await paddleGet('/prices?per_page=200', key, base);
  const notifications = await paddleGet('/notification-settings?per_page=200', key, base);

  const pro = {};
  for (const [plan, id] of Object.entries(PRO_PRICES)) {
    const price = prices.find(candidate => candidate.id === id);
    pro[plan] = price ? summarizePrice(price) : { id, missing: true };
    if (!price) warnings.push(`Prix Pro ${plan} introuvable dans Paddle (${id}).`);
    else if (!price.billing_cycle) warnings.push(`Le prix Pro ${plan} n'est pas récurrent : l'abonnement ne se renouvellera pas.`);
  }

  const supporterProduct = products.find(product => clean(product?.custom_data?.product_type).toLowerCase() === SUPPORTER_PRODUCT_TYPE)
    || products.find(product => /supporter/i.test(`${product?.name || ''} ${product?.description || ''}`));
  const supporterPrices = supporterProduct ? prices.filter(price => price.product_id === supporterProduct.id) : [];
  const mapped = mapSupporterPrices(supporterPrices);
  const missingAmounts = SUPPORTER_AMOUNTS.filter(amount => !mapped[amount]);
  if (!supporterProduct) warnings.push('Produit « Eliciné Supporter » introuvable dans Paddle.');
  else if (missingAmounts.length) warnings.push(`Montants Supporter sans prix ponctuel en euros : ${missingAmounts.join(', ')} €.`);

  const destinations = notifications.map(setting => ({
    id: setting?.id || null,
    type: setting?.type || null,
    active: setting?.active !== false,
    destination: setting?.destination || null,
    events: eventNames(setting),
    subscribesToEverything: eventNames(setting).includes('*')
  }));
  const webhook = destinations.find(entry => /paddle-webhook/.test(entry.destination || '') && /elicine\.app/i.test(entry.destination || ''))
    || destinations.find(entry => /paddle-webhook/.test(entry.destination || ''));
  if (!webhook) warnings.push('Aucune notification Paddle ne pointe vers https://elicine.app/api/paddle-webhook.');
  else if (!webhook.active) warnings.push('La notification Paddle vers notre webhook est désactivée.');
  const missingEvents = webhook
    ? (webhook.subscribesToEverything ? [] : EXPECTED_EVENTS.filter(event => !webhook.events.includes(event)))
    : EXPECTED_EVENTS;
  if (webhook && missingEvents.length) warnings.push(`Événements non souscrits : ${missingEvents.join(', ')}.`);

  let recentTransactions = [];
  try {
    const transactions = await paddleGet('/transactions?per_page=5&order_by=created_at[DESC]', key, base);
    recentTransactions = transactions.map(transaction => ({
      id: transaction?.id || null,
      status: transaction?.status || null,
      createdAt: transaction?.created_at || null,
      currency: clean(transaction?.currency_code).toUpperCase() || null,
      total: transaction?.details?.totals?.grand_total != null ? Number(transaction.details.totals.grand_total) / 100 : null,
      subscriptionId: transaction?.subscription_id || null
    }));
  } catch { warnings.push('Transactions récentes illisibles (droits de lecture insuffisants ?).'); }

  return {
    products: products.map(product => ({
      id: product?.id || null,
      name: product?.name || null,
      status: product?.status || null,
      productType: product?.custom_data?.product_type || null
    })),
    pro,
    supporter: {
      product: supporterProduct ? { id: supporterProduct.id, name: supporterProduct.name || null, productType: supporterProduct.custom_data?.product_type || null } : null,
      prices: Object.fromEntries(supporterPrices.map(price => [clean(price.id), summarizePrice(price)])),
      amounts: mapped,
      missingAmounts
    },
    notifications: destinations,
    webhook,
    recentTransactions,
    warnings
  };
}

/** Vérifie les tables et les derniers soutiens côté Supabase. */
export async function auditDatabase({ email } = {}) {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return { configured: false, tables: {}, warnings: ['SUPABASE_SERVICE_ROLE_KEY absente : audit base impossible.'] };
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const tables = {};
  const warnings = [];
  for (const table of ['user_movie_alerts', 'release_email_deliveries', 'user_search_history', 'supporter_contributions', 'paddle_webhook_events']) {
    const { error } = await db.from(table).select('*', { count: 'exact', head: true });
    tables[table] = !error;
    if (error) warnings.push(`Table manquante : ${table}.`);
  }
  let supporters = null;
  if (tables.supporter_contributions) {
    const { count } = await db.from('supporter_contributions').select('*', { count: 'exact', head: true });
    supporters = count ?? 0;
  }
  let processedEvents = null;
  if (tables.paddle_webhook_events) {
    const { count } = await db.from('paddle_webhook_events').select('*', { count: 'exact', head: true });
    processedEvents = count ?? 0;
  }
  const { error: profileError } = await db.from('profiles').select('is_supporter, supporter_total_cents').limit(1);
  if (profileError) warnings.push('Colonnes Supporter absentes de la table profiles.');

  // Compte précis : utile pour vérifier qu'un paiement réel a bien activé le bon profil.
  let account = null;
  if (clean(email)) {
    const { data: profiles, error } = await db.from('profiles')
      .select('id,email,is_pro,expires_at,is_supporter,supporter_total_cents,supporter_last_at')
      .ilike('email', clean(email)).limit(1);
    if (error) warnings.push(`Lecture du profil impossible : ${error.message}`);
    const profile = profiles?.[0] || null;
    const contributions = tables.supporter_contributions
      ? (await db.from('supporter_contributions').select('event_id,amount_cents,currency,created_at').ilike('email', clean(email)).order('created_at', { ascending: false }).limit(5)).data || []
      : [];
    account = { found: Boolean(profile), profile, contributions };
  }

  return { configured: true, tables, supporters, processedEvents, supporterColumns: !profileError, account, warnings };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Méthode non autorisée.' });

  const expected = clean(process.env.PADDLE_DIAGNOSTICS_TOKEN);
  if (!expected) return res.status(503).json({ success: false, error: 'PADDLE_DIAGNOSTICS_TOKEN absente.' });
  if (clean(req.headers?.authorization) !== `Bearer ${expected}`) return res.status(401).json({ success: false, error: 'Jeton d’audit invalide.' });
  res.setHeader('Cache-Control', 'no-store');

  const { key, base, environment } = paddleClient();
  const report = {
    success: true,
    checkedAt: new Date().toISOString(),
    environment: { paddle: environment, base },
    env: {
      PADDLE_API_KEY: Boolean(key),
      PADDLE_WEBHOOK_SECRET: present('PADDLE_WEBHOOK_SECRET') || present('PADDLE_WEBHOOK_SECRET_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: present('SUPABASE_SERVICE_ROLE_KEY'),
      RESEND_API_KEY: present('RESEND_API_KEY'),
      RESEND_FROM_EMAIL: present('RESEND_FROM_EMAIL') || present('RESEND_EMAIL'),
      CRON_SECRET: present('CRON_SECRET'),
      TMDB_API_KEY: present('TMDB_API_KEY') || present('VITE_TMDB_API_KEY')
    },
    warnings: []
  };
  if (!report.env.PADDLE_WEBHOOK_SECRET) report.warnings.push('PADDLE_WEBHOOK_SECRET absente : les webhooks Paddle sont refusés (401).');
  if (!report.env.CRON_SECRET) report.warnings.push('CRON_SECRET absente : les alertes J-2 / jour J ne partent pas.');
  if (!report.env.RESEND_API_KEY) report.warnings.push('RESEND_API_KEY absente : aucun e-mail transactionnel ne part.');

  try {
    report.database = await auditDatabase({ email: req.query?.email });
    report.warnings.push(...(report.database.warnings || []));
  } catch (error) {
    report.warnings.push(`Audit base impossible : ${error?.message || error}`);
  }

  if (!key) {
    report.warnings.push('PADDLE_API_KEY absente : audit Paddle impossible (ajoutez une clé en lecture seule).');
  } else {
    try {
      const audit = await auditPaddle({ key, base });
      report.warnings.push(...audit.warnings);
      report.paddle = audit;
    } catch (error) {
      report.warnings.push(`Audit Paddle impossible : ${error?.message || error}`);
    }
  }

  report.ok = report.warnings.length === 0;
  return res.status(200).json(report);
}
