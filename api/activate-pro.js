/**
 * Endpoint API Serverless : /api/activate-pro
 * Active instantanément le Pass Pro d'un utilisateur dans Supabase et déclenche l'envoi de l'e-mail Resend
 */
import { activateUserPassPro } from './_pro-activation.js';

export default async function handler(req, res) {
  // En-têtes CORS universels
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extraction des paramètres du corps ou de la query
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = {};
    }
  }
  body = body || {};

  const email = (
    body.email || 
    body.customer_email || 
    body.customerEmail || 
    req.query?.email || 
    ''
  ).trim().toLowerCase();

  const userId = (
    body.userId || 
    body.user_id || 
    req.query?.userId || 
    req.query?.user_id || 
    ''
  ).trim();

  const plan = (
    body.plan || 
    req.query?.plan || 
    'monthly'
  ).trim().toLowerCase();

  const customerName = (
    body.customerName || 
    body.customer_name || 
    body.name || 
    req.query?.name || 
    ''
  ).trim();

  const phone = (
    body.phone || 
    req.query?.phone || 
    ''
  ).trim();

  const amount = Number(
    body.amount || 
    req.query?.amount || 
    (plan === 'yearly' ? 15.99 : 1.99)
  );

  const currency = (
    body.currency || 
    req.query?.currency || 
    'USD'
  ).trim().toUpperCase();

  const gateway = (
    body.gateway || 
    body.provider || 
    body.payment_method || 
    req.query?.gateway || 
    'saspay'
  ).trim().toLowerCase();

  const paymentReference = (
    body.paymentReference || 
    body.payment_reference || 
    body.reference || 
    body.ref || 
    body.order_id || 
    req.query?.reference || 
    req.query?.ref || 
    ''
  ).trim();

  const subscriptionId = (
    body.subscriptionId || 
    body.subscription_id || 
    body.id || 
    req.query?.subscription_id || 
    req.query?.id || 
    ''
  ).trim();

  const isDonation = (
    body.isDonation === true || 
    body.is_donation === true || 
    plan === 'donation' || 
    req.query?.donation === 'true'
  );

  if (!email || !email.includes('@')) {
    return res.status(400).json({
      success: false,
      error: "Une adresse e-mail valide est obligatoire pour activer le Pass Pro."
    });
  }

  // Traitement direct du compte administrateur fondateur
  if (email === 'ivanjoris959@gmail.com') {
    return res.status(200).json({
      success: true,
      isPro: true,
      email,
      plan: 'yearly',
      expiresAt: 'Illimité (Fondateur)',
      subscriptionId: subscriptionId || 'sub_founder_admin',
      message: 'Compte Administrateur Principal activé avec privilèges illimités.'
    });
  }

  try {
    const result = await activateUserPassPro(email, {
      userId,
      customerName,
      phone,
      plan,
      amount,
      currency,
      gateway,
      paymentReference,
      subscriptionId,
      isDonation
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "Échec de l'activation du Pass Pro."
      });
    }

    return res.status(200).json({
      success: true,
      isPro: result.isPro,
      email: result.email,
      plan: result.plan,
      expiresAt: result.expiresAt,
      subscriptionId: result.subscriptionId,
      dbUpdated: result.dbUpdated,
      emailSent: result.emailSent,
      message: 'Pass Pro activé avec succès dans Supabase et e-mail de confirmation envoyé.'
    });
  } catch (error) {
    console.error('[API /api/activate-pro] Erreur inattendue:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Erreur serveur lors de l'activation du Pass Pro."
    });
  }
}
