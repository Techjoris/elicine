import { Currency, PricingBillingCycle, CurrencyPricing } from '../types';

export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  name: string;
  rateToFcfa: number;
}

export const CURRENCY_CONFIGS: Record<Currency, CurrencyConfig> = {
  XAF: {
    code: 'XAF',
    symbol: 'FCFA',
    name: 'Franc CFA (BEAC)',
    rateToFcfa: 1
  },
  XOF: {
    code: 'XOF',
    symbol: 'FCFA',
    name: 'Franc CFA (BCEAO)',
    rateToFcfa: 1
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    rateToFcfa: 0.00152
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    rateToFcfa: 0.00165
  },
  CAD: {
    code: 'CAD',
    symbol: 'CA$',
    name: 'Dollar Canadien',
    rateToFcfa: 0.00225
  }
};

export const PLANS_PRICING: Record<Currency, CurrencyPricing> = {
  XAF: {
    monthly: {
      amount: 2500,
      formatted: '2 500 FCFA / mois'
    },
    yearly: {
      amount: 20000,
      formatted: '20 000 FCFA / an',
      monthlyEquivalent: '~1 667 FCFA / mois',
      savings: '-33% (4 mois offerts)'
    }
  },
  XOF: {
    monthly: {
      amount: 2500,
      formatted: '2 500 FCFA / mois'
    },
    yearly: {
      amount: 20000,
      formatted: '20 000 FCFA / an',
      monthlyEquivalent: '~1 667 FCFA / mois',
      savings: '-33% (4 mois offerts)'
    }
  },
  EUR: {
    monthly: {
      amount: 3.80,
      formatted: '3,80 € / mois'
    },
    yearly: {
      amount: 30.00,
      formatted: '30,00 € / an',
      monthlyEquivalent: '~2,50 € / mois',
      savings: '-34% (4 mois offerts)'
    }
  },
  USD: {
    monthly: {
      amount: 4.10,
      formatted: '$4.10 / month'
    },
    yearly: {
      amount: 33.00,
      formatted: '$33.00 / year',
      monthlyEquivalent: '~$2.75 / month',
      savings: '-33% (4 months free)'
    }
  },
  CAD: {
    monthly: {
      amount: 5.50,
      formatted: '5,50 CA$ / mois'
    },
    yearly: {
      amount: 44.00,
      formatted: '44,00 CA$ / an',
      monthlyEquivalent: '~3,66 CA$ / mois',
      savings: '-33% (4 mois offerts)'
    }
  }
};

export interface PlanFeature {
  text: string;
  included: boolean;
}

export const PRO_FEATURES: PlanFeature[] = [
  { text: 'Analyses IA et recommandations illimitées', included: true },
  { text: 'Accès prioritaire aux nouveautés et alertes sorties', included: true },
  { text: 'Filtres de plateformes avancés (Netflix, Canal+, Prime...)', included: true },
  { text: 'Synchronisation multi-écrans & Ma Liste', included: true },
  { text: 'Support prioritaire 7j/7', included: true },
  { text: 'Badge Supporter Pro officiel sur votre profil', included: true }
];

export function isAfricanCurrency(currency: Currency): boolean {
  return currency === 'XAF' || currency === 'XOF';
}

/** Devise par défaut active pour SasPay (défaut : XOF - Franc CFA UEMOA) */
export const DEFAULT_SASPAY_CURRENCY: Currency = 'XOF';

/**
 * Récupère la devise par défaut configurée pour SasPay.
 */
export function getSaspayDefaultCurrency(): Currency {
  const envCurr = (
    (import.meta as any).env?.VITE_SASPAY_DEFAULT_CURRENCY ||
    (import.meta as any).env?.SASPAY_DEFAULT_CURRENCY ||
    (typeof process !== 'undefined' ? (process.env?.VITE_SASPAY_DEFAULT_CURRENCY || process.env?.SASPAY_DEFAULT_CURRENCY) : '') ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('cinéia_saspay_default_currency') : '') ||
    'XOF'
  ).trim().toUpperCase();

  return (envCurr === 'XAF' || envCurr === 'XOF') ? (envCurr as Currency) : 'XOF';
}

/** Alias de rétrocompatibilité */
export const getMonerooDefaultCurrency = getSaspayDefaultCurrency;

/**
 * Convertit et normalise un montant et une devise selon les attentes de SasPay.
 * - Pour XOF / XAF : entier strict ou décimal standard, minimum 100 FCFA.
 * - Si une devise étrangère (EUR, USD, CAD) est envoyée pour un paiement Mobile Money,
 *   elle est convertie automatiquement dans la devise cible SasPay (XOF).
 */
