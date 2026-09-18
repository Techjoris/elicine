import { paypalRecordPaymentSchema } from './_security.js';
import { activateUserPassPro, supabaseAdmin } from './_pro-activation.js';

/**
 * Récupère l'URL de base de l'API PayPal en fonction du mode configuré
 * Par défaut strict : mode LIVE (Production)
 */
function getPayPalApiBase() {
  const mode = (
    process.env.PAYPAL_MODE ||
    process.env.NEXT_PUBLIC_PAYPAL_MODE ||
    process.env.VITE_PAYPAL_MODE ||
    process.env.VITE_PAYPAL_ENV ||
    process.env.PAYPAL_ENV ||
    'live'
  ).toLowerCase().trim();

  return mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

/**
 * Obtient un Bearer Token OAuth2 auprès de l'API PayPal
 */
async function getPayPalAccessToken() {
  const clientId = (
    process.env.PAYPAL_CLIENT_ID ||
    process.env.VITE_PAYPAL_CLIENT_ID ||
    ''
  ).trim();

  const clientSecret = (
    process.env.PAYPAL_CLIENT_SECRET ||
    ''
  ).trim();

  if (!clientId || !clientSecret || clientId === 'sb') {
    return null;
  }

  const base = getPayPalApiBase();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[PayPal API] Échec obtention token OAuth2:', res.status, errText);
      return null;
    }

    const data = await res.json();
    return { token: data.access_token, base };
  } catch (err) {
    console.error('[PayPal API] Erreur réseau token:', err);
    return null;
  }
}

/**
 * Validation cryptographique de la signature d'un webhook PayPal
 * Appelle l'endpoint officiel PayPal /v1/notifications/verify-webhook-signature
 */
