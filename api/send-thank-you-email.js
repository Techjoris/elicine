import { activateUserPassPro } from './_pro-activation.js';

/**
 * Route API Serverless Vercel: /api/send-thank-you-email
 * Déclenchement direct et immédiat de l'e-mail de remerciement post-don ou post-paiement
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

    console.log('[Direct Thank You API] Requête reçue :', JSON.stringify(body, null, 2));

    const emailCandidates = [
      body.email,
      body.customerEmail,
      body.customer_email,
      body.payer_email,
      body.donorEmail,
      body.donor_email,
      body.data?.email,
      body.data?.customer_email,
      body.data?.object?.customer_email,
      body.metadata?.email,
      body.user_email
    ];

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    let foundEmail = null;

    for (const c of emailCandidates) {
      if (typeof c === 'string') {
        const clean = c.trim().toLowerCase();
        if (emailRegex.test(clean)) {
          foundEmail = clean;
          break;
        }
      }
    }

    if (!foundEmail) {
      try {
        const str = JSON.stringify(body);
        const matches = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        if (matches && matches.length > 0) {
          foundEmail = matches[0].toLowerCase().trim();
        }
      } catch (_) {}
    }

    const email = foundEmail || 'support@elicine.app';
    if (!foundEmail) {
      console.warn('[Direct Thank You API] ⚠️ Aucun email trouvé, utilisation du fallback support@elicine.app');
    }

    const customerName = (
      body.customerName ||
      body.customer_name ||
      body.name ||
      body.donorName ||
      email.split('@')[0] ||
      'Cinéphile'
    ).trim();

    const amount = Number(
      body.amount ||
      body.value ||
      body.numericAmount ||
      2
    );

    const currency = String(
      body.currency ||
      body.currencyCode ||
      'USD'
    ).toUpperCase();

    const reference = body.reference || body.paymentReference || body.orderId || `dir_${Date.now()}`;
    const isPro = body.isPro === true || body.type === 'pro' || body.plan === 'yearly' || body.plan === 'monthly';

    // Activation unifiée et envoi Resend
    const activationResult = await activateUserPassPro(email, {
      plan: isPro ? (body.plan === 'yearly' ? 'yearly' : 'monthly') : 'donation',
      customerName,
      amount,
      currency,
      gateway: body.gateway || 'direct',
      paymentReference: reference,
      isDonation: !isPro
    });

    return res.status(200).json({
      success: true,
      message: isPro 
        ? 'Pass Pro activé avec succès et e-mail de bienvenue envoyé.' 
        : 'E-mail de remerciement envoyé avec succès via Resend.',
      email,
      customerName,
      amount,
      currency,
      activation: activationResult
    });

  } catch (error) {
    console.error('[Direct Thank You API Exception] Erreur :', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erreur interne lors de l\'envoi de l\'e-mail.'
    });
  }
}
