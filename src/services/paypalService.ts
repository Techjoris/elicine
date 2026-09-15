/**
 * Service de gestion et de construction des liens et paiements sécurisés PayPal pour Éliciné
 * Garantit des URLs de retour conformes en production (https://elicine.app/...) et élimine les erreurs Sandbox/Redirect.
 */

const DEFAULT_BUSINESS_EMAIL = 'ivanjoris959@gmail.com';
const PRODUCTION_BASE_URL = 'https://elicine.app';

/**
 * Récupère l'URL de base dynamique ou de production (évite les redirections localhost en prod)
 */
export function getPaymentBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    // En développement local, on peut autoriser le callback local si nécessaire,
    // mais pour PayPal les URLs de production doivent être privilégiées
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin;
    }
  }
  return PRODUCTION_BASE_URL;
}

/**
 * Construit l'URL officielle de paiement PayPal pour le Pass Pro
 */
export function getPayPalProCheckoutUrl(options: {
  plan?: 'monthly' | 'yearly';
  amount?: number | string;
  currency?: string;
  email?: string;
  customerName?: string;
  subscriptionId?: string;
} = {}): string {
  const customLink = (
    process.env.NEXT_PUBLIC_PAYPAL_PRO_LINK ||
    (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_PRO_LINK ||
    (import.meta as any).env?.VITE_PAYPAL_PRO_LINK ||
    process.env.VITE_PAYPAL_PRO_LINK ||
    ''
  ).trim();

  // Si un lien personnalisé valide et différent de l'ancien lien cassé est fourni
  if (customLink && !customLink.includes('F5HDRFLUH7YJN') && !customLink.includes('localhost') && customLink.startsWith('https://')) {
    return customLink;
  }

  const plan = options.plan || 'monthly';
  const isYearly = plan === 'yearly';
  const numericAmount = Number(options.amount || (isYearly ? 15.99 : 1.99)).toFixed(2);
  const currency = (options.currency || 'USD').toUpperCase();
  const normalizedCurrency = ['USD', 'EUR', 'CAD', 'GBP', 'AUD'].includes(currency) ? currency : 'USD';

  const baseUrl = getPaymentBaseUrl();
  const returnUrl = `${baseUrl}/payment-callback?gateway=paypal&status=success&plan=${plan}${options.subscriptionId ? `&subscription_id=${encodeURIComponent(options.subscriptionId)}` : ''}`;
  const cancelUrl = `${baseUrl}/?payment=cancelled`;

  const businessEmail = (
    process.env.NEXT_PUBLIC_PAYPAL_BUSINESS_ID ||
    (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_BUSINESS_ID ||
    (import.meta as any).env?.VITE_PAYPAL_BUSINESS_ID ||
    DEFAULT_BUSINESS_EMAIL
  ).trim();

  const itemName = `Pass Pro Éliciné (${isYearly ? 'Formule Annuelle - 1 an' : 'Formule Mensuelle - 1 mois'})`;

  const params = new URLSearchParams({
    cmd: '_xclick',
    business: businessEmail,
    item_name: itemName,
    item_number: `ELICINE_PRO_${plan.toUpperCase()}`,
    amount: numericAmount,
    currency_code: normalizedCurrency,
    no_shipping: '1',
    no_note: '1',
    return: returnUrl,
    cancel_return: cancelUrl,
    rm: '2', // Retour par GET/POST avec les données de transaction
    cbt: 'Retourner sur Éliciné pour activer mon Pass Pro'
  });

  if (options.email) {
    params.set('email', options.email);
    params.set('custom', JSON.stringify({
      email: options.email,
      plan,
      subId: options.subscriptionId || `sub_paypal_${Date.now()}`
    }));
  }

  return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
}

/**
 * Construit l'URL officielle de don/soutien libre PayPal
 */
export function getPayPalDonationUrl(options: {
  amount?: number | string;
  currency?: string;
  email?: string;
  customerName?: string;
} = {}): string {
  const customLink = (
    process.env.NEXT_PUBLIC_PAYPAL_SUPPORT_LINK ||
    (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_SUPPORT_LINK ||
    (import.meta as any).env?.VITE_PAYPAL_SUPPORT_LINK ||
    process.env.VITE_PAYPAL_SUPPORT_LINK ||
    ''
  ).trim();

  if (customLink && !customLink.includes('F5HDRFLUH7YJN') && !customLink.includes('localhost') && customLink.startsWith('https://')) {
    return customLink;
  }

  const numericAmount = Number(options.amount || 2).toFixed(2);
  const currency = (options.currency || 'USD').toUpperCase();
  const normalizedCurrency = ['USD', 'EUR', 'CAD', 'GBP', 'AUD'].includes(currency) ? currency : 'USD';

  const baseUrl = getPaymentBaseUrl();
  const returnUrl = `${baseUrl}/payment-callback?gateway=paypal&status=success&type=donation&amount=${numericAmount}`;
  const cancelUrl = `${baseUrl}/?donation=cancelled`;

  const businessEmail = (
    process.env.NEXT_PUBLIC_PAYPAL_BUSINESS_ID ||
    (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_BUSINESS_ID ||
    (import.meta as any).env?.VITE_PAYPAL_BUSINESS_ID ||
    DEFAULT_BUSINESS_EMAIL
  ).trim();

  const params = new URLSearchParams({
    cmd: '_donations',
    business: businessEmail,
    item_name: 'Soutien et Don — Éliciné',
    amount: numericAmount,
    currency_code: normalizedCurrency,
    no_shipping: '1',
    return: returnUrl,
    cancel_return: cancelUrl,
    rm: '2',
    cbt: 'Retourner sur Éliciné'
  });

  if (options.email) {
    params.set('email', options.email);
  }

  return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
}