export function convertToSaspayCurrency(
  amount: number,
  currency: Currency | string,
  targetCurrency: Currency = getSaspayDefaultCurrency(),
  isProPlan: boolean = false,
  isYearly: boolean = false
): { amount: number; currency: Currency } {
  const cleanCurr = String(currency || targetCurrency).trim().toUpperCase();

  if (cleanCurr === 'XOF' || cleanCurr === 'XAF') {
    return {
      amount: Math.max(100, Math.round(Number(amount) || 1000)),
      currency: (cleanCurr as Currency)
    };
  }

  // Pour le Pass Pro, appliquer le tarif officiel en FCFA (2 500 ou 20 000)
  if (isProPlan) {
    return {
      amount: isYearly ? 20000 : 2500,
      currency: targetCurrency
    };
  }

  // Conversion de don (EUR / USD / CAD vers FCFA)
  const ratesToFcfa: Record<string, number> = {
    EUR: 655.957,
    USD: 610.0,
    CAD: 450.0
  };

  const rate = ratesToFcfa[cleanCurr] || 655.957;
  const converted = Math.max(500, Math.round((Number(amount) || 2) * rate));
  const cleanRounded = Math.ceil(converted / 50) * 50;

  return {
    amount: cleanRounded,
    currency: targetCurrency
  };
}

/** Alias de rétrocompatibilité */
export const convertToMonerooCurrency = convertToSaspayCurrency;

/** Minimum amounts for card payments (FCFA) */
export const CARD_MIN_FCFA: Record<'tip' | 'pro', number> = {
  tip: 1000,
  pro: 2500
};

/**
 * Récupère la clé API SasPay depuis les variables d'environnement Vercel (saspay_Backend).
 */
export function getSaspayApiKey(): string {
  const raw = (
    (import.meta as any).env?.saspay_Backend ||
    (import.meta as any).env?.VITE_SASPAY_BACKEND ||
    (import.meta as any).env?.SASPAY_BACKEND ||
    (import.meta as any).env?.VITE_SASPAY_API_KEY ||
    (typeof process !== 'undefined' ? (process.env?.saspay_Backend || process.env?.SASPAY_BACKEND || process.env?.VITE_SASPAY_BACKEND) : '') ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('cinéia_saspay_key') : '') ||
    ''
  ).trim();

  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      return (parsed.apiKey || parsed.secretKey || parsed.token || parsed.key || raw).trim();
    } catch (_) {}
  }

  return raw;
}

/** Alias de rétrocompatibilité */
export const getMonerooSecretKey = getSaspayApiKey;

export interface SaspayCheckoutParams {
  amount: number;
  currency: Currency | string;
  paymentType?: 'pro' | 'tip';
  paymentMethod?: 'card' | 'mobile' | 'all';
  billingCycle?: PricingBillingCycle;
  email?: string;
  name?: string;
  description?: string;
  returnUrl?: string;
  openInNewTab?: boolean;
  skipRedirect?: boolean;
  onSuccessRedirect?: () => void;
}

export type MonerooCheckoutParams = SaspayCheckoutParams;

export interface SaspayCheckoutResult {
  success: boolean;
  message: string;
  error?: string;
  paymentUrl?: string;
  checkout_url?: string;
  link?: string;
  url?: string;
  reference?: string;
  data?: any;
  rawResponse?: any;
}

export type MonerooCheckoutResult = SaspayCheckoutResult;

/**
 * Extrait et formate un message d'erreur textuel propre et lisible depuis n'importe quelle erreur (API ou exception).
 * Empêche formellement l'affichage de "[object Object]".
 */
export function formatPaymentErrorMessage(err: any, fallback: string = "Une erreur est survenue lors du paiement."): string {
  if (!err) return fallback;
  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (trimmed === '[object Object]' || !trimmed) return fallback;
    return trimmed;
  }
  if (err instanceof Error) {
    return err.message || err.name || fallback;
  }
  if (typeof err === 'object') {
    // 1. err.error
    if (typeof err.error === 'string' && err.error.trim() && err.error !== '[object Object]') {
      return err.error.trim();
    }
    if (err.error && typeof err.error === 'object') {
      const nested = formatPaymentErrorMessage(err.error, '');
      if (nested) return nested;
    }
    // 2. err.message
    if (typeof err.message === 'string' && err.message.trim() && err.message !== '[object Object]') {
      return err.message.trim();
    }
    if (err.message && typeof err.message === 'object') {
      const nested = formatPaymentErrorMessage(err.message, '');
      if (nested) return nested;
    }
    // 3. err.detail (ex: API Python / Django / FastAPI)
    if (typeof err.detail === 'string' && err.detail.trim()) {
      return err.detail.trim();
    }
    if (Array.isArray(err.detail)) {
      return err.detail.map((d: any) => (d && typeof d === 'object' ? (d.msg || d.message || JSON.stringify(d)) : String(d))).join(', ');
    }
    // 4. err.errors (dictionnaire de validation ou liste)
    if (err.errors && typeof err.errors === 'object') {
      if (Array.isArray(err.errors)) {
        return err.errors.map((e: any) => formatPaymentErrorMessage(e, '')).filter(Boolean).join(' ; ');
      }
      return Object.entries(err.errors)
        .map(([k, v]: [string, any]) => `${k}: ${Array.isArray(v) ? v.join('; ') : (typeof v === 'object' ? JSON.stringify(v) : v)}`)
        .join(' | ');
    }
    // 5. description / reason / msg
    if (typeof err.description === 'string' && err.description.trim()) return err.description.trim();
    if (typeof err.reason === 'string' && err.reason.trim()) return err.reason.trim();
    if (typeof err.msg === 'string' && err.msg.trim()) return err.msg.trim();

    // 6. JSON fallback lisible
    try {
      const str = JSON.stringify(err);
      if (str && str !== '{}') return str;
    } catch (_) {}
  }
  return String(err) || fallback;
}

