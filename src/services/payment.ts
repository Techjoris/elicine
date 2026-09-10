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

export interface PaymentOption {
  id: string;
  name: string;
  category: 'card' | 'mobile';
  color: string;
  isAvailableForAfricaOnly?: boolean;
}

export const PAYMENT_METHODS: PaymentOption[] = [
  {
    id: 'card',
    name: 'Carte Bancaire (Visa / Mastercard)',
    category: 'card',
    color: '#3b82f6',
    isAvailableForAfricaOnly: false
  },
  {
    id: 'orange_money',
    name: 'Orange Money',
    category: 'mobile',
    color: '#ff7900',
    isAvailableForAfricaOnly: true
  },
  {
    id: 'mtn_momo',
    name: 'MTN Mobile Money',
    category: 'mobile',
    color: '#ffcc00',
    isAvailableForAfricaOnly: true
  },
  {
    id: 'wave',
    name: 'Wave',
    category: 'mobile',
    color: '#1dc4ff',
    isAvailableForAfricaOnly: true
  },
  {
    id: 'moov',
    name: 'Moov Money',
    category: 'mobile',
    color: '#0055a5',
    isAvailableForAfricaOnly: true
  }
];

export function isAfricanCurrency(currency: Currency): boolean {
  return currency === 'XAF' || currency === 'XOF';
}

/** Devise par défaut active pour Moneroo (défaut : XOF - Franc CFA UEMOA natif Moneroo) */
export const DEFAULT_MONEROO_CURRENCY: Currency = 'XOF';

/**
 * Récupère la devise par défaut configurée pour Moneroo.
 * Permet de forcer dynamiquement la devise configurée et activée dans le tableau de bord Moneroo.
 */
export function getMonerooDefaultCurrency(): Currency {
  const envCurr = (
    (import.meta as any).env?.VITE_MONEROO_DEFAULT_CURRENCY ||
    (import.meta as any).env?.MONEROO_DEFAULT_CURRENCY ||
    (typeof process !== 'undefined' ? (process.env?.VITE_MONEROO_DEFAULT_CURRENCY || process.env?.MONEROO_DEFAULT_CURRENCY) : '') ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('cinéia_moneroo_default_currency') : '') ||
    'XOF'
  ).trim().toUpperCase();

  return (envCurr === 'XAF' || envCurr === 'XOF') ? (envCurr as Currency) : 'XOF';
}

/**
 * Convertit et normalise un montant et une devise selon les attentes strictes de l'API Moneroo.
 * - Pour XOF / XAF : entier strict sans décimale, minimum 100 FCFA.
 * - Si une devise non supportée (EUR, USD, CAD) est envoyée pour un paiement Mobile,
 *   elle est convertie automatiquement dans la devise par défaut Moneroo (XOF).
 */
