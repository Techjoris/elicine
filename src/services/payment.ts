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
  const type = params.paymentType || (params.billingCycle ? 'pro' : 'tip');
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://elicine.vercel.app';
  const successCallbackUrl = (params.returnUrl || `${origin}/?payment_status=success&type=${type}`).trim();

  const formattedCurrency = String(params.currency || 'XAF').trim().toUpperCase();
  const rawNumAmount = Number(params.amount);
  const finalAmount = (formattedCurrency === 'XAF' || formattedCurrency === 'XOF') ? Math.round(rawNumAmount) : Number(rawNumAmount);

  if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
    return {
      success: false,
      message: 'Montant de paiement invalide.'
    };
  }

  const nameParts = (params.name || 'Cinéphile').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || 'Cinéphile';
  const lastName = nameParts.slice(1).join(' ') || firstName;

  const payload = {
    amount: finalAmount,
    currency: formattedCurrency,
    description: params.description || (type === 'pro' ? 'Abonnement Pass Pro Éliciné' : 'Soutien au projet Éliciné'),
    customer: {
      email: (params.email || '').trim() || 'contact@elicine.com',
      first_name: firstName,
      last_name: lastName
    },
    return_url: successCallbackUrl,
    redirect_url: successCallbackUrl
  };

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

      console.log('[Moneroo Service] Réponse reçue de /api/moneroo :', data);

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
      try {
        const directRes = await fetch('https://api.moneroo.io/v1/payments/initialize', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const directText = await directRes.text();
        try {
          const directData = JSON.parse(directText);
          console.log('[Moneroo Service] Réponse reçue de l\'API directe Moneroo :', directData);
          if (directRes.ok) {
            data = directData;
          } else {
            lastError = directData?.message || directData?.error || `Erreur Moneroo direct (${directRes.status})`;
          }
        } catch (_) {
          lastError = directText || `Erreur HTTP ${directRes.status}`;
        }
      } catch (directErr: any) {
        lastError = directErr?.message || 'Erreur réseau API directe Moneroo';
      }
    }

    // Extraction précise et multi-chemins du lien de redirection
    const checkoutUrl = extractMonerooRedirectUrl(data);
    const paymentId = data?.reference || data?.data?.id || data?.id || data?.data?.reference;

    if (checkoutUrl) {
      console.log('[Moneroo Service] ✓ Checkout URL extraite :', checkoutUrl);
      if (!params.skipRedirect) {
        if (params.openInNewTab && typeof window !== 'undefined') {
          window.open(checkoutUrl, '_blank');
        } else if (typeof window !== 'undefined') {
          window.location.href = checkoutUrl;
        }
      }

      return {
        success: true,
        message: 'Redirection vers le paiement Moneroo...',
        paymentUrl: checkoutUrl,
        checkout_url: checkoutUrl,
        link: checkoutUrl,
        url: checkoutUrl,
        reference: paymentId,
        data: {
          ...(typeof data?.data === 'object' && data?.data !== null ? data.data : {}),
          checkout_url: checkoutUrl,
          link: checkoutUrl
        },
        rawResponse: data
      };
    }

    const finalErrMsg = data?.error || data?.message || lastError || "L'API Moneroo n'a renvoyé aucun lien de redirection valide.";
    console.error('[Moneroo Checkout Error] Objet reçu sans lien :', finalErrMsg, data);
    return {
      success: false,
      message: finalErrMsg,
      data: data?.data || data,
      rawResponse: data
    };
  } catch (e: any) {
    console.error('[Moneroo] Erreur critique initialisation:', e?.message || e);
    return {
      success: false,
      message: e?.message || "Erreur lors de l'initialisation du paiement sécurisé Moneroo."
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
  currency: string = 'XAF',
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

