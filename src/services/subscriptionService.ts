import { ProSubscription, Currency, PricingBillingCycle } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { processSaspayCheckout } from './payment';

const PENDING_SUB_STORAGE_KEY = 'cineia_pending_subscription';
const ACTIVE_SUB_STORAGE_KEY = 'cineia_active_subscription';
const ALL_SUBS_STORAGE_KEY = 'cineia_all_subscriptions';
const CHECKOUT_INTENT_STORAGE_KEY = 'cineia_pending_checkout_intent';

export interface InitSubscriptionParams {
  userId: string;
  email: string;
  customerName: string;
  phone?: string;
  plan: 'monthly' | 'yearly';
  currency: Currency | string;
  amount: number;
  termsAccepted: boolean;
}

export interface CheckoutIntent {
  plan: PricingBillingCycle;
  currency: Currency;
  amount: string;
  numericAmount: number;
  paymentMethod: 'mobile_money' | 'paypal_card';
  provider: 'saspay' | 'paypal';
  phone?: string;
  timestamp: number;
}

export const subscriptionService = {
  /**
   * Mémorise temporairement l'intention de paiement d'un utilisateur non connecté
   * avant de l'intercepter vers l'authentification (SessionStorage avec repli LocalStorage)
   */
  setPendingCheckoutIntent(intent: CheckoutIntent): void {
    try {
      const data = JSON.stringify(intent);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(CHECKOUT_INTENT_STORAGE_KEY, data);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CHECKOUT_INTENT_STORAGE_KEY, data);
      }
    } catch (e) {
      console.warn('[subscriptionService] Erreur sauvegarde intent:', e);
    }
  },

  /**
   * Récupère l'intention de paiement mémorisée (valide pendant 2 heures)
   */
  getPendingCheckoutIntent(): CheckoutIntent | null {
    try {
      let raw: string | null = null;
      if (typeof sessionStorage !== 'undefined') {
        raw = sessionStorage.getItem(CHECKOUT_INTENT_STORAGE_KEY);
      }
      if (!raw && typeof localStorage !== 'undefined') {
        raw = localStorage.getItem(CHECKOUT_INTENT_STORAGE_KEY);
      }
      if (!raw) return null;

      const parsed: CheckoutIntent = JSON.parse(raw);
      // Expiration après 2 heures (7200000 ms)
      if (Date.now() - parsed.timestamp > 7200000) {
        this.clearPendingCheckoutIntent();
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  },

  /**
   * Nettoie l'intention de paiement après traitement ou annulation
   */
  clearPendingCheckoutIntent(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(CHECKOUT_INTENT_STORAGE_KEY);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(CHECKOUT_INTENT_STORAGE_KEY);
      }
    } catch (_) {}
  },

  /**
   * Initialise et enregistre une souscription formelle au compte Pro en base de données.
   * La souscription est créée avec le statut obligatoire 'pending_payment'.
   */
  async initProSubscription(params: InitSubscriptionParams): Promise<{
    success: boolean;
    subscription?: ProSubscription;
    error?: string;
  }> {
    if (!params.termsAccepted) {
      return {
        success: false,
        error: "Vous devez accepter les conditions générales pour valider votre souscription."
      };
    }

    if (!params.email || !params.email.includes('@')) {
      return {
        success: false,
        error: "Adresse email invalide pour la souscription."
      };
    }

    if (!params.amount || params.amount <= 0) {
      return {
        success: false,
        error: "Montant de souscription invalide."
      };
    }

    const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newSub: ProSubscription = {
      id: subId,
      userId: params.userId,
      email: params.email.trim().toLowerCase(),
      customerName: params.customerName.trim() || 'Cinéphile Pro',
      phone: params.phone?.trim() || undefined,
      plan: params.plan,
      currency: params.currency,
      amount: params.amount,
      status: 'pending_payment',
      termsAccepted: true,
      createdAt: now,
      updatedAt: now
    };

    let serverSub: ProSubscription | null = null;

    // 1. Appel du backend serverless Vercel pour initialisation et enregistrement serveur
    try {
      const res = await fetch('/api/saspay?action=init-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(params)
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.success && data?.subscription) {
          serverSub = data.subscription;
        }
      }
    } catch (apiErr) {
      console.warn('[subscriptionService] Backend init warning, fallback local:', apiErr);
    }

    const finalSub: ProSubscription = serverSub || newSub;

    // 2. Tentative de synchronisation Supabase directe si configuré
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('subscriptions').upsert({
          id: finalSub.id,
          user_id: finalSub.userId,
          email: finalSub.email,
          customer_name: finalSub.customerName,
          phone: finalSub.phone || null,
          plan: finalSub.plan,
          currency: finalSub.currency,
          amount: finalSub.amount,
          status: 'pending_payment',
          terms_accepted: true,
          created_at: finalSub.createdAt,
          updated_at: finalSub.updatedAt
        });
      } catch (sbErr) {
        console.warn('[subscriptionService] Supabase table notice:', sbErr);
      }
    }

    // 3. Persistance dans le cache local synchronisé pour résilience immédiate
    try {
      localStorage.setItem(PENDING_SUB_STORAGE_KEY, JSON.stringify(finalSub));

      const existingRaw = localStorage.getItem(ALL_SUBS_STORAGE_KEY);
      const existing: ProSubscription[] = existingRaw ? JSON.parse(existingRaw) : [];
      const updatedList = [finalSub, ...existing.filter(s => s.id !== finalSub.id)];
      localStorage.setItem(ALL_SUBS_STORAGE_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.error('[subscriptionService] Erreur persistance locale:', e);
    }

    return {
      success: true,
      subscription: finalSub
    };
  },

  /**
   * Exécute et relance automatiquement le processus de paiement à partir d'une intention enregistrée
   * une fois que l'utilisateur est authentifié.
   */
  async executeCheckoutWithIntent(
    intent: CheckoutIntent,
    user: any
  ): Promise<{ success: boolean; redirectUrl?: string; error?: string }> {
    if (!user || (!user.email && !user.id)) {
      return { success: false, error: "Utilisateur non connecté pour exécuter le paiement." };
    }

    const email = (user.email || '').trim().toLowerCase();
    const name = (user.name || (user as any)?.user_metadata?.full_name || 'Cinéphile Pro').trim();
    const userId = user.id || `usr_pro_${Date.now()}`;

    // 1. Initialiser la souscription formelle en base
    const initRes = await this.initProSubscription({
      userId,
      email,
      customerName: name,
      phone: intent.phone,
      plan: intent.plan,
      currency: intent.currency,
      amount: intent.numericAmount,
      termsAccepted: true
    });

    if (!initRes.success || !initRes.subscription) {
      return { success: false, error: initRes.error || "Échec d'enregistrement de la souscription." };
    }

    const subscription = initRes.subscription;

    // 2. Nettoyer l'intention mémorisée
    this.clearPendingCheckoutIntent();

    // 3. Déclencher la passerelle choisie
    if (intent.paymentMethod === 'paypal_card' || intent.provider === 'paypal') {
      const paypalUrl = 'https://www.paypal.com/ncp/payment/F5HDRFLUH7YJN';
      if (typeof window !== 'undefined') {
        window.open(paypalUrl, '_blank', 'noopener,noreferrer');
      }
      return { success: true, redirectUrl: paypalUrl };
    }

    // Par défaut : SasaPay Mobile Money & Cartes
    const isYearly = intent.plan === 'yearly';
    const currSymbol = intent.currency === 'USD' ? '$' : (intent.currency === 'EUR' ? '€' : (intent.currency === 'CAD' ? 'CA$' : 'FCFA'));

    const saspayRes = await processSaspayCheckout({
      amount: intent.numericAmount,
      currency: intent.currency,
      paymentType: 'pro',
      billingCycle: intent.plan,
      subscriptionId: subscription.id,
      email,
      name,
      description: `Pass Pro Éliciné (${intent.amount} ${currSymbol} - ${isYearly ? 'Annuel' : 'Mensuel'})`,
      returnUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/?payment_status=success&type=pro&subscription_id=${subscription.id}`,
      openInNewTab: false,
      skipRedirect: false // Redirection automatique immédiate
    });

    if (saspayRes.success && (saspayRes.checkout_url || saspayRes.paymentUrl)) {
      return {
        success: true,
        redirectUrl: saspayRes.checkout_url || saspayRes.paymentUrl
      };
    }

    return {
      success: false,
      error: saspayRes.message || "Impossible de générer le lien de paiement SasaPay."
    };
  },

  /**
   * Récupère la souscription en attente de paiement active
   */
  getPendingSubscription(): ProSubscription | null {
    try {
      const raw = localStorage.getItem(PENDING_SUB_STORAGE_KEY);
      if (!raw) return null;
      const parsed: ProSubscription = JSON.parse(raw);
      if (parsed.status === 'pending_payment') {
        return parsed;
      }
      return null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Valide et active formellement la souscription suite à la confirmation de paiement
   */
  async markSubscriptionPaid(subscriptionId?: string, paymentReference?: string): Promise<ProSubscription | null> {
    const pending = this.getPendingSubscription();
    const targetId = subscriptionId || pending?.id;

    if (!targetId) return null;

    const now = new Date().toISOString();
    const updatedSub: ProSubscription = {
      ...(pending || {
        id: targetId,
        userId: 'current',
        email: '',
        customerName: 'Cinéphile Pro',
        plan: 'yearly',
        currency: 'USD',
        amount: 15.99,
        termsAccepted: true,
        createdAt: now
      }),
      status: 'active',
      paymentReference: paymentReference || undefined,
      updatedAt: now
    };

    try {
      localStorage.setItem(ACTIVE_SUB_STORAGE_KEY, JSON.stringify(updatedSub));
      localStorage.removeItem(PENDING_SUB_STORAGE_KEY);

      const existingRaw = localStorage.getItem(ALL_SUBS_STORAGE_KEY);
      const existing: ProSubscription[] = existingRaw ? JSON.parse(existingRaw) : [];
      const updatedList = existing.map(s => s.id === targetId ? updatedSub : s);
      localStorage.setItem(ALL_SUBS_STORAGE_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.error('[subscriptionService] Erreur mise à jour active:', e);
    }

    // Sync Supabase si configuré
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('subscriptions').update({
          status: 'active',
          payment_reference: paymentReference || null,
          updated_at: now
        }).eq('id', targetId);
      } catch (_) {}
    }

    return updatedSub;
  },

  /**
   * Réinitialise ou annule la souscription en attente
   */
  clearPendingSubscription(): void {
    try {
      localStorage.removeItem(PENDING_SUB_STORAGE_KEY);
    } catch (_) {}
  }
};

export default subscriptionService;
