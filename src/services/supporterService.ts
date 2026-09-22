import { UserProfile } from '../types';
import { openPaddleCheckout } from './paddleService';

/**
 * Produit Paddle « Eliciné Supporter » : soutiens ponctuels (one-time).
 * Ces paiements ne donnent jamais le Pass Pro et ne touchent à aucun abonnement.
 */
export const SUPPORTER_PRODUCT_TYPE = 'elicine_supporter';

export interface SupporterTier {
  amount: number;
  label: string;
  tagline: string;
  priceId: string;
}

/**
 * price_id Paddle, par montant. Renseignés par variables d'environnement
 * (VITE_PADDLE_SUPPORTER_PRICE_1, ..._2, ..._3, ..._5, ..._7, ..._10, ..._50)
 * ou directement dans ce tableau pour figer la configuration en production.
 */
const VITE_PRICE_IDS: Record<number, string> = {
  1: (import.meta as any).env?.VITE_PADDLE_SUPPORTER_PRICE_1 || '',
  2: (import.meta as any).env?.VITE_PADDLE_SUPPORTER_PRICE_2 || '',
  3: (import.meta as any).env?.VITE_PADDLE_SUPPORTER_PRICE_3 || '',
  5: (import.meta as any).env?.VITE_PADDLE_SUPPORTER_PRICE_5 || '',
  7: (import.meta as any).env?.VITE_PADDLE_SUPPORTER_PRICE_7 || '',
  10: (import.meta as any).env?.VITE_PADDLE_SUPPORTER_PRICE_10 || '',
  50: (import.meta as any).env?.VITE_PADDLE_SUPPORTER_PRICE_50 || ''
};

/** Prix fixés en dur quand ils sont connus (Paddle dashboard). */
export const SUPPORTER_PRICE_IDS: Record<number, string> = {
  1: '', 2: '', 3: '', 5: '', 7: '', 10: '', 50: ''
};

export function supporterPriceId(amount: number): string {
  const runtime = typeof process !== 'undefined'
    ? String(
        (process.env as any)?.[`VITE_PADDLE_SUPPORTER_PRICE_${amount}`] ||
        (process.env as any)?.[`PADDLE_SUPPORTER_PRICE_${amount}`] ||
        ''
      ).trim()
    : '';
  return runtime || String(SUPPORTER_PRICE_IDS[amount] || VITE_PRICE_IDS[amount] || '').trim();
}

/** price_id résolus depuis l'API Paddle (voir /api/supporter-prices). */
let resolvedPrices: Record<number, string> = {};
let pendingResolution: Promise<Record<number, string>> | null = null;

export const SUPPORTER_AMOUNT_LIST = [1, 2, 3, 5, 7, 10, 50];

/** Prix effectivement utilisé par le checkout : configuration d'abord, API Paddle sinon. */
export function effectiveSupporterPriceId(amount: number): string {
  return supporterPriceId(amount) || String(resolvedPrices[amount] || '').trim();
}

/**
 * Complète les montants non configurés en interrogeant Paddle une seule fois. Aucun échec
 * réseau ne casse la modale : la configuration statique reste la référence.
 */
export async function resolveSupporterPrices(): Promise<Record<number, string>> {
  if (SUPPORTER_AMOUNT_LIST.every(amount => effectiveSupporterPriceId(amount))) return resolvedPrices;
  if (pendingResolution) return pendingResolution;
  pendingResolution = (async () => {
    try {
      const response = await fetch('/api/supporter-prices', { headers: { Accept: 'application/json' } });
      if (response.ok) {
        const payload = await response.json();
        resolvedPrices = Object.fromEntries(
          Object.entries(payload?.prices || {}).map(([amount, priceId]) => [Number(amount), String(priceId).trim()])
        );
      }
    } catch { /* la configuration statique reste la source de vérité */ }
    return resolvedPrices;
  })();
  try { return await pendingResolution; } finally { pendingResolution = null; }
}

const TIER_COPY: Array<{ amount: number; label: string; tagline: string }> = [
  { amount: 1, label: 'Coup de pouce', tagline: 'Un geste simple, déjà précieux.' },
  { amount: 2, label: 'Petit soutien', tagline: 'Un café offert à Éliciné.' },
  { amount: 3, label: 'Merci !', tagline: 'Le prix d’une place de cinéma.' },
  { amount: 5, label: 'Soutien', tagline: 'Vous portez vraiment le projet.' },
  { amount: 7, label: 'Gros soutien', tagline: 'Un vrai coup d’accélérateur.' },
  { amount: 10, label: 'Super soutien', tagline: 'Vous financez l’infrastructure.' },
  { amount: 50, label: 'Soutien exceptionnel', tagline: 'Vous faites partie des fondateurs.' }
];

export const SUPPORTER_TIERS: SupporterTier[] = TIER_COPY.map(tier => ({
  ...tier,
  get priceId() { return effectiveSupporterPriceId(tier.amount); }
}));

export const isSupporterTierAvailable = (tier: SupporterTier): boolean => /^pri_[A-Za-z0-9_-]{6,}$/.test(tier.priceId);

export const formatSupporterAmount = (amount: number): string => `${amount} €`;

/** Métadonnées transmises à Paddle : elles reviennent dans le webhook et identifient le produit. */
export function supporterCustomData(tier: SupporterTier, user?: UserProfile | null): Record<string, unknown> {
  return {
    product_type: SUPPORTER_PRODUCT_TYPE,
    productType: SUPPORTER_PRODUCT_TYPE,
    purchase_type: 'one_time',
    supporter_amount: tier.amount,
    supporter_label: tier.label,
    ...(user?.id ? { user_id: user.id, userId: user.id } : {}),
    ...(user?.email ? { user_email: String(user.email).toLowerCase(), email: String(user.email).toLowerCase() } : {})
  };
}

export interface SupporterCheckoutHandlers {
  onSuccess?: (data?: any) => void;
  onCancel?: () => void;
  onError?: (error: any) => void;
}

/**
 * Ouvre le checkout Paddle pour un soutien ponctuel. Aucun `settings` d'abonnement n'est
 * transmis : le prix Paddle lui-même est un prix one-time.
 */
export async function openSupporterCheckout(
  tier: SupporterTier,
  user: UserProfile | null | undefined,
  handlers: SupporterCheckoutHandlers = {}
): Promise<boolean> {
  if (!isSupporterTierAvailable(tier)) {
    const error = new Error(`Le montant de ${formatSupporterAmount(tier.amount)} n’est pas encore disponible.`);
    handlers.onError?.(error);
    return false;
  }
  return openPaddleCheckout({
    priceId: tier.priceId,
    userEmail: user?.email,
    userName: user?.name,
    userId: user?.id,
    customData: supporterCustomData(tier, user),
    onSuccess: handlers.onSuccess,
    onClose: handlers.onCancel,
    onError: handlers.onError
  });
}

export const supporterService = {
  tiers: SUPPORTER_TIERS,
  formatSupporterAmount,
  isSupporterTierAvailable,
  openSupporterCheckout,
  supporterCustomData
};

export default supporterService;
