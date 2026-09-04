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

export async function processNotchPayCheckout(params: {
  amount: number;
  currency: Currency;
  paymentType?: 'pro' | 'tip';
  paymentMethod?: 'card' | 'mobile' | 'all';
  billingCycle?: PricingBillingCycle;
  email: string;
  name?: string;
  description: string;
  publicKey?: string;
  hashKey?: string;
  isTestMode?: boolean;
  onSuccessRedirect?: () => void;
}): Promise<{ success: boolean; message: string; paymentUrl?: string }> {
  const type = params.paymentType || (params.billingCycle ? 'pro' : 'tip');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const successCallbackUrl = `${origin}/?payment=success&type=${type}`;

  // Priorité absolue aux variables d'environnement Live de production
  const envPubKey = (
    (import.meta as any).env?.VITE_NOTCHPAY_PUBLIC_KEY || 
    (import.meta as any).env?.NEXT_PUBLIC_NOTCHPAY_PUBLIC_KEY || 
    (import.meta as any).env?.NOTCHPAY_PUBLIC_KEY || 
    ''
  ).trim();

  let resolvedPubKey = (
    envPubKey ||
    params.publicKey || 
    localStorage.getItem('cinéia_notch_pk') || 
    localStorage.getItem('cinéia_notch_key') || 
    ''
  ).trim();

  // Élimination stricte de toute clé de test / sandbox résiduelle
  if (resolvedPubKey.startsWith('pk_test_') || resolvedPubKey.startsWith('test_')) {
    resolvedPubKey = envPubKey;
  }

  // Log clair dans la console (mode DEV uniquement) confirmant le préfixe de la clé Live
  if (import.meta.env?.DEV) {
    const keyPrefix = resolvedPubKey ? `${resolvedPubKey.slice(0, 8)}...` : '(gérée par le serveur /api/notchpay)';
    console.log(`[NotchPay LIVE] Mode PRODUCTION actif — Clé chargée : ${keyPrefix} | Sandbox : DÉSACTIVÉE`);
  }

  try {
    const formattedCurrency = params.currency === 'XAF' || params.currency === 'XOF' ? 'XAF' : params.currency;
    const finalAmount = formattedCurrency === 'XAF' ? Math.round(Number(params.amount)) : Number(params.amount);

    const payload: any = {
      amount: finalAmount,
      currency: formattedCurrency,
      email: params.email || 'contact@elicine.com',
      name: params.name || 'Cinéphile',
      description: params.description || (type === 'pro' ? 'Abonnement Pass Pro Éliciné' : 'Soutien au projet Éliciné'),
      callback: successCallbackUrl,
      callbackUrl: successCallbackUrl
    };

    const res = await fetch('/api/notchpay', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(resolvedPubKey ? { 'x-public-key': resolvedPubKey } : {})
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      const authUrl = data.authorization_url || data.data?.authorization_url || data.transaction?.authorization_url;
      if (authUrl) {
        if (import.meta.env?.DEV) {
          console.log('[NotchPay LIVE] Redirection vers authorization_url :', authUrl);
        }
        if (typeof window !== 'undefined') {
          window.location.href = authUrl;
          return { 
            success: true, 
            message: 'Redirection sécurisée vers Notch Pay...', 
            paymentUrl: authUrl 
          };
        }
      }
      throw new Error("L'URL de paiement NotchPay n'a pas été reçue.");
    } else {
      const errData = await res.text();
      console.error('[NotchPay LIVE] Réponse API erreur :', res.status, errData);
      let errMsg = "Échec de l'initialisation du paiement NotchPay.";
      try {
        const parsed = JSON.parse(errData);
        if (parsed.error || parsed.message) {
          errMsg = parsed.error || parsed.message;
        }
      } catch {}
      return {
        success: false,
        message: errMsg
      };
    }
  } catch (e: any) {
    console.error('[NotchPay LIVE] Erreur proxy paiement :', e?.message || e);
    return {
      success: false,
      message: e?.message || "Erreur lors de l'initialisation du paiement sécurisé NotchPay."
    };
  }
}
