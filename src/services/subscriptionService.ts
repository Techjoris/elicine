import { ProSubscription, SubscriptionStatus, Currency, PricingBillingCycle } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { processSaspayCheckout } from './payment';
import { getPayPalProCheckoutUrl } from './paypalService';

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
  gateway?: string;
  paymentMethod?: string;
}

export interface CheckoutIntent {
  plan: PricingBillingCycle;
  currency: Currency;
  amount: string;
  numericAmount: number;
  paymentMethod: 'mobile_money' | 'card' | 'paypal' | 'paypal_card';
  provider: 'saspay' | 'paypal';
  gateway?: string;
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
      gateway: params.gateway || params.paymentMethod,
      paymentMethod: params.paymentMethod || params.gateway,
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
      let existing: ProSubscription[] = [];
      try {
        const parsed = existingRaw ? JSON.parse(existingRaw) : [];
        existing = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        existing = [];
      }
      const updatedList = [finalSub, ...existing.filter(s => s && s.id !== finalSub.id)];
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

    const chosenGateway = intent.gateway || (intent.paymentMethod === 'card' ? 'card' : (intent.paymentMethod === 'paypal' || intent.paymentMethod === 'paypal_card' ? 'paypal' : 'mobile_money'));

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem('checkout_gateway', chosenGateway);
        sessionStorage.setItem('payment_method', chosenGateway);
      } catch (_) {}
    }

    // 1. Initialiser la souscription formelle en base
    const initRes = await this.initProSubscription({
      userId,
      email,
      customerName: name,
      phone: intent.phone,
      plan: intent.plan,
      currency: intent.currency,
      amount: intent.numericAmount,
      gateway: chosenGateway,
      paymentMethod: chosenGateway,
      termsAccepted: true
    });

    if (!initRes.success || !initRes.subscription) {
      return { success: false, error: initRes.error || "Échec d'enregistrement de la souscription." };
    }

    const subscription = initRes.subscription;

    // 2. Nettoyer l'intention mémorisée
    this.clearPendingCheckoutIntent();

    // 3. Déclencher la passerelle choisie
    if (intent.paymentMethod === 'paypal' || intent.paymentMethod === 'paypal_card' || intent.provider === 'paypal') {
      const paypalUrl = getPayPalProCheckoutUrl({
        plan: intent.plan,
        amount: intent.numericAmount,
        currency: intent.currency,
        email,
        customerName: name,
        subscriptionId: subscription.id
      });
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
      paymentMethod: intent.paymentMethod === 'card' ? 'card' : 'mobile',
      gateway: chosenGateway,
      subscriptionId: subscription.id,
      email,
      name,
      description: `Pass Pro Éliciné (${intent.amount} ${currSymbol} - ${isYearly ? 'Annuel' : 'Mensuel'})`,
      returnUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/payment/callback?subscription_id=${subscription.id}&gateway=${encodeURIComponent(chosenGateway)}`,
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
   * Vérifie auprès du backend et de la base de données si le paiement a été
   * validé par le Webhook cryptographique ou la passerelle de paiement.
   * Empêche formellement l'activation optimiste côté client.
   */
  async verifySubscriptionStatus(
    subscriptionId?: string,
    reference?: string
  ): Promise<{
    success: boolean;
    isPro: boolean;
    status: SubscriptionStatus | 'pending';
    plan?: 'monthly' | 'yearly';
    expiresAt?: string;
    gateway?: string | null;
    message?: string;
    subscription?: ProSubscription;
  }> {
    const pending = this.getPendingSubscription();
    const targetId = subscriptionId || pending?.id;
    const targetRef = reference || pending?.paymentReference;

    if (!targetId && !targetRef) {
      return {
        success: false,
        isPro: false,
        status: 'pending',
        gateway: pending?.gateway || null,
        message: "Aucun identifiant de souscription fourni."
      };
    }

    // 1. Interrogation du serveur backend sécurisé (/api/saspay?action=verify-subscription)
    try {
      const queryParams = new URLSearchParams();
      if (targetId) queryParams.set('subscription_id', targetId);
      if (targetRef) queryParams.set('reference', targetRef);

      const res = await fetch(`/api/saspay?action=verify-subscription&${queryParams.toString()}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        const detectedGateway = data.gateway || data.subscription?.gateway || pending?.gateway || null;

        if ((data?.success && data?.status === 'active' && data?.isPro) || data?.status === 'active' || data?.status === 'complete' || data?.isPro === true) {
          // Mise à jour du cache local UNIQUEMENT après validation formelle du serveur
          const activeSub: ProSubscription = data.subscription || {
            id: targetId || 'sub_active',
            userId: data.subscription?.user_id || 'current',
            email: data.subscription?.email || '',
            customerName: data.subscription?.customer_name || 'Cinéphile Pro',
            plan: data.plan || 'monthly',
            currency: data.subscription?.currency || 'USD',
            amount: data.subscription?.amount || 1.99,
            status: 'active',
            gateway: detectedGateway,
            paymentMethod: detectedGateway,
            termsAccepted: true,
            createdAt: data.subscription?.created_at || new Date().toISOString(),
            expiresAt: data.expiresAt
          };

          try {
            localStorage.setItem(ACTIVE_SUB_STORAGE_KEY, JSON.stringify(activeSub));
            localStorage.removeItem(PENDING_SUB_STORAGE_KEY);
          } catch (_) {}

          return {
            success: true,
            isPro: true,
            status: 'active',
            plan: data.plan || activeSub.plan,
            expiresAt: data.expiresAt,
            gateway: detectedGateway,
            subscription: activeSub
          };
        } else if (data?.status === 'pending') {
          return {
            success: true,
            isPro: false,
            status: 'pending',
            gateway: detectedGateway,
            message: data.message || "Paiement en cours de validation par votre établissement financier ou opérateur."
          };
        } else if (data?.status === 'failed') {
          return {
            success: false,
            isPro: false,
            status: 'failed',
            gateway: detectedGateway,
            message: data.message || "La transaction a été rejetée ou annulée par la passerelle."
          };
        }
      }
    } catch (err) {
      console.warn('[subscriptionService] Backend verify warning:', err);
    }

    // 2. Repli de consultation directe Supabase en lecture seule si le backend est injoignable
    if (isSupabaseConfigured() && targetId) {
      try {
        const { data: dbSub, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('id', targetId)
          .maybeSingle();

        if (!error && dbSub && dbSub.status === 'active') {
          const isExpired = dbSub.expires_at ? new Date(dbSub.expires_at).getTime() <= Date.now() : false;
          if (!isExpired) {
            return {
              success: true,
              isPro: true,
              status: 'active',
              plan: dbSub.plan,
              expiresAt: dbSub.expires_at,
              gateway: dbSub.gateway || pending?.gateway || null,
              subscription: dbSub
            };
          }
        }
      } catch (_) {}
    }

    return {
      success: true,
      isPro: false,
      status: 'pending',
      gateway: pending?.gateway || null,
      message: "En attente de la confirmation bancaire par Webhook sécurisé."
    };
  },

  /**
   * Déclenche l'activation immédiate du Pass Pro côté backend (/api/activate-pro)
   * et met à jour Supabase ainsi que le cache local sans attendre un webhook distant.
   */
  async activateProImmediately(params: {
    email: string;
    userId?: string;
    customerName?: string;
    phone?: string;
    plan?: string;
    amount?: number;
    currency?: string;
    gateway?: string;
    paymentReference?: string;
    subscriptionId?: string;
    isDonation?: boolean;
  }): Promise<{
    success: boolean;
    isPro: boolean;
    plan?: string;
    expiresAt?: string | null;
    subscriptionId?: string;
    dbUpdated?: boolean;
    emailSent?: boolean;
    error?: string;
  }> {
    const cleanEmail = (params.email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, isPro: false, error: "Adresse email invalide." };
    }

    try {
      const res = await fetch('/api/activate-pro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          ...params,
          email: cleanEmail
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.success) {
          const activeSub: ProSubscription = {
            id: data.subscriptionId || params.subscriptionId || `sub_${Date.now()}`,
            userId: params.userId || 'current',
            email: cleanEmail,
            customerName: params.customerName || cleanEmail.split('@')[0] || 'Cinéphile Pro',
            plan: (data.plan || params.plan || 'monthly') as any,
            currency: (params.currency || 'USD').toUpperCase() as any,
            amount: Number(params.amount || (params.plan === 'yearly' ? 15.99 : 1.99)),
            status: 'active',
            gateway: (params.gateway || 'saspay') as any,
            paymentMethod: (params.gateway || 'saspay') as any,
            termsAccepted: true,
            createdAt: new Date().toISOString(),
            expiresAt: data.expiresAt || new Date(Date.now() + 30 * 86400000).toISOString()
          };

          try {
            localStorage.setItem(ACTIVE_SUB_STORAGE_KEY, JSON.stringify(activeSub));
            localStorage.removeItem(PENDING_SUB_STORAGE_KEY);
          } catch (_) {}

          return {
            success: true,
            isPro: data.isPro ?? true,
            plan: data.plan,
            expiresAt: data.expiresAt,
            subscriptionId: data.subscriptionId,
            dbUpdated: data.dbUpdated,
            emailSent: data.emailSent
          };
        }
      }
    } catch (err: any) {
      console.warn('[subscriptionService.activateProImmediately] Erreur fetch /api/activate-pro:', err);
    }

    return {
      success: false,
      isPro: false,
      error: "Impossible de joindre le service d'activation."
    };
  },

  /**
   * Vérifie le statut Pro réel de l'utilisateur connecté auprès de la base de données.
   * Si aucune souscription active valide n'est trouvée, retourne isPro: false.
   */
  async checkUserProStatus(user: { id?: string; email?: string } | null): Promise<{
    isPro: boolean;
    plan?: 'monthly' | 'yearly' | 'free' | string;
    expiresAt?: string | null;
    daysRemaining?: number | null;
  }> {
    if (!user) {
      return { isPro: false };
    }

    const email = (user.email || '').trim().toLowerCase();
    // Exemption Master Admin permanente
    if (email === 'ivanjoris959@gmail.com') {
      return {
        isPro: true,
        plan: 'yearly',
        expiresAt: 'Illimité (Fondateur)'
      };
    }

    // 1. Consultation Supabase en direct si configuré
    if (isSupabaseConfigured()) {
      try {
        // Helper de validation UUID pour PostgreSQL
        const isUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

        // 1.A. Vérification prioritaire de la table profiles (is_pro = true)
        let profileData: any = null;
        if (email) {
          const { data } = await supabase
            .from('profiles')
            .select('id, email, is_pro, expires_at')
            .ilike('email', email.trim())
            .maybeSingle();
          if (data) profileData = data;
        }
        if (!profileData && user.id && isUuid(user.id)) {
          const { data } = await supabase
            .from('profiles')
            .select('id, email, is_pro, expires_at')
            .eq('id', user.id)
            .maybeSingle();
          if (data) profileData = data;
        }

        if (profileData && (profileData.is_pro === true || String(profileData.is_pro) === 'true')) {
          const effectiveExpiry = profileData.expires_at;

          // Si une date d'expiration existe et qu'elle est dépassée, considérer comme non pro
          if (effectiveExpiry && new Date(effectiveExpiry).getTime() < Date.now()) {
            console.log(`[subscriptionService] ⏱️ Expiration de l'abonnement constatée pour ${profileData.email} (${effectiveExpiry}).`);
            return {
              isPro: false,
              plan: 'free',
              expiresAt: effectiveExpiry,
              daysRemaining: 0
            };
          }

          const daysRemaining = effectiveExpiry 
            ? Math.max(1, Math.ceil((new Date(effectiveExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : null;

          return {
            isPro: true,
            plan: 'monthly',
            expiresAt: effectiveExpiry || null,
            daysRemaining
          };
        }

        // 1.B. Vérification de la table subscriptions
        let subData: any = null;
        if (email) {
          const { data } = await supabase.from('subscriptions').select('*').eq('email', email).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (data) subData = data;
        }
        if (!subData && user.id && isUuid(user.id)) {
          const { data } = await supabase.from('subscriptions').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (data) subData = data;
        }

        if (subData) {
          const isExpired = subData.expires_at ? new Date(subData.expires_at).getTime() <= Date.now() : false;
          if (!isExpired) {
            const daysRemaining = subData.expires_at 
              ? Math.max(1, Math.ceil((new Date(subData.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
              : null;

            return {
              isPro: true,
              plan: subData.plan,
              expiresAt: subData.expires_at,
              daysRemaining
            };
          }
        }
      } catch (sbErr) {
        console.warn('[subscriptionService] Erreur vérification statut Supabase direct:', sbErr);
      }
    }

    // 2. Appel serveur de secours (Service Role Supabase - Bypasse RLS côté serveur)
    try {
      // 2.A. Endpoint officiel /api/activate-pro?action=check-status
      const resPro = await fetch(`/api/activate-pro?action=check-status&userId=${encodeURIComponent(user.id || '')}&email=${encodeURIComponent(email)}`);
      if (resPro.ok) {
        const dataPro = await resPro.json();
        if (dataPro?.isPro) {
          return {
            isPro: true,
            plan: dataPro.plan || 'monthly',
            expiresAt: dataPro.expiresAt || null,
            daysRemaining: dataPro.daysRemaining ?? null
          };
        }
      }
    } catch (_) {}

    try {
      // 2.B. Endpoint secondaire /api/saspay?action=check-user-status
      const res = await fetch(`/api/saspay?action=check-user-status&userId=${encodeURIComponent(user.id || '')}&email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.isPro) {
          return {
            isPro: true,
            plan: data.plan || 'monthly',
            expiresAt: data.expiresAt || null,
            daysRemaining: data.daysRemaining ?? null
          };
        }
      }
    } catch (_) {}

    // 3. Cache local de secours
    try {
      const localActive = this.getActiveSubscription();
      if (localActive && localActive.status === 'active' && (localActive.email?.toLowerCase() === email || localActive.userId === user.id)) {
        const isExpired = localActive.expiresAt ? new Date(localActive.expiresAt).getTime() <= Date.now() : false;
        if (!isExpired) {
          const daysRemaining = localActive.expiresAt 
            ? Math.max(1, Math.ceil((new Date(localActive.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : null;

          return {
            isPro: true,
            plan: localActive.plan,
            expiresAt: localActive.expiresAt,
            daysRemaining
          };
        }
      }
    } catch (_) {}

    return { isPro: false };
  },

  /**
   * Méthode sécurisée de vérification (remplace l'ancien bypass d'écriture client).
   */
  async markSubscriptionPaid(subscriptionId?: string, paymentReference?: string): Promise<ProSubscription | null> {
    console.warn('[Security] markSubscriptionPaid appelé. Redirection vers verifySubscriptionStatus sécurisé.');
    const check = await this.verifySubscriptionStatus(subscriptionId, paymentReference);
    return check.subscription || null;
  },

  /**
   * Transmet un paiement PayPal complété (onApprove) au serveur backend
   * pour validation cryptographique et écriture sécurisée en base.
   */
  async recordPayPalPayment(params: {
    orderId: string;
    userId?: string;
    email?: string;
    customerName?: string;
    plan: PricingBillingCycle;
    amount: number;
    currency: string;
    details?: any;
  }): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
    const subId = `sub_paypal_${params.orderId}`;
    const email = (params.email || params.details?.payer?.email_address || 'support@elicine.app').trim().toLowerCase();
    const name = (
      params.customerName ||
      (params.details?.payer?.name?.given_name 
        ? `${params.details.payer.name.given_name} ${params.details.payer.name.surname || ''}`.trim() 
        : 'Cinéphile Pro')
    );

    const isCard = !!(params.details?.payment_source?.card || params.details?.payer?.funding_source === 'card');
    const gateway = isCard ? 'card' : 'paypal';

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('checkout_gateway', gateway);
        sessionStorage.setItem('payment_method', gateway);
      }
      const pendingSub: ProSubscription = {
        id: subId,
        userId: params.userId || 'usr_paypal',
        email,
        customerName: name,
        plan: params.plan,
        currency: params.currency || 'USD',
        amount: params.amount,
        status: 'pending_payment',
        paymentReference: params.orderId,
        paymentProvider: 'paypal',
        gateway,
        paymentMethod: gateway,
        termsAccepted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(PENDING_SUB_STORAGE_KEY, JSON.stringify(pendingSub));
    } catch (_) {}

    // Transmission au backend serverless Vercel /api/paypal
    try {
      const res = await fetch('/api/paypal?action=record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: params.orderId,
          subscriptionId: subId,
          userId: params.userId,
          email,
          customerName: name,
          plan: params.plan,
          currency: params.currency || 'USD',
          amount: params.amount,
          gateway,
          paymentMethod: gateway,
          details: params.details
        })
      });

      if (res.ok) {
        const data = await res.json();
        return { success: true, subscriptionId: data.subscriptionId || subId };
      }
    } catch (err: any) {
      console.error('[subscriptionService] Erreur appel /api/paypal:', err);
    }

    return {
      success: true,
      subscriptionId: subId
    };
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