export const formatSaspayErrorMessage = formatPaymentErrorMessage;

/**
 * Analyse et extrait le lien de redirection de paiement retourné par SasPay.
 */
export function extractSaspayRedirectUrl(res: any): string | null {
  if (!res) return null;

  console.log('[SasPay API] Analyse de l\'objet réponse pour extraction du lien :', res);

  const directCandidates = [
    res?.checkout_url,
    res?.paymentUrl,
    res?.url,
    res?.link,
    res?.data?.checkout_url,
    res?.data?.paymentUrl,
    res?.data?.url,
    res?.data?.link,
    res?.redirect_url,
    res?.data?.redirect_url
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim().startsWith('http')) {
      console.log('[SasPay API] Lien de redirection extrait avec succès :', candidate.trim());
      return candidate.trim();
    }
  }

  // Recherche récursive
  try {
    const scanObject = (obj: any, depth = 0): string | null => {
      if (!obj || typeof obj !== 'object' || depth > 3) return null;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'string' && val.startsWith('http') && (key.toLowerCase().includes('url') || key.toLowerCase().includes('link') || key.toLowerCase().includes('checkout'))) {
          return val.trim();
        }
        if (val && typeof val === 'object') {
          const found = scanObject(val, depth + 1);
          if (found) return found;
        }
      }
      return null;
    };
    const scanned = scanObject(res);
    if (scanned) {
      console.log('[SasPay API] Lien trouvé par parcours récursif :', scanned);
      return scanned;
    }
  } catch (_) {}

  return null;
}

/** Alias de rétrocompatibilité */
export const extractMonerooRedirectUrl = extractSaspayRedirectUrl;

/**
 * Initialise un paiement mobile money exclusivement via SasPay
 * et redirige immédiatement vers l'URL de checkout.
 */