export function convertToMonerooCurrency(
  amount: number,
  currency: Currency | string,
  targetCurrency: Currency = getMonerooDefaultCurrency(),
  isProPlan: boolean = false,
  isYearly: boolean = false
): { amount: number; currency: Currency } {
  const cleanCurr = String(currency || targetCurrency).trim().toUpperCase();

  // Si c'est déjà une devise africaine conforme (XOF ou XAF)
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

  // Conversion de don (EUR / USD / CAD vers FCFA XOF/XAF)
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

/** Minimum amounts for card payments (FCFA) */
export const CARD_MIN_FCFA: Record<'tip' | 'pro', number> = {
  tip: 1000,
  pro: 2500
};

/**
 * Récupère la clé secrète Moneroo depuis les variables d'environnement
 */
export function getMonerooSecretKey(): string {
  return (
    (import.meta as any).env?.MONEROO_SECRET_KEY ||
    (import.meta as any).env?.VITE_MONEROO_SECRET_KEY ||
    (typeof process !== 'undefined' ? (process.env?.MONEROO_SECRET_KEY || process.env?.VITE_MONEROO_SECRET_KEY) : '') ||
    (import.meta as any).env?.VITE_MONEROO_API_KEY ||
    localStorage.getItem('cinéia_moneroo_sk') ||
    ''
  ).trim();
}

export interface MonerooCheckoutParams {
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
  publicKey?: string;
  hashKey?: string;
  isTestMode?: boolean;
  onSuccessRedirect?: () => void;
}

export interface MonerooCheckoutResult {
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

/**
 * Analyse et extrait le lien de redirection depuis l'objet JSON retourné par Moneroo.
 * Vérifie précisément tous les chemins possibles :
 * - response.data.checkout_url
 * - response.checkout_url
 * - response.link
 * - response.data.link
 * - response.payment_url / response.data.payment_url
 * - response.url / response.data.url
 */
export function extractMonerooRedirectUrl(res: any): string | null {
  if (!res) return null;

  console.log('[Moneroo API] Analyse de l\'objet réponse pour extraction du lien :', res);

  // 1. Chemins prioritaires rigoureux (comme spécifié par l'API Moneroo)
  const directCandidates = [
    res?.data?.checkout_url,
    res?.checkout_url,
    res?.link,
    res?.data?.link,
    res?.paymentUrl,
    res?.data?.paymentUrl,
    res?.payment_url,
    res?.data?.payment_url,
    res?.url,
    res?.data?.url,
    res?.redirect_url,
    res?.data?.redirect_url
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim().startsWith('http')) {
      console.log('[Moneroo API] Lien de redirection extrait avec succès :', candidate.trim());
      return candidate.trim();
    }
  }

  // 2. Recherche imbriquée dans res.data.data ou res.rawResponse
  const nestedCandidates = [
    res?.data?.data?.checkout_url,
    res?.data?.data?.link,
    res?.data?.data?.url,
    res?.rawResponse?.checkout_url,
    res?.rawResponse?.data?.checkout_url,
    res?.rawResponse?.link,
    res?.rawResponse?.data?.link
  ];

  for (const nested of nestedCandidates) {
    if (typeof nested === 'string' && nested.trim().startsWith('http')) {
      console.log('[Moneroo API] Lien de redirection extrait (imbriqué) :', nested.trim());
      return nested.trim();
    }
  }

  // 3. Recherche récursive
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
      console.log('[Moneroo API] Lien trouvé par parcours récursif :', scanned);
      return scanned;
    }
  } catch (_) {}

  return null;
}

/**
 * Initialise un paiement via l'API Moneroo (POST https://api.moneroo.io/v1/payments/initialize)
 * et redirige immédiatement vers le lien de paiement checkout_url.
 */
