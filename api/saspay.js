import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 
  process.env.VITE_SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

const supabaseAnonKey = 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY ||
  '';

const supabase = (supabaseUrl && supabaseAnonKey && supabaseAnonKey.length > 20)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Mémoire globale des souscriptions pour le runtime Serverless
const globalSubscriptions = (globalThis.__elicine_subscriptions = globalThis.__elicine_subscriptions || new Map());

/**
 * Récupère les identifiants SasPay depuis les variables d'environnement Vercel.
 * Supporte la variable spécifiée `saspay_Backend` (clé brute ou JSON avec sous-clés).
 */
export function getSaspayCredentials(req) {
  const raw = (
    process.env.saspay_Backend ||
    process.env.SASPAY_BACKEND ||
    process.env.saspay_backend ||
    process.env.SASPAY_SECRET_KEY ||
    process.env.SASPAY_API_KEY ||
    process.env.VITE_SASPAY_BACKEND ||
    process.env.VITE_SASPAY_API_KEY ||
    req?.headers['x-saspay-key'] ||
    req?.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    req?.body?.secretKey ||
    req?.body?.apiKey ||
    ''
  ).trim();

  let apiKey = raw;
  let clientId = '';
  let clientSecret = '';

  // Si saspay_Backend est stocké au format JSON (ex: { "apiKey": "sk_live_...", "clientId": "..." })
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      apiKey = (parsed.apiKey || parsed.secretKey || parsed.token || parsed.key || parsed.sk || apiKey).trim();
      clientId = (parsed.clientId || parsed.client_id || '').trim();
      clientSecret = (parsed.clientSecret || parsed.client_secret || '').trim();
    } catch (_) {}
  }

  return { apiKey, clientId, clientSecret, raw };
}

/**
 * Extrait un message d'erreur textuel lisible depuis n'importe quel objet d'erreur ou réponse API.
 * Empêche formellement l'affichage de '[object Object]'.
 */
export function extractErrorMessage(data, fallback = 'Erreur SasPay') {
  if (!data) return fallback;
  if (typeof data === 'string') {
    return data.trim() === '[object Object]' ? fallback : data;
  }
  if (data instanceof Error) {
    return data.message || data.name || fallback;
  }
  if (typeof data === 'object') {
    // 1. data.error (string ou sous-objet)
    if (typeof data.error === 'string' && data.error.trim() && data.error !== '[object Object]') {
      return data.error;
    }
    if (data.error && typeof data.error === 'object') {
      const nested = extractErrorMessage(data.error, '');
      if (nested) return nested;
    }
    // 2. data.message (string ou sous-objet)
    if (typeof data.message === 'string' && data.message.trim() && data.message !== '[object Object]') {
      return data.message;
    }
    if (data.message && typeof data.message === 'object') {
      const nested = extractErrorMessage(data.message, '');
      if (nested) return nested;
    }
    // 3. data.detail (FastAPI / Django REST)
    if (typeof data.detail === 'string' && data.detail.trim()) {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail.map(d => (d && typeof d === 'object' ? (d.msg || d.message || JSON.stringify(d)) : String(d))).join(', ');
    }
    // 4. data.errors (dictionnaire de validation)
    if (data.errors && typeof data.errors === 'object') {
      return Object.entries(data.errors)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') : (typeof v === 'object' ? JSON.stringify(v) : v)}`)
        .join(' | ');
    }
    // 5. description / reason / msg
    if (typeof data.description === 'string' && data.description.trim()) return data.description;
    if (typeof data.reason === 'string' && data.reason.trim()) return data.reason;
    if (typeof data.msg === 'string' && data.msg.trim()) return data.msg;

    // 6. JSON fallback
    try {
      const str = JSON.stringify(data);
      if (str && str !== '{}') return str;
    } catch (_) {}
  }
  return String(data) || fallback;
}

/**
 * Handler Serverless SasPay (Unique passerelle Mobile Money pour Éliciné)
 * - POST : Initialisation de session de paiement (checkout-sessions ou softpay) / Gestion des webhooks
 * - GET  : Vérification du statut de la transaction
 */
