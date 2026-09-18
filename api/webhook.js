import { activateUserPassPro } from './_pro-activation.js';

/**
 * Handler Serverless Vercel pour /api/webhook
 * Traite les notifications de paiement (SasPay, PayPal, Moneroo, etc.)
 * Différencie les Abonnements Pro des Dons et envoie les emails automatiques via Resend
 */
export default async function handler(req, res) {
  // Entêtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. POST requis.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        body = {};
      }
    }
    body = body || {};

    console.log('WEBHOOK REÇU:', JSON.stringify(req.body, null, 2));

    // Si événement PayPal officiel, délégation vers le handler cryptographique dédié
    if (body?.event_type || req.headers['paypal-auth-algo'] || req.headers['PAYPAL-AUTH-ALGO']) {
      const paypalHandler = (await import('./paypal.js')).default;
      req.query = { ...(req.query || {}), action: 'webhook' };
      return await paypalHandler(req, res);
    }
    const rawStatus = String(
      body?.status || 
      body?.data?.status || 
      body?.data?.object?.status ||
      body?.event || 
      body?.event_type || 
      body?.type || 
      body?.data?.type ||
      body?.resource?.status || 
      body?.state ||
      'completed'
    ).toLowerCase().trim();

    const isSuccessEvent = (
      rawStatus === 'completed' ||
      rawStatus === 'success' ||
      rawStatus === 'successful' ||
      rawStatus === 'paid' ||
      rawStatus === 'succeeded' ||
      rawStatus === 'approved' ||
      rawStatus === 'active' ||
      rawStatus === 'payment.completed' ||
      rawStatus === 'payment.success' ||
      rawStatus === 'payment.succeeded' ||
      rawStatus === 'transaction.success' ||
      rawStatus === 'transaction.completed' ||
      rawStatus === 'charge.complete' ||
      rawStatus === 'payment_intent.succeeded' ||
      rawStatus === 'checkout.order.approved' ||
      rawStatus === 'payment.capture.completed'
    );

    // 2. Extraction exhaustive et multi-chemins de l'adresse e-mail
    const emailCandidatePaths = [
      body?.email,
      body?.data?.email,
      body?.data?.object?.customer_email,
      body?.data?.object?.customer_details?.email,
      body?.data?.object?.billing_details?.email,
      body?.data?.object?.receipt_email,
      body?.data?.object?.metadata?.email,
      body?.data?.customer_email,
      body?.data?.customer?.email,
      body?.data?.attributes?.customer_email,
      body?.data?.attributes?.customer?.email,
      body?.data?.attributes?.email,
      body?.data?.payer?.email_address,
      body?.data?.metadata?.email,
      body?.customer_email,
      body?.customer?.email,
      body?.payer_email,
      body?.payer?.email_address,
      body?.resource?.payer?.email_address,
      body?.resource?.customer_email,
      body?.resource?.custom_fields?.email,
      body?.resource?.email,
      body?.payload?.email,
      body?.payload?.customer?.email,
      body?.payload?.customer_email,
      body?.payload?.payer_email,
      body?.metadata?.email,
      body?.metadata?.customer_email,
      body?.custom_fields?.email,
      body?.user_email,
      body?.donorEmail,
      body?.donor_email,
      body?.user?.email,
      body?.client?.email,
      body?.subscriber?.email
    ];

    let extractedEmail = '';
    for (const candidate of emailCandidatePaths) {
      if (typeof candidate === 'string' && candidate.trim().length > 3 && candidate.includes('@')) {
        extractedEmail = candidate.trim().toLowerCase();
        break;
      }
    }

    if (!extractedEmail) {
      console.warn('[Webhook Vercel] ⚠️ Email non trouvé dans le payload. Fallback sur support@elicine.app');
      extractedEmail = 'support@elicine.app';
    }

    const cleanEmail = extractedEmail;

    // 3. Extraction du nom du donateur ou client
    const customerNameCandidatePaths = [
      body?.customer_name,
      body?.name,
      body?.customer?.name,
      body?.customer?.full_name,
      body?.data?.customer_name,
      body?.data?.name,
      body?.data?.customer?.name,
      body?.data?.customer?.full_name,
      body?.data?.payer?.name?.given_name,
      body?.payer?.name?.given_name,
      body?.resource?.payer?.name?.given_name,
      body?.metadata?.customer_name,
      body?.metadata?.name
    ];

    let customerName = 'Cinéphile';
    for (const candidate of customerNameCandidatePaths) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        customerName = candidate.trim();
        break;
      }
    }

    // 4. Extraction du montant et de la devise
    const amountCandidatePaths = [
      body?.amount,
      body?.data?.amount,
      body?.data?.object?.amount,
      body?.data?.object?.amount_total,
      body?.data?.attributes?.amount,
      body?.resource?.amount?.value,
      body?.value,
      body?.total,
      body?.metadata?.amount
    ];

    let numericAmount = 2;
    for (const candidate of amountCandidatePaths) {
      if (candidate !== undefined && candidate !== null && !isNaN(Number(candidate))) {
        const parsed = Number(candidate);
        numericAmount = parsed > 100 && (body?.currency === 'EUR' || body?.currency === 'USD')
          ? parsed / 100 
          : parsed;
        break;
      }
    }

    const currencyCandidatePaths = [
      body?.currency,
      body?.data?.currency,
      body?.data?.object?.currency,
      body?.data?.attributes?.currency,
      body?.resource?.amount?.currency_code,
      body?.metadata?.currency
    ];

    let currency = 'USD';
    for (const candidate of currencyCandidatePaths) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        currency = candidate.trim().toUpperCase();
        break;
      }
    }

    // 5. Extraction de la référence de paiement
    const paymentReference = (
      body?.reference ||
      body?.payment_reference ||
      body?.order_id ||
      body?.data?.reference ||
      body?.data?.id ||
      body?.data?.object?.id ||
      body?.resource?.id ||
      body?.id ||
      `wh_${Date.now()}`
    ).toString();

    // 6. Détection de la passerelle de paiement
    const detectedGateway = (
      body?.gateway ||
      body?.provider ||
      body?.payment_provider ||
      (body?.event_type?.includes('PAYMENT.') || body?.resource ? 'paypal' : 'saspay')
    );

    // 7. Détection du type de paiement : Don vs Abonnement Pro
    const rawType = String(
      body?.type || 
      body?.data?.type || 
      body?.item_type || 
      body?.metadata?.type || 
      body?.plan || 
      body?.data?.plan ||
      body?.description ||
      body?.data?.description ||
      body?.resource?.purchase_units?.[0]?.description ||
      ''
    ).toLowerCase();

    const isDonation = (
      rawType.includes('don') ||
      rawType.includes('soutien') ||
      rawType.includes('tip') ||
      rawType.includes('gift') ||
      (numericAmount > 0 && numericAmount <= 5 && !rawType.includes('pro') && !rawType.includes('month') && !rawType.includes('year'))
    );

    const plan = isDonation 
      ? 'donation' 
      : (rawType.includes('year') || numericAmount >= 10 ? 'yearly' : 'monthly');

    // 8. Activation unifiée Supabase + Envoi Resend
    const activationResult = await activateUserPassPro(cleanEmail, {
      plan,
      customerName,
      amount: numericAmount,
      currency,
      gateway: detectedGateway,
      paymentReference,
      isDonation
    });

    return res.status(200).json({
      success: true,
      type: isDonation ? 'donation' : 'subscription',
      isPro: !isDonation,
      message: isDonation 
        ? 'Don enregistré avec succès et email de remerciement envoyé.' 
        : 'Abonnement Pro activé avec succès et email de bienvenue envoyé.',
      activation: activationResult
    });

  } catch (err) {
    console.error('[Webhook Internal Error]:', err);
    return res.status(500).json({
      error: 'Erreur interne du serveur lors du traitement du webhook.'
    });
  }
}
