/**
 * Le Pass Pro est rattaché à un compte : c'est ce compte qui porte les quotas
 * illimités, les alertes J-2 / jour J et l'historique synchronisé. Un paiement
 * lancé sans compte ne pourrait donc être activé nulle part.
 *
 * La règle est vérifiée au moment où le paiement démarre, et non à l'ouverture
 * de la fenêtre Pro : un visiteur peut consulter l'offre, mais le bouton de
 * paiement le renvoie d'abord vers la création de compte, panier conservé.
 */

export interface ProCheckoutAccountLike {
  id?: string | null;
  email?: string | null;
}

export interface ProCheckoutIntentLike {
  plan: string;
  currency: string;
  amount: string;
  numericAmount: number;
  paymentMethod: 'mobile_money' | 'card' | 'paddle';
  provider: 'saspay' | 'paddle';
  gateway?: string;
}

export const PRO_ACCOUNT_REQUIRED_TOAST =
  '👑 Connectez-vous ou créez votre compte pour finaliser votre abonnement Pro.';

/**
 * Vrai quand le paiement ne peut pas être rattaché à un compte.
 * Un identifiant ou, à défaut, une adresse e-mail suffisent : les comptes
 * Google n'exposent pas toujours d'identifiant local au même moment.
 */
export function isProCheckoutAccountMissing(account?: ProCheckoutAccountLike | null): boolean {
  if (!account) return true;
  const id = typeof account.id === 'string' ? account.id.trim() : '';
  const email = typeof account.email === 'string' ? account.email.trim() : '';
  return id === '' && email === '';
}

/**
 * Mémorise le panier le temps de l'inscription. Ces clés sont celles relues
 * après connexion pour rouvrir automatiquement la fenêtre Pro.
 */
export function rememberProCheckoutBeforeSignup(intent: ProCheckoutIntentLike): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem('pending_checkout', 'true');
    sessionStorage.setItem('payment_method', intent.provider === 'paddle' ? 'paddle' : 'saspay');
    sessionStorage.setItem('checkout_gateway', intent.gateway || (intent.provider === 'paddle' ? 'paddle' : 'mobile_money'));
    sessionStorage.setItem('checkout_plan', intent.plan);
    sessionStorage.setItem('checkout_currency', intent.currency);
    sessionStorage.setItem('checkout_amount', String(intent.amount));
    sessionStorage.setItem('checkout_numeric_amount', String(intent.numericAmount));
  } catch {
    // Le stockage peut être refusé (navigation privée) : l'inscription reste possible.
  }
}
