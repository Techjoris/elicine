/**
 * GET /api/supporter-prices
 *
 * Résout automatiquement les price_id du produit Paddle « Eliciné Supporter » : ils ne sont
 * donc pas à recopier à la main. Le produit est reconnu par `product_type = elicine_supporter`
 * (custom_data Paddle) ou, à défaut, par son nom. Les prix sont ensuite associés à nos sept
 * montants par leur valeur en euros, en ne gardant que les prix ponctuels (sans billing_cycle).
 */
import { SUPPORTER_AMOUNTS, SUPPORTER_PRODUCT_TYPE } from './_paddle-supporter.js';

const clean = value => String(value ?? '').trim();

function paddleConfig() {
  const key = clean(process.env.PADDLE_API_KEY || process.env.VITE_PADDLE_API_KEY);
  const env = clean(process.env.PADDLE_ENV || process.env.VITE_PADDLE_ENV).toLowerCase();
  return { key, base: env === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com' };
}

async function paddleGet(path, key, base) {
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`PADDLE_${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

const isSupporterProduct = product => {
  const type = clean(product?.custom_data?.product_type || product?.custom_data?.productType).toLowerCase();
  if (type === SUPPORTER_PRODUCT_TYPE) return true;
  return /supporter/i.test(`${product?.name || ''} ${product?.description || ''}`);
};

/** Associe chaque montant (en euros) au price_id ponctuel correspondant. */
export function mapSupporterPrices(prices) {
  const found = {};
  for (const price of prices || []) {
    if (price?.billing_cycle || price?.billing_cycle_id) continue; // ponctuel uniquement
    const currency = clean(price?.unit_price?.currency_code).toUpperCase();
    if (currency && currency !== 'EUR') continue;
    const amount = Number(price?.unit_price?.amount);
    if (!Number.isFinite(amount)) continue;
    const euros = amount / 100;
    if (!SUPPORTER_AMOUNTS.includes(euros)) continue;
    if (!found[euros]) found[euros] = clean(price.id);
  }
  return found;
}

export async function findSupporterPrices({ productId, key, base } = {}) {
  const config = { key: key ?? paddleConfig().key, base: base ?? paddleConfig().base };
  if (!config.key) throw new Error('PADDLE_API_KEY_MISSING');
  const wanted = clean(productId || process.env.PADDLE_SUPPORTER_PRODUCT_ID);
  const products = wanted ? [{ id: wanted }] : await paddleGet('/products?per_page=200&status=active', config.key, config.base);
  const product = products.find(isSupporterProduct) || (wanted ? products[0] : null);
  if (!product) throw new Error('PRODUCT_NOT_FOUND');
  const prices = await paddleGet(`/prices?per_page=200&status=active&product_id=${encodeURIComponent(product.id)}`, config.key, config.base);
  const mapped = mapSupporterPrices(prices);
  if (!Object.keys(mapped).length) throw new Error('NO_PRICES_FOUND');
  return { productId: product.id, productName: product.name || null, prices: mapped };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Méthode non autorisée.' });

  try {
    const result = await findSupporterPrices();
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({
      success: true,
      productType: SUPPORTER_PRODUCT_TYPE,
      productId: result.productId,
      productName: result.productName,
      prices: result.prices,
      complete: SUPPORTER_AMOUNTS.every(amount => Boolean(result.prices[amount]))
    });
  } catch (error) {
    const reason = error?.message || 'PADDLE_UNAVAILABLE';
    const status = reason === 'PADDLE_API_KEY_MISSING' ? 503 : reason.startsWith('PADDLE_') ? 502 : 404;
    console.warn('[Supporter prices]', reason);
    return res.status(status).json({ success: false, error: reason, prices: {} });
  }
}
