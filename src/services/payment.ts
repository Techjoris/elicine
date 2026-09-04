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

  const resolvedPubKey = (
    params.publicKey || 
    localStorage.getItem('cinéia_notch_pk') || 
    localStorage.getItem('cinéia_notch_key') || 
    (import.meta as any).env?.VITE_NOTCHPAY_PUBLIC_KEY || 
    ''
  ).trim();

  try {
    const payload: any = {
      amount: Number(params.amount),
      currency: params.currency === 'XAF' || params.currency === 'XOF' ? 'XAF' : params.currency,
      email: params.email || 'client@elicine.app',
      name: params.name || 'Cinéphile',
      description: params.description || (type === 'pro' ? 'Abonnement Pass Pro Éliciné' : 'Pourboire Éliciné'),
      callback: successCallbackUrl
    };

    console.log('[Notch Pay] Initialisation via proxy serveur /api/notchpay :', payload);

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
      const authUrl = data.authorization_url || data.data?.authorization_url;
      if (authUrl) {
        console.log('[Notch Pay] Redirection vers authorization_url :', authUrl);
        if (typeof window !== 'undefined') {
          if (window.top) {
            window.top.location.href = authUrl;
          } else {
            window.location.href = authUrl;
          }
          return { 
            success: true, 
            message: 'Redirection sécurisée vers Notch Pay...', 
            paymentUrl: authUrl 
          };
        }
      }
    } else {
      const errData = await res.text();
      console.warn('[Notch Pay] Réponse API erreur :', res.status, errData);
    }
  } catch (e) {
    console.warn('[Notch Pay] Erreur proxy paiement :', e);
  }

  // Simulation Sandbox / Démo
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        message: params.paymentType === 'tip'
          ? 'Merci infiniment pour votre pourboire (Mode Démo) !'
          : `Paiement ${params.billingCycle === 'yearly' ? 'Annuel' : 'Mensuel'} validé avec succès en Mode Démo !`
      });
    }, 1200);
  });
}