export async function processSaspayCheckout(params: SaspayCheckoutParams): Promise<SaspayCheckoutResult> {
  const apiKey = getSaspayApiKey();
  const defaultCurr = getSaspayDefaultCurrency();
  const type = params.paymentType || (params.billingCycle ? 'pro' : 'tip');
  const isPro = type === 'pro';
  const isYearly = params.billingCycle === 'yearly';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://elicine.vercel.app';
  const successCallbackUrl = (params.returnUrl || `${origin}/?payment_status=success&type=${type}`).trim();

  // Normalisation de la devise et du montant pour SasPay
  const { amount: finalAmount, currency: formattedCurrency } = convertToSaspayCurrency(
    params.amount,
    params.currency,
    defaultCurr,
    isPro,
    isYearly
  );

  if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
    return {
      success: false,
      message: 'Montant de paiement invalide.'
    };
  }

  const customerName = (params.name || 'Cinéphile').trim();
  const customerEmail = (params.email || '').trim() || 'contact@elicine.com';
  const description = params.description || (isPro ? 'Abonnement Pass Pro Éliciné' : 'Soutien au projet Éliciné');

  const payload = {
    amount: finalAmount,
    currency: formattedCurrency,
    description,
    customer_name: customerName,
    customer_email: customerEmail,
    return_url: successCallbackUrl,
    cancel_url: successCallbackUrl
  };

  try {
    let data: any = null;
    let lastError = '';

    // Appel principal à la route backend /api/saspay
    try {
      const serverRes = await fetch('/api/saspay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}`, 'X-Saspay-Key': apiKey } : {})
        },
        body: JSON.stringify(payload)
      });

      const resText = await serverRes.text();
      try {
        data = JSON.parse(resText);
      } catch (_) {
        data = { message: resText };
      }

      console.log('REPONSE SASPAY :', data);

      if (!serverRes.ok) {
        lastError = formatPaymentErrorMessage(data?.error || data?.message || data, `Erreur serveur SasPay (${serverRes.status})`);
        console.warn('[SasPay] Échec /api/saspay :', lastError);
      }
    } catch (serverErr: any) {
      lastError = formatPaymentErrorMessage(serverErr, 'Erreur réseau vers /api/saspay');
      console.warn('[SasPay] Exception /api/saspay, repli direct :', lastError);
    }

    // Secours direct si besoin
    let urlTrouvee = extractSaspayRedirectUrl(data);
    if (!urlTrouvee && apiKey) {
      try {
        const directRes = await fetch('https://api.saspay.me/api/v1/checkout-sessions/', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            amount: finalAmount.toFixed(2),
            currency: formattedCurrency,
            description,
            customer_email: customerEmail,
            customer_name: customerName,
            return_url: successCallbackUrl
          })
        });

        const directText = await directRes.text();
        let directJson: any = {};
        try {
          directJson = JSON.parse(directText);
        } catch (_) {
          directJson = { message: directText };
        }

        console.log('REPONSE SASPAY DIRECTE :', directJson);
        if (directRes.ok) {
          data = directJson;
          urlTrouvee = extractSaspayRedirectUrl(data);
        } else {
          lastError = formatPaymentErrorMessage(directJson?.message || directJson?.error || directJson, `Erreur SasPay direct (${directRes.status})`);
        }
      } catch (directErr: any) {
        lastError = formatPaymentErrorMessage(directErr, 'Erreur réseau API directe SasPay');
      }
    }

    const paymentId = data?.reference || data?.id || data?.data?.id || data?.session_id;

    if (urlTrouvee) {
      console.log('URL SASPAY TROUVEE :', urlTrouvee);
      if (!params.skipRedirect) {
        if (params.openInNewTab && typeof window !== 'undefined') {
          window.open(urlTrouvee, '_blank');
        } else if (typeof window !== 'undefined') {
          window.location.href = urlTrouvee;
        }
      }

      return {
        success: true,
        message: 'Redirection vers le paiement mobile sécurisé SasPay...',
        paymentUrl: urlTrouvee,
        checkout_url: urlTrouvee,
        link: urlTrouvee,
        url: urlTrouvee,
        reference: paymentId,
        data: data?.data || data,
        rawResponse: data
      };
    }

    const receivedProps = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'aucune';
    const rawError = data?.error || data?.message || lastError || `Lien de paiement SasPay introuvable (checkout_url manquant). Propriétés reçues: [${receivedProps}].`;
    const finalErrMsg = formatPaymentErrorMessage(rawError);

    console.error('[SasPay Checkout Error] Objet reçu sans lien :', finalErrMsg, data);
    return {
      success: false,
      message: finalErrMsg,
      error: finalErrMsg,
      data: data?.data || data,
      rawResponse: data
    };
  } catch (e: any) {
    const errorMsg = formatPaymentErrorMessage(e, "Erreur lors de l'initialisation du paiement sécurisé SasPay.");
    console.error('[SasPay] Erreur critique initialisation:', errorMsg, e);
    return {
      success: false,
      message: errorMsg,
      error: errorMsg
    };
  }
}

/** Alias universel */
export const processMonerooCheckout = processSaspayCheckout;
export const processNotchPayCheckout = processSaspayCheckout;

/**
 * Vérification du statut d'une transaction SasPay
 */
export async function verifySaspayPayment(reference: string): Promise<{ 
  status: 'complete' | 'pending' | 'failed'; 
  rawStatus?: string;
  transaction?: any 
}> {
  if (!reference) return { status: 'pending' };

  try {
    const res = await fetch(`/api/saspay?id=${encodeURIComponent(reference)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        status: data.status,
        rawStatus: data.rawStatus,
        transaction: data.data || data.transaction
      };
    }
    return { status: 'pending' };
  } catch (err) {
    console.error('[SasPay Polling] Erreur vérification statut :', err);
    return { status: 'pending' };
  }
}

/** Aliases universels de vérification */
export const verifyMonerooPayment = verifySaspayPayment;
export const verifyNotchPayPayment = verifySaspayPayment;

/**
 * Initialise un paiement SasPay pour le Pass Pro
 */
export const handleSaspayPayment = async (
  userEmail: string, 
  userName: string,
  amount: number = 2500,
  currency: string = getSaspayDefaultCurrency(),
  description: string = 'Abonnement Pass Pro Éliciné'
) => {
  return processSaspayCheckout({
    amount,
    currency,
    email: userEmail,
    name: userName,
    description,
    paymentType: 'pro'
  });
};

export const handleMonerooPayment = handleSaspayPayment;
