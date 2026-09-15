import { activateUserPassPro } from '../../../api/_pro-activation.js';

function jsonResponse(data, status = 200) {
  if (typeof Response !== 'undefined' && Response.json) {
    return Response.json(data, { status });
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function POST(req) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    console.log('[Webhook Payment Route] Payload reçu :', JSON.stringify(body));

    // 1. Extraction et nettoyage de l'adresse email
    const rawEmail = 
      body?.email || 
      body?.data?.email || 
      body?.customer_email || 
      body?.payer_email || 
      body?.payer?.email_address ||
      body?.metadata?.email ||
      body?.data?.metadata?.email ||
      body?.customer?.email ||
      '';

    if (!rawEmail || typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
      return jsonResponse(
        { error: "Email de l'acheteur manquant ou invalide." },
        400
      );
    }

    const cleanEmail = rawEmail.trim().toLowerCase();

    // 2. Extraction du nom du client
    const customerName = 
      body?.customer_name || 
      body?.name || 
      body?.data?.customer_name || 
      body?.payer?.name?.given_name || 
      cleanEmail.split('@')[0] || 
      'Cinéphile';

    // 3. Extraction du montant, devise et référence
    const numericAmount = Number(
      body?.amount || 
      body?.data?.amount || 
      body?.value || 
      body?.resource?.amount?.value || 
      1.99
    );
    const currency = (
      body?.currency || 
      body?.data?.currency || 
      body?.resource?.amount?.currency_code || 
      'USD'
    ).toUpperCase();
    const paymentReference = 
      body?.reference || 
      body?.payment_reference || 
      body?.order_id || 
      body?.data?.reference || 
      body?.id || 
      body?.resource?.id || 
      `ref_${Date.now()}`;
    const plan = (
      body?.plan || 
      body?.data?.plan || 
      body?.metadata?.plan || 
      (numericAmount > 10 ? 'yearly' : 'monthly')
    );

    // 4. Distinction formelle : Abonnement Pro vs Don / Soutien
    const metadata = body?.metadata || body?.data?.metadata || body?.custom_fields || {};
    const rawType = String(
      metadata?.type || 
      body?.type || 
      body?.item_type || 
      body?.data?.type || 
      body?.data?.item_type || 
      metadata?.item_type || 
      body?.product_type || 
      ''
    ).toLowerCase().trim();

    const isDonation = (
      rawType === 'don' ||
      rawType === 'donation' ||
      rawType === 'tip' ||
      rawType === 'support' ||
      rawType === 'soutien' ||
      body?.is_donation === true ||
      metadata?.is_donation === true
    );

    // 5. Activation centralisée
    const activationResult = await activateUserPassPro(cleanEmail, {
      plan,
      customerName,
      amount: numericAmount,
      currency,
      gateway: body?.gateway || 'webhook',
      paymentReference,
      isDonation
    });

    return jsonResponse({
      success: true,
      type: isDonation ? 'donation' : 'subscription',
      isPro: !isDonation,
      activation: activationResult,
      message: isDonation
        ? 'Don enregistré avec succès et email de remerciement envoyé.'
        : 'Abonnement Pro activé avec succès et email de bienvenue envoyé.'
    }, 200);

  } catch (err) {
    console.error('[Webhook Route Internal Error]:', err);
    return jsonResponse(
      { error: 'Erreur interne du serveur lors du traitement du webhook.' },
      500
    );
  }
}