async function verifyPayPalWebhookSignature(req, rawBody) {
  const webhookId = (process.env.PAYPAL_WEBHOOK_ID || '').trim();
  const authAlgo = req.headers['paypal-auth-algo'] || req.headers['PAYPAL-AUTH-ALGO'];
  const certUrl = req.headers['paypal-cert-url'] || req.headers['PAYPAL-CERT-URL'];
  const transmissionId = req.headers['paypal-transmission-id'] || req.headers['PAYPAL-TRANSMISSION-ID'];
  const transmissionSig = req.headers['paypal-transmission-sig'] || req.headers['PAYPAL-TRANSMISSION-SIG'];
  const transmissionTime = req.headers['paypal-transmission-time'] || req.headers['PAYPAL-TRANSMISSION-TIME'];

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return { valid: false, reason: "En-têtes de signature cryptographique PayPal manquants." };
  }

  // Vérification de sécurité de l'URL du certificat (protection anti-SSRF)
  try {
    const parsedCert = new URL(certUrl);
    if (parsedCert.protocol !== 'https:' || !parsedCert.hostname.endsWith('.paypal.com')) {
      return { valid: false, reason: "URL de certificat non autorisée (doit provenir de *.paypal.com)." };
    }
  } catch (_) {
    return { valid: false, reason: "URL de certificat PayPal malformée." };
  }

  const authData = await getPayPalAccessToken();
  if (!authData) {
    console.warn('[PayPal Webhook] ⚠️ Impossible de vérifier la signature (PAYPAL_CLIENT_SECRET manquant sur le serveur).');
    return { valid: false, reason: "Identifiants API PayPal manquants sur le serveur pour vérifier la signature." };
  }

  const eventPayload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

  const verifyPayload = {
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: webhookId,
    webhook_event: eventPayload
  };

  try {
    const verifyRes = await fetch(`${authData.base}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(verifyPayload)
    });

    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      return { valid: false, reason: `Échec API PayPal verify: ${verifyRes.status} ${errText}` };
    }

    const verifyData = await verifyRes.json();
    const isSuccess = verifyData.verification_status === 'SUCCESS';
    return {
      valid: isSuccess,
      status: verifyData.verification_status
    };
  } catch (err) {
    return { valid: false, reason: err?.message || "Erreur de validation de signature." };
  }
}

/**
 * Vérifie l'état d'un ordre auprès de l'API PayPal en mode direct
 */
async function verifyPayPalOrderWithApi(orderId) {
  const authData = await getPayPalAccessToken();
  if (!authData) return null;

  try {
    const res = await fetch(`${authData.base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        'Authorization': `Bearer ${authData.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn(`[PayPal Verify Order] HTTP ${res.status} pour l'ordre ${orderId}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('[PayPal Verify Order] Exception:', err);
    return null;
  }
}

export default async function handler(req, res) {
  // Entêtes CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query?.action || (req.body?.action) || '';

  // ─── 1. Récupération de la configuration publique PayPal ─────────────────────
  if (req.method === 'GET' || action === 'config') {
    const clientId = (
      process.env.PAYPAL_CLIENT_ID ||
      process.env.VITE_PAYPAL_CLIENT_ID ||
      ''
    ).trim();

    const businessId = (
      process.env.VITE_PAYPAL_BUSINESS_ID ||
      process.env.PAYPAL_BUSINESS_ID ||
      'ivanjoris959@gmail.com'
    ).trim();

    const mode = (
      process.env.PAYPAL_MODE ||
      process.env.NEXT_PUBLIC_PAYPAL_MODE ||
      process.env.VITE_PAYPAL_MODE ||
      'live'
    ).trim().toLowerCase();

    return res.status(200).json({
      success: true,
      clientId,
      businessId,
      mode,
      currency: 'USD',
      monthlyAmount: 1.99,
      yearlyAmount: 15.99,
      guestCheckout: {
        enabled: true,
        solutionType: 'Sole',
        landingPage: 'Billing',
        supportedCurrencies: ['USD', 'EUR', 'CAD', 'GBP', 'AUD']
      }
    });
  }

  // ─── 2. Enregistrement sécurisé avec vérification PayPal réelle ─────────────
  // Interdiction de l'activation aveugle basée sur la simple confiance au client.
  if (req.method === 'POST' && (action === 'record-payment' || !action)) {
    try {
      const validation = paypalRecordPaymentSchema.safeParse(req.body || {});
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Données de paiement PayPal invalides",
          details: validation.error.format()
        });
      }

      const {
        orderId,
        subscriptionId,
        userId,
        email,
        customerName,
        plan,
        currency,
        amount,
        details
      } = validation.data;

      // VÉRIFICATION FORMELLE AUPRÈS DE L'API PAYPAL (Live)
      const orderData = await verifyPayPalOrderWithApi(orderId);
      
      // Si les identifiants API sont présents et l'ordre est vérifiable
      if (orderData) {
        const orderStatus = String(orderData.status || '').toUpperCase();
        console.log(`[PayPal API Check] Statut réel de l'ordre ${orderId} auprès de PayPal : ${orderStatus}`);

        // Le statut doit être COMPLETED (fonds prélevés et capturés)
        if (orderStatus !== 'COMPLETED') {
          return res.status(402).json({
            success: false,
            error: "Le paiement n'a pas été capturé par PayPal. Aucun prélèvement n'a été effectué sur votre compte.",
            status: orderStatus
          });
        }
      } else {
        // Si le serveur ne peut pas vérifier directement avec le Secret API,
        // on refuse l'activation instantanée par le client pour forcer l'attente du Webhook officiel.
        console.warn(`[PayPal Security] Ordre ${orderId} en attente de la validation cryptographique par Webhook.`);
        return res.status(202).json({
          success: true,
          pendingWebhook: true,
          message: "Paiement en cours de validation finale par le webhook officiel PayPal. Le Pass Pro sera activé dès confirmation bancaire.",
          orderId
        });
      }

      const targetSubId = subscriptionId || `sub_paypal_${orderId}`;
      const cleanEmail = (email || details?.payer?.email_address || orderData?.payer?.email_address || '').trim().toLowerCase();
      const cleanName = customerName || (details?.payer?.name?.given_name ? `${details.payer.name.given_name} ${details.payer.name.surname || ''}`.trim() : 'Cinéphile Pro');
      const numericAmount = Number(amount || (plan === 'yearly' ? 15.99 : 1.99));

      const isDonation = (
        (validation.data.plan === 'donation' || validation.data.plan === 'don') ||
        String(validation.data.details?.purchase_units?.[0]?.description || '').toLowerCase().includes('don') ||
        String(req.body?.itemType || req.body?.type || '').toLowerCase() === 'donation' ||
        (numericAmount > 0 && numericAmount < 1.50 && !['monthly', 'yearly'].includes(validation.data.plan))
      );

      // Activation centralisée Supabase + E-mail Resend
      const activationResult = await activateUserPassPro(cleanEmail, {
        plan: isDonation ? 'donation' : (plan || 'monthly'),
        customerName: cleanName,
        amount: numericAmount,
        currency: currency || 'USD',
        gateway: 'paypal',
        paymentReference: orderId,
        subscriptionId: targetSubId,
        isDonation,
        userId
      });

      return res.status(200).json({
        success: true,
        message: "Paiement PayPal vérifié avec succès et Pass Pro activé.",
        subscriptionId: targetSubId,
        orderId,
        activation: activationResult
      });
    } catch (err) {
      console.error('[PayPal Server Exception]:', err);
      return res.status(500).json({
        success: false,
        error: "Erreur interne lors de la vérification du paiement PayPal."
      });
    }
  }

  // ─── 3. Webhook Officiel PayPal Sécurisé ───────────────────────────────────────
  // Déclenche l'activation Pro UNIQUEMENT après validation cryptographique et confirmation de paiement réel
  if (req.method === 'POST' && action === 'webhook') {
    try {
      const event = req.body || {};
      const eventType = String(event.event_type || '').toUpperCase();
      console.log(`[PayPal Webhook] 📩 Événement reçu : ${eventType}`);

      // 3.A. Validation Cryptographique de la Signature PayPal
      const signatureCheck = await verifyPayPalWebhookSignature(req, req.body);
      if (!signatureCheck.valid) {
        console.error('[PayPal Webhook] ⛔ Signature cryptographique rejetée :', signatureCheck.reason);
        return res.status(401).json({
          success: false,
          error: "Signature du webhook PayPal invalide ou non authentifiée.",
          details: signatureCheck.reason
        });
      }

      console.log('[PayPal Webhook] ✅ Signature cryptographique validée avec succès par PayPal API.');

      // 3.B. Gestion des événements de succès de paiement réel (Débit bancaire effectif)
      const isRealPaymentSuccess = (
        eventType === 'PAYMENT.SALE.COMPLETED' ||
        eventType === 'PAYMENT.CAPTURE.COMPLETED'
      );

      if (isRealPaymentSuccess) {
        const resource = event.resource || {};
        const orderId = resource.id || resource.supplementary_data?.related_ids?.order_id || `pp_${Date.now()}`;
        
        // Extraction de l'email PayPal
        const payerEmail = (
          resource.payer?.email_address ||
          resource.customer_email ||
          resource.custom_fields?.email ||
          resource.email ||
          event.payer_email ||
          ''
        ).trim().toLowerCase();

        const amountValue = resource.amount?.value ? Number(resource.amount.value) : 1.99;
        const currencyCode = resource.amount?.currency_code || 'USD';
        const payerName = resource.payer?.name?.given_name ? `${resource.payer.name.given_name} ${resource.payer.name.surname || ''}`.trim() : 'Cinéphile Pro';
        const detectedPlan = amountValue > 10 ? 'yearly' : 'monthly';

        const purchaseDesc = String(
          resource.purchase_units?.[0]?.description ||
          resource.purchase_units?.[0]?.items?.[0]?.name ||
          resource.custom_id ||
          ''
        ).toLowerCase();
        const isDonation = purchaseDesc.includes('don') || purchaseDesc.includes('soutien') || purchaseDesc.includes('tip');

        if (payerEmail) {
          console.log(`[PayPal Webhook] 👑 Activation du Pass Pro pour ${payerEmail} (Réf: ${orderId}, Montant: ${amountValue} ${currencyCode})`);
          await activateUserPassPro(payerEmail, {
            plan: isDonation ? 'donation' : detectedPlan,
            customerName: payerName,
            amount: amountValue,
            currency: currencyCode,
            gateway: 'paypal',
            paymentReference: orderId,
            subscriptionId: `sub_paypal_${orderId}`,
            isDonation
          });
        }
      }

      // 3.C. Gestion des échecs, rejets et insuffisances de solde
      const isPaymentFailure = (
        eventType === 'PAYMENT.SALE.DENIED' ||
        eventType === 'PAYMENT.CAPTURE.DENIED' ||
        eventType === 'PAYMENT.CAPTURE.DECLINED' ||
        eventType === 'PAYMENT.SALE.REVERSED' ||
        eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
      );

      if (isPaymentFailure) {
        const resource = event.resource || {};
        const failedEmail = (
          resource.payer?.email_address ||
          resource.customer_email ||
          event.payer_email ||
          ''
        ).trim().toLowerCase();

        console.warn(`[PayPal Webhook] ❌ Échec ou refus de prélèvement pour ${failedEmail || 'inconnu'} (${eventType})`);

        if (failedEmail && supabaseAdmin) {
          await supabaseAdmin
            .from('profiles')
            .update({ is_pro: false, updated_at: new Date().toISOString() })
            .ilike('email', failedEmail);

          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('email', failedEmail);
        }
      }

      return res.status(200).json({ success: true, received: true, eventType });
    } catch (whErr) {
      console.error('[PayPal Webhook Exception]:', whErr);
      return res.status(500).json({ success: false, error: 'Erreur interne traitement webhook PayPal' });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