export async function processMonerooCheckout(params: MonerooCheckoutParams): Promise<MonerooCheckoutResult> {
  const secretKey = getMonerooSecretKey();
  const defaultMonerooCurr = getMonerooDefaultCurrency();
  const type = params.paymentType || (params.billingCycle ? 'pro' : 'tip');
  const isPro = type === 'pro';
  const isYearly = params.billingCycle === 'yearly';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://elicine.vercel.app';
  const successCallbackUrl = (params.returnUrl || `${origin}/?payment_status=success&type=${type}`).trim();

  // Normalisation stricte de la devise et du montant selon les exigences Moneroo
  const { amount: finalAmount, currency: formattedCurrency } = convertToMonerooCurrency(
    params.amount,
    params.currency,
    defaultMonerooCurr,
    isPro,
    isYearly
  );

  if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
    return {
      success: false,
      message: 'Montant de paiement invalide.'
    };
  }

  const nameParts = (params.name || 'Cinéphile').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || 'Cinéphile';
  const lastName = nameParts.slice(1).join(' ') || firstName;

  const buildPayload = (curr: Currency, amt: number) => ({
    amount: amt,
    currency: curr,
    description: params.description || (isPro ? 'Abonnement Pass Pro Éliciné' : 'Soutien au projet Éliciné'),
    customer: {
      email: (params.email || '').trim() || 'contact@elicine.com',
      first_name: firstName,
      last_name: lastName
    },
    return_url: successCallbackUrl,
    redirect_url: successCallbackUrl
  });

  const payload = buildPayload(formattedCurrency, finalAmount);
  const authHeader = secretKey ? `Bearer ${secretKey}` : '';

  try {
    let data: any = null;
    let lastError = '';

    // 1. Appel principal à la route serveur /api/moneroo (recommandée, sans blocage CORS)
    try {
      const serverRes = await fetch('/api/moneroo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        },
        body: JSON.stringify({
          ...payload,
          secretKey: secretKey || undefined
        })
      });

      const resText = await serverRes.text();
      try {
        data = JSON.parse(resText);
      } catch (_) {
        data = { message: resText };
      }

      // Structure exacte reçue de l'API Moneroo
      console.log("REPONSE MONEROO :", data);

      if (!serverRes.ok) {
        lastError = data?.error || data?.message || `Erreur serveur Moneroo (${serverRes.status})`;
        console.warn('[Moneroo] Échec /api/moneroo :', lastError);
      }
    } catch (serverErr: any) {
      lastError = serverErr?.message || 'Erreur réseau vers /api/moneroo';
      console.warn('[Moneroo] Exception /api/moneroo, tentative directe :', lastError);
    }

    // 2. Secours direct vers l'API Moneroo si nécessaire et si une clé secrète existe
    const potentialUrl = extractMonerooRedirectUrl(data);
    if (!potentialUrl && authHeader) {
      const callDirectApi = async (reqCurr: Currency, reqAmt: number) => {
        const directPayload = buildPayload(reqCurr, reqAmt);
        const directRes = await fetch('https://api.moneroo.io/v1/payments/initialize', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(directPayload)
        });
        const directText = await directRes.text();
        let directJson: any = {};
        try {
          directJson = JSON.parse(directText);
        } catch (_) {
          directJson = { message: directText };
        }
        return { ok: directRes.ok, status: directRes.status, json: directJson };
      };

      try {
        const directResult = await callDirectApi(formattedCurrency, finalAmount);
        console.log("REPONSE MONEROO DIRECTE :", directResult.json);
        if (directResult.ok) {
          data = directResult.json;
        } else {
          lastError = directResult.json?.message || directResult.json?.error || `Erreur Moneroo direct (${directResult.status})`;
          
          // Repli dynamique si la devise n'est pas activée dans le compte marchand
          const errMsg = String(lastError).toLowerCase();
          if (errMsg.includes('no payment methods enabled') || errMsg.includes('payment methods for this currency')) {
            const alternateCurr = formattedCurrency === 'XAF' ? 'XOF' : (formattedCurrency === 'XOF' ? 'XAF' : null);
            if (alternateCurr) {
              console.warn(`[Moneroo] Tentative directe de repli avec ${alternateCurr}...`);
              const retryResult = await callDirectApi(alternateCurr, finalAmount);
              if (retryResult.ok) {
                data = retryResult.json;
              }
            }
          }
        }
      } catch (directErr: any) {
        lastError = directErr?.message || 'Erreur réseau API directe Moneroo';
      }
    }

    // Extraction précise et multi-chemins du lien de redirection peu importe la structure
    const urlTrouvee = 
      data?.checkout_url || 
      data?.link || 
      data?.data?.checkout_url || 
      data?.data?.link ||
      data?.url ||
      data?.paymentUrl ||
      extractMonerooRedirectUrl(data);

    const paymentId = data?.reference || data?.data?.id || data?.id || data?.data?.reference;

    if (urlTrouvee) {
      console.log("URL MONEROO TROUVEE :", urlTrouvee);
      if (!params.skipRedirect) {
        if (params.openInNewTab && typeof window !== 'undefined') {
          window.open(urlTrouvee, '_blank');
        } else if (typeof window !== 'undefined') {
          window.location.href = urlTrouvee;
        }
      }

      return {
        success: true,
        message: 'Redirection vers le paiement Moneroo...',
        paymentUrl: urlTrouvee,
        checkout_url: urlTrouvee,
        link: urlTrouvee,
        url: urlTrouvee,
        reference: paymentId,
        data: {
          ...(typeof data?.data === 'object' && data?.data !== null ? data.data : {}),
          checkout_url: urlTrouvee,
          link: urlTrouvee
        },
        rawResponse: data
      };
    }

    const receivedProps = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'aucune';
    const innerProps = data?.data && typeof data.data === 'object' ? Object.keys(data.data).join(', ') : '';
    const propsDetail = innerProps ? `Propriétés reçues: [${receivedProps}], sous-propriétés data: [${innerProps}]` : `Propriétés reçues: [${receivedProps}]`;
    let finalErrMsg = data?.error || data?.message || lastError || `Lien de paiement Moneroo introuvable (checkout_url ou link manquant). ${propsDetail}.`;

    if (finalErrMsg.toLowerCase().includes('no payment methods enabled') || finalErrMsg.toLowerCase().includes('payment methods for this currency')) {
      finalErrMsg = `Aucune méthode de paiement n'est activée pour la devise ${formattedCurrency} dans votre tableau de bord Moneroo. Veuillez activer vos passerelles (MTN MoMo, Moov, Orange, Wave...) sur https://app.moneroo.io > Applications > Modes de paiement, ou configurer VITE_MONEROO_DEFAULT_CURRENCY.`;
    }

    console.error('[Moneroo Checkout Error] Objet reçu sans lien :', finalErrMsg, data);
    return {
      success: false,
      message: finalErrMsg,
      data: data?.data || data,
      rawResponse: data
    };
  } catch (e: any) {
    const errorMsg = e?.message || "Erreur lors de l'initialisation du paiement sécurisé Moneroo.";
    console.error('[Moneroo] Erreur critique initialisation:', errorMsg, e);
    return {
      success: false,
      message: errorMsg
    };
  }
}

