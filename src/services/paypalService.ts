/**
 * Service de gestion et de construction des liens et paiements sécurisés PayPal pour Éliciné
 * Garantit des URLs de retour conformes en production (https://elicine.app/...) et élimine les erreurs Sandbox/Redirect.
 */

export const PAYPAL_LIVE_CLIENT_ID = 'BAAzWahi5zv0coRbNiOQMDh5EBKJXqVJxgb5R0YOzi-v3sYFSB6H3-NP9704z_ubIenrcf7gIZDdFntwX8';
export const PAYPAL_PRO_HOSTED_LINK = 'https://www.paypal.com/ncp/payment/HZQ5NGE26WX6Q';
export const PAYPAL_SUPPORT_HOSTED_LINK = 'https://www.paypal.com/ncp/payment/F5HDRFLUH7YJN';

const DEFAULT_BUSINESS_EMAIL = 'ivanjoris959@gmail.com';
const PRODUCTION_BASE_URL = 'https://elicine.app';

/**
 * Récupère le Client ID PayPal avec fallback multi-niveaux (Vite / Next.js / Définition statique)
 * Garantit qu'aucune valeur undefined ou vide n'est renvoyée
 */
export function getPayPalClientId(): string {
  const envVal =
    (typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env?.PAYPAL_CLIENT_ID)) ||
    (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_PAYPAL_CLIENT_ID || (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_CLIENT_ID)) ||
    '';
  return (envVal && envVal !== 'undefined' && envVal !== 'null' ? envVal.trim() : '') || PAYPAL_LIVE_CLIENT_ID;
}

/**
 * Récupère l'URL du lien hébergé officiel Pro (Abonnement Éliciné Pro)
 */
export function getPayPalProHostedUrl(): string {
  const envVal =
    (typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_PAYPAL_PRO_LINK || process.env?.PAYPAL_PRO_LINK)) ||
    (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_PAYPAL_PRO_LINK || (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_PRO_LINK)) ||
    '';
  return (envVal && envVal !== 'undefined' && envVal !== 'null' ? envVal.trim() : '') || PAYPAL_PRO_HOSTED_LINK;
}

/**
 * Récupère l'URL du lien hébergé officiel Support / Don (Soutien libre Éliciné)
 */
export function getPayPalSupportHostedUrl(): string {
  const envVal =
    (typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_PAYPAL_SUPPORT_LINK || process.env?.PAYPAL_SUPPORT_LINK)) ||
    (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_PAYPAL_SUPPORT_LINK || (import.meta as any).env?.NEXT_PUBLIC_PAYPAL_SUPPORT_LINK)) ||
    '';
  return (envVal && envVal !== 'undefined' && envVal !== 'null' ? envVal.trim() : '') || PAYPAL_SUPPORT_HOSTED_LINK;
}

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

  // Intitulé et référence configurés explicitement en "Achat Unique" (One-time payment)
  // Évite que les filtres anti-fraude PayPal ou les banques émettrices (Revolut, Wise, cartes virtuelles)
  // n'exigent un accord de prélèvement récurrent automatique (Billing Agreement / Preapproved Payment)
  const itemName = `Pass Pro Éliciné - Accès ${isYearly ? '1 An' : '30 Jours'} (Paiement unique)`;
  const itemNumber = `ELICINE_PASS_${isYearly ? '365D' : '30D'}_ONETIME`;

  const params = new URLSearchParams({
    cmd: '_xclick',
    business: businessEmail,
    item_name: itemName,
    item_number: itemNumber,
    amount: numericAmount,
    currency_code: normalizedCurrency,
    // 1. Forcer l'encaissement direct et unique (One-Time Sale)
    paymentaction: 'sale',
    src: '0',           // Pas d'abonnement récurrent automatique
    sra: '0',           // Pas de réessai récurrent
    no_recurring: '1',   // Produit d'accès numérique ponctuel
    // 2. Configuration Guest Checkout (Paiement par Carte bancaire sans compte PayPal)
    solution_type: 'Sole',
    landing_page: 'Billing',
    no_shipping: '1',
    no_note: '1',
    charset: 'utf-8',
    return: returnUrl,
    cancel_return: cancelUrl,
    // 3. Retour propre en GET vers la SPA Éliciné
    rm: '1',
    cbt: 'Retourner sur Éliciné pour activer mon Pass Pro'
  });

  if (options.email) {
    // IMPORTANT : Ne pas pré-remplir l'email dans PayPal si c'est identique au compte vendeur (businessEmail),
    // car PayPal interdit strictement l'auto-paiement et affiche l'erreur "Nous n'avons pas pu enregistrer cette carte".
    // De plus, cela évite de forcer la connexion PayPal si l'utilisateur souhaite régler en Invité (Guest Checkout).
    if (options.email.trim().toLowerCase() !== businessEmail.trim().toLowerCase()) {
      params.set('email', options.email.trim());
    }
    params.set('custom', JSON.stringify({
      email: options.email,
      plan,
      type: 'onetime_pass',
      subId: options.subscriptionId || `pp_one_${Date.now()}`
    }));
  }

  const finalUrl = `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
  console.log('[PayPal Service Debug] URL Checkout PayPal générée :', {
    business: businessEmail,
    amount: numericAmount,
    currency: normalizedCurrency,
    plan,
    hasCustomerEmail: Boolean(options.email),
    prefilledEmail: params.get('email') || '(non pré-rempli pour autoriser le Guest Checkout)',
    url: finalUrl
  });

  return finalUrl;
}

/**
 * Construit l'URL officielle de don/soutien libre PayPal
 * Utilise en priorité le lien hébergé direct officiel NEXT_PUBLIC_PAYPAL_SUPPORT_LINK
 */
export function getPayPalDonationUrl(options: {
  amount?: number | string;
  currency?: string;
  email?: string;
  customerName?: string;
} = {}): string {
  const hostedUrl = getPayPalSupportHostedUrl();
  if (hostedUrl) {
    return hostedUrl;
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
    solution_type: 'Sole',
    landing_page: 'Billing',
    no_shipping: '1',
    charset: 'utf-8',
    return: returnUrl,
    cancel_return: cancelUrl,
    rm: '1',
    cbt: 'Retourner sur Éliciné'
  });

  if (options.email) {
    params.set('email', options.email);
  }

  return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
}