export default async function handler(req, res) {
  // 1. En-têtes CORS universels
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Saspay-Key, Idempotency-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { apiKey } = getSaspayCredentials(req);
  const action = req.query?.action || '';

  // 1.5. Initialisation formelle d'une souscription Pro (Prérequis obligatoire)
  if (action === 'init-subscription' || action === 'create-subscription') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Méthode non autorisée. POST requis.' });
    }

    let subBody = req.body;
    if (typeof subBody === 'string') {
      try { subBody = JSON.parse(subBody); } catch (_) { subBody = {}; }
    }
    subBody = subBody || {};

    const { userId, email, customerName, phone, plan, currency, amount, termsAccepted } = subBody;

    if (!termsAccepted) {
      return res.status(400).json({
        success: false,
        error: "L'acceptation des conditions d'abonnement est obligatoire pour valider la souscription."
      });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        error: "Une adresse email valide est obligatoire pour initialiser la souscription."
      });
    }

    const subId = `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const subscription = {
      id: subId,
      userId: String(userId || 'usr_anonymous').trim(),
      email: cleanEmail,
      customerName: String(customerName || cleanEmail.split('@')[0] || 'Cinéphile Pro').trim(),
      phone: phone ? String(phone).trim() : undefined,
      plan: plan === 'yearly' ? 'yearly' : 'monthly',
      currency: (currency || 'USD').toUpperCase(),
      amount: Number(amount) || 1.99,
      status: 'pending_payment',
      termsAccepted: true,
      createdAt: now,
      updatedAt: now
    };

    // Stockage en mémoire globale du worker
    globalSubscriptions.set(subId, subscription);
    globalSubscriptions.set(`email:${cleanEmail}`, subscription);

    // Synchronisation Supabase si disponible
    if (supabase) {
      try {
        await supabase.from('subscriptions').upsert({
          id: subscription.id,
          user_id: subscription.userId,
          email: subscription.email,
          customer_name: subscription.customerName,
          phone: subscription.phone || null,
          plan: subscription.plan,
          currency: subscription.currency,
          amount: subscription.amount,
          status: 'pending_payment',
          terms_accepted: true,
          created_at: subscription.createdAt,
          updated_at: subscription.updatedAt
        });
      } catch (sbErr) {
        console.warn('[SasPay Serverless] Notification table Supabase subscriptions:', sbErr?.message);
      }
    }

    console.log('[SasPay Serverless] Souscription Pro initialisée avec succès (pending_payment):', {
      subId,
      email: cleanEmail,
      plan: subscription.plan,
      amount: subscription.amount,
      currency: subscription.currency
    });

    return res.status(200).json({
      success: true,
      subscription
    });
  }

  // 1.6. Consultation d'une souscription
  if (action === 'get-subscription') {
    const subId = req.query?.id || req.query?.subscription_id;
    const email = (req.query?.email || '').trim().toLowerCase();

    let found = null;
    if (subId) found = globalSubscriptions.get(subId);
    if (!found && email) found = globalSubscriptions.get(`email:${email}`);

    if (!found && subId && supabase) {
      try {
        const { data } = await supabase.from('subscriptions').select('*').eq('id', subId).maybeSingle();
        if (data) found = data;
      } catch (_) {}
    }

    if (!found) {
      return res.status(404).json({ success: false, error: 'Souscription non trouvée.' });
    }

    return res.status(200).json({ success: true, subscription: found });
  }

  // 2. Traitement Webhook (action=webhook ou POST avec structure d'événement)
  if (action === 'webhook' || req.headers['x-saspay-event'] || req.body?.event) {
    let webhookBody = req.body;
    if (typeof webhookBody === 'string') {
      try {
        webhookBody = JSON.parse(webhookBody);
      } catch (_) {
        webhookBody = {};
      }
    }

    const event = webhookBody?.event || 'transaction.unknown';
    const transactionData = webhookBody?.data || {};
    const rawStatus = (transactionData?.status || '').toUpperCase();

    console.log(`[SasPay Webhook] Événement reçu: ${event}, Statut: ${rawStatus}, Transaction ID: ${transactionData?.id || 'N/A'}`);

    // Détection de succès
    const isSuccess = rawStatus === 'SUCCESS' || rawStatus === 'COMPLETED' || rawStatus === 'PAID' || event === 'transaction.success';

    if (isSuccess && transactionData?.id) {
      const txId = transactionData.id;
      for (const [key, sub] of globalSubscriptions.entries()) {
        if (sub && (sub.paymentReference === txId || sub.id === transactionData?.subscription_id)) {
          sub.status = 'active';
          sub.updatedAt = new Date().toISOString();
          globalSubscriptions.set(key, sub);
          if (supabase) {
            supabase.from('subscriptions').update({ status: 'active', updated_at: sub.updatedAt }).eq('id', sub.id).catch(() => {});
          }
        }
      }
    }

    return res.status(200).json({
      received: true,
      event,
      status: isSuccess ? 'processed' : 'pending',
      transactionId: transactionData?.id || null
    });
  }

  // 3. GET : Vérification du statut d'une transaction SasPay
  if (req.method === 'GET') {
    const sessionId = req.query?.id || req.query?.reference || req.query?.session_id;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Identifiant de transaction SasPay manquant (paramètre id ou reference requis).'
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'Clé API saspay_Backend non configurée sur le serveur Vercel.'
      });
    }

    try {
      // SasPay vérification : POST /checkout-sessions/{id}/ ou GET de secours
      let response = await fetch(`https://api.saspay.me/api/v1/checkout-sessions/${encodeURIComponent(sessionId)}/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok && response.status === 405) {
        response = await fetch(`https://api.saspay.me/api/v1/checkout-sessions/${encodeURIComponent(sessionId)}/`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          }
        });
      }

      const resText = await response.text();
      let data = {};
      try {
        data = JSON.parse(resText);
      } catch (_) {
        data = { message: resText };
      }

      const rawStatus = (data?.status || data?.data?.status || 'PENDING').toUpperCase();
      const isSuccess = rawStatus === 'SUCCESS' || rawStatus === 'COMPLETED' || rawStatus === 'PAID';
      const isFailed = rawStatus === 'FAILED' || rawStatus === 'CANCELLED' || rawStatus === 'REJECTED';

      return res.status(response.status).json({
        status: isSuccess ? 'complete' : (isFailed ? 'failed' : 'pending'),
        rawStatus,
        data: data?.data || data
      });
    } catch (err) {
      console.error('[SasPay Verify Exception]:', err.message);
      return res.status(500).json({
        error: `Erreur lors de la vérification SasPay : ${err.message}`
      });
    }
  }

  // 4. POST : Initialisation d'une transaction SasPay
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        body = {};
      }
    }
    body = body || {};

    const amount = Number(body.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: 'Montant de transaction invalide.'
      });
    }

    // Normalisation de la devise (XOF / XAF prioritaires pour l'Afrique francophone)
    const currency = (body.currency || 'XOF').toUpperCase();
    const formattedAmount = (amount).toFixed(2);

    const customerEmail = (body.customer?.email || body.customer_email || body.email || 'client@elicine.com').trim();
    const customerName = (
      body.customer_name ||
      (body.customer?.first_name ? `${body.customer.first_name} ${body.customer.last_name || ''}` : '') ||
      body.name ||
      'Cinéphile Éliciné'
    ).trim();

    // SÉCURITÉ TUNNEL PRO : Contrôle strict qu'une souscription valide en attente existe
    const paymentType = (body.paymentType || body.payment_type || (body.billing_cycle || body.billingCycle ? 'pro' : '') || '').toLowerCase();
    const isPro = paymentType === 'pro' || (body.description && body.description.toLowerCase().includes('pass pro'));

    let verifiedSubscription = null;

    if (isPro) {
      const subscriptionId = (body.subscription_id || body.subscriptionId || req.headers['x-subscription-id'] || '').trim();

      if (!subscriptionId) {
        console.warn('[SasPay Security Check] Rejet 400 : Paiement Pro initié sans subscription_id.');
        return res.status(400).json({
          success: false,
          error: "Sécurité souscription : Aucun identifiant d'enregistrement Pro fourni. Vous devez impérativement valider votre inscription Pro avant d'appeler le paiement."
        });
      }

      // Recherche dans le registre mémoire serveur
      verifiedSubscription = globalSubscriptions.get(subscriptionId);

      // Si pas en mémoire, recherche dans la base Supabase
      if (!verifiedSubscription && supabase) {
        try {
          const { data } = await supabase.from('subscriptions').select('*').eq('id', subscriptionId).maybeSingle();
          if (data) verifiedSubscription = data;
        } catch (sbErr) {
          console.warn('[SasPay Security Check] Erreur lecture Supabase:', sbErr?.message);
        }
      }

      // Repli par email si ID absent du worker courant mais email en attente
      if (!verifiedSubscription && customerEmail) {
        const emailSub = globalSubscriptions.get(`email:${customerEmail.toLowerCase()}`);
        if (emailSub && (emailSub.status === 'pending_payment' || emailSub.status === 'pending')) {
          verifiedSubscription = emailSub;
        }
      }

      if (!verifiedSubscription) {
        console.warn('[SasPay Security Check] Rejet 403 : Aucune souscription valide trouvée pour ID:', subscriptionId);
        return res.status(403).json({
          success: false,
          error: "Sécurité souscription : Aucune souscription valide en attente de paiement n'a été trouvée pour ce compte. Veuillez compléter l'étape d'inscription."
        });
      }

      if (verifiedSubscription.status === 'active') {
        return res.status(400).json({
          success: false,
          error: "Cette souscription a déjà été réglée et est actuellement active sur votre compte."
        });
      }

      console.log('[SasPay Security Check] Souscription en attente confirmée avec succès :', {
        subId: verifiedSubscription.id,
        status: verifiedSubscription.status,
        email: verifiedSubscription.email
      });
    }

    if (!apiKey) {
      console.error('[SasPay Backend] Clé API absente dans process.env.saspay_Backend');
      return res.status(500).json({
        error: 'Clé d\'authentification SasPay non configurée. Veuillez renseigner saspay_Backend dans les variables d\'environnement Vercel.'
      });
    }

    const rawReturnUrl = (body.return_url || body.redirect_url || 'https://elicine.vercel.app/?payment_status=success').trim();
    const returnUrl = verifiedSubscription
      ? (rawReturnUrl.includes('?') ? `${rawReturnUrl}&subscription_id=${verifiedSubscription.id}` : `${rawReturnUrl}?subscription_id=${verifiedSubscription.id}`)
      : rawReturnUrl;

    const cancelUrl = (body.cancel_url || returnUrl).trim();
    const description = verifiedSubscription
      ? `${body.description || 'Pass Pro Éliciné'} [Ref: ${verifiedSubscription.id}]`
      : (body.description || 'Paiement Mobile Éliciné').trim();

    const idempotencyKey = req.headers['idempotency-key'] || body.idempotency_key || crypto.randomUUID();

    // Construction du payload officiel SasPay Checkout Session
    const saspayPayload = {
      amount: formattedAmount,
      currency,
      description,
      customer_email: customerEmail,
      customer_name: customerName,
      return_url: returnUrl,
      cancel_url: cancelUrl
    };

    console.log('[SasPay Backend] Initialisation session de checkout :', {
      amount: formattedAmount,
      currency,
      customer_email: customerEmail,
      subscriptionId: verifiedSubscription?.id || 'N/A',
      idempotencyKey
    });

    try {
      const apiRes = await fetch('https://api.saspay.me/api/v1/checkout-sessions/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(saspayPayload)
      });

      const resText = await apiRes.text();
      let data = {};
      try {
        data = JSON.parse(resText);
      } catch (_) {
        data = { message: resText };
      }

      console.log(`[SasPay Backend] Réponse API (${apiRes.status}) :`, data);

      if (!apiRes.ok) {
        const errorMsg = extractErrorMessage(data, `Échec API SasPay (${apiRes.status})`);
        return res.status(apiRes.status).json({
          success: false,
          error: errorMsg,
          message: errorMsg,
          rawResponse: data
        });
      }

      // Extraction du lien de paiement SasPay
      const checkoutUrl = 
        data?.checkout_url || 
        data?.url || 
        data?.link || 
        data?.data?.checkout_url || 
        data?.data?.url || 
        data?.data?.link || 
        null;

      const reference = data?.id || data?.reference || data?.data?.id || idempotencyKey;

      if (verifiedSubscription) {
        verifiedSubscription.paymentReference = reference;
        verifiedSubscription.updatedAt = new Date().toISOString();
        globalSubscriptions.set(verifiedSubscription.id, verifiedSubscription);
        if (supabase) {
          supabase.from('subscriptions').update({
            payment_reference: reference,
            updated_at: verifiedSubscription.updatedAt
          }).eq('id', verifiedSubscription.id).catch(() => {});
        }
      }

      return res.status(200).json({
        success: true,
        checkout_url: checkoutUrl,
        paymentUrl: checkoutUrl,
        link: checkoutUrl,
        url: checkoutUrl,
        reference,
        subscription_id: verifiedSubscription?.id || null,
        data
      });
    } catch (err) {
      console.error('[SasPay Exception]:', err);
      const errorMsg = extractErrorMessage(err, "Erreur interne de communication avec l'API SasPay");
      return res.status(500).json({
        success: false,
        error: `Erreur interne lors de la communication avec SasPay : ${errorMsg}`,
        message: `Erreur interne lors de la communication avec SasPay : ${errorMsg}`
      });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
