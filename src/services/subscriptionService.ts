import { ProSubscription, Currency } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const PENDING_SUB_STORAGE_KEY = 'cineia_pending_subscription';
const ACTIVE_SUB_STORAGE_KEY = 'cineia_active_subscription';
const ALL_SUBS_STORAGE_KEY = 'cineia_all_subscriptions';

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

export const subscriptionService = {
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