/**
 * Polling de vérification du statut d'une transaction Moneroo
 */
export async function verifyMonerooPayment(reference: string): Promise<{ 
  status: 'complete' | 'pending' | 'failed'; 
  rawStatus?: string;
  transaction?: any 
}> {
  if (!reference) return { status: 'pending' };
  const secretKey = getMonerooSecretKey();

  try {
    const res = await fetch(`https://api.moneroo.io/v1/payments/${encodeURIComponent(reference)}/verify`, {
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Accept': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const rawStatus = data?.data?.status || data?.status;
      const isSuccess = rawStatus === 'success' || rawStatus === 'successful' || rawStatus === 'completed';
      const isFailed = rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'rejected';

      return {
        status: isSuccess ? 'complete' : (isFailed ? 'failed' : 'pending'),
        rawStatus,
        transaction: data?.data || data
      };
    }

    // Fallback vers /api/moneroo
    const fallbackRes = await fetch(`/api/moneroo?id=${encodeURIComponent(reference)}`);
    if (fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      return {
        status: fbData.status,
        rawStatus: fbData.rawStatus,
        transaction: fbData.data || fbData.transaction
      };
    }

    return { status: 'pending' };
  } catch (err) {
    console.error('[Moneroo Polling] Erreur vérification statut :', err);
    return { status: 'pending' };
  }
}

// ─── ALIASES DE RÉTROCOMPATIBILITÉ ──────────────────────────────────────────
export const processNotchPayCheckout = processMonerooCheckout;
export const verifyNotchPayPayment = verifyMonerooPayment;

/**
 * Initialise un paiement Moneroo pour le Pass Pro
 */
export const handleMonerooPayment = async (
  userEmail: string, 
  userName: string,
  amount: number = 2500,
  currency: string = getMonerooDefaultCurrency(),
  description: string = 'Abonnement Pass Pro Éliciné'
) => {
  return processMonerooCheckout({
    amount,
    currency,
    email: userEmail,
    name: userName,
    description,
    paymentType: 'pro'
  });
};

