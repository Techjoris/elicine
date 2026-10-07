import { verifyServerSession } from './_security.js';
/**
 * Endpoint API Serverless : /api/activate-pro
 * Active instantanément le Pass Pro d'un utilisateur dans Supabase et déclenche l'envoi de l'e-mail Resend
 */
import { 
  activateUserPassPro, 
  supabaseAdmin, 
  isUuid,
  downgradeExpiredSubscriptions,
  processRenewalReminders 
} from './_pro-activation.js';
import { handleReleaseAlerts, handleReleaseCron } from './_release-alerts.js';

export default async function handler(req, res) {
  // En-têtes CORS universels
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

  let action = (req.query?.action || body.action || '').trim().toLowerCase();
  if (!action && req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      if (parsed.pathname.includes('movie-alerts')) {
        action = 'movie-alerts';
      }
    } catch (_) {}
  }

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

  if (action === 'movie-alerts' || action === 'alerts') return handleReleaseAlerts(req, res);
  if (action === 'movie-alerts-cron') return handleReleaseCron(req, res);

  // ─── ACTION : Exécution de la tâche planifiée (Cron Subscriptions & Relances) ───
  if (action === 'cron' || action === 'cron-subscriptions') {
    const authHeader = req.headers['authorization'] || '';
    const cronSecret = process.env.CRON_SECRET || '';
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}` && req.headers['x-cron-secret'] !== cronSecret) {
      return res.status(401).json({ error: 'Accès refusé.' });
    }

    try {
      const downgradeResult = await downgradeExpiredSubscriptions();
      const remindersResult = await processRenewalReminders();
      return res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        downgrades: downgradeResult,
        reminders: remindersResult
      });
    } catch (cronErr) {
      console.error('[Cron Subscriptions Exception]:', cronErr);
      return res.status(500).json({ success: false, error: cronErr?.message || 'Erreur interne cron' });
    }
  }

  // ─── ACTION : Envoi direct de l'e-mail de remerciement ou don (Thank You API) ───
  if (action === 'thank-you-email' || action === 'thank-you' || action === 'send-thank-you-email') {
    const secret = process.env.INTERNAL_ACTIVATION_SECRET || process.env.CRON_SECRET;
    if (!secret || req.headers?.authorization !== 'Bearer ' + secret) {
      return res.status(403).json({ success: false, error: 'Accès réservé au serveur de paiement.' });
    }
    const targetEmail = email || 'support@elicine.app';
    const customerName = (body.customerName || body.customer_name || body.name || targetEmail.split('@')[0] || 'Cinéphile').trim();
    const amount = Number(body.amount || body.value || 2);
    const rawCurr = body.currency || body.currencyCode;
    const currency = String(rawCurr || (amount >= 100 ? 'FCFA' : 'USD')).toUpperCase();
    const reference = body.reference || body.paymentReference || body.orderId || `dir_${Date.now()}`;
    const isPro = body.isPro === true || body.type === 'pro' || body.plan === 'yearly' || body.plan === 'monthly';

    const activationResult = await activateUserPassPro(targetEmail, {
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
      email: targetEmail,
      customerName,
      amount,
      currency,
      activation: activationResult
    });
  }

  // ─── ACTION : Vérification directe du statut Pro via Service Role (Bypasse RLS) ───
  if (req.method === 'GET' || action === 'check-status' || action === 'status') {
    const access = await verifyServerSession(req);
    if (!access.isAuthenticated) return res.status(401).json({ isPro: false, error: 'Session requise.' });
    return res.status(200).json({ success: true, isPro: access.isPro, expiresAt: access.expiresAt });
  }

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

  // ─── SÉCURITÉ STRICTE : Interdiction formelle de l'activation directe côté client ───
  const authHeader = req.headers['authorization'] || '';
  const internalSecret = process.env.INTERNAL_ACTIVATION_SECRET || process.env.CRON_SECRET || '';
  const isAuthorizedBackend = (
    (internalSecret && (authHeader === `Bearer ${internalSecret}` || req.headers['x-internal-secret'] === internalSecret)) ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY && authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`)
  );

  if (!isAuthorizedBackend) {
    console.warn(`[API /api/activate-pro] ⛔ Tentative d'activation directe client bloquée pour ${email}. Seuls les webhooks officiels sont autorisés.`);
    return res.status(403).json({
      success: false,
      error: "L'activation directe du Pass Pro côté client est strictement interdite. La validation dépend obligatoirement d'un prélèvement réel vérifié par webhook officiel."
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
