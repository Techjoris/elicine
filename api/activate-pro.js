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

  const action = (req.query?.action || body.action || '').trim().toLowerCase();
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

  // ─── ACTION : Exécution de la tâche planifiée (Cron Subscriptions & Relances) ───
  if (action === 'cron' || action === 'cron-subscriptions') {
    const authHeader = req.headers['authorization'] || '';
    const cronSecret = process.env.CRON_SECRET || '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers['x-cron-secret'] !== cronSecret) {
      console.warn('[Cron Subscriptions] ⚠️ Requête sans secret strict.');
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
    const targetEmail = email || 'support@elicine.app';
    const customerName = (body.customerName || body.customer_name || body.name || targetEmail.split('@')[0] || 'Cinéphile').trim();
    const amount = Number(body.amount || body.value || 2);
    const currency = String(body.currency || 'USD').toUpperCase();
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
    if (!email && !userId) {
      return res.status(400).json({ success: false, isPro: false, error: "email ou userId requis" });
    }

    if (email === 'ivanjoris959@gmail.com') {
      return res.status(200).json({ 
        success: true, 
        isPro: true, 
        email, 
        plan: 'yearly', 
        role: 'admin',
        expiresAt: 'Illimité (Fondateur)',
        daysRemaining: 9999
      });
    }

    if (supabaseAdmin) {
      try {
        let prof = null;
        if (userId && isUuid(userId)) {
          const { data } = await supabaseAdmin
            .from('profiles')
            .select('id, email, is_pro, pass_status, expires_at, pro_expires_at, subscription_ends_at')
            .eq('id', userId)
            .maybeSingle();
          if (data) prof = data;
        }
        if (!prof && email) {
          const { data } = await supabaseAdmin
            .from('profiles')
            .select('id, email, is_pro, pass_status, expires_at, pro_expires_at, subscription_ends_at')
            .eq('email', email)
            .maybeSingle();
          if (data) prof = data;
        }

        if (prof && (prof.is_pro === true || String(prof.is_pro) === 'true')) {
          const effectiveExpiry = prof.expires_at || prof.pro_expires_at || prof.subscription_ends_at;

          // 1. Vérification de dépassement de date d'expiration (Rétrogradation automatique au vol)
          if (effectiveExpiry && new Date(effectiveExpiry).getTime() < Date.now()) {
            console.log(`[API check-status] ⏱️ Expiration détectée pour ${prof.email} (${effectiveExpiry}). Rétrogradation automatique...`);
            await supabaseAdmin
              .from('profiles')
              .update({
                is_pro: false,
                pass_status: 'free',
                updated_at: new Date().toISOString()
              })
              .eq('id', prof.id);

            return res.status(200).json({
              success: true,
              isPro: false,
              isExpired: true,
              expiresAt: effectiveExpiry,
              daysRemaining: 0,
              email: prof.email || email,
              source: 'profiles'
            });
          }

          const daysRemaining = effectiveExpiry 
            ? Math.max(1, Math.ceil((new Date(effectiveExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : null;

          return res.status(200).json({
            success: true,
            isPro: true,
            email: prof.email || email,
            expiresAt: effectiveExpiry || null,
            daysRemaining,
            source: 'profiles'
          });
        }

        // Repli secondaire dans subscriptions
        let sub = null;
        if (email) {
          const { data } = await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('email', email)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) sub = data;
        }
        if (!sub && userId) {
          const { data } = await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) sub = data;
        }

        if (sub) {
          if (sub.expires_at && new Date(sub.expires_at).getTime() < Date.now()) {
            await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', sub.id);

            return res.status(200).json({
              success: true,
              isPro: false,
              isExpired: true,
              expiresAt: sub.expires_at,
              daysRemaining: 0,
              email: sub.email || email,
              source: 'subscriptions'
            });
          }

          const daysRemaining = sub.expires_at 
            ? Math.max(1, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : null;

          return res.status(200).json({
            success: true,
            isPro: true,
            email: sub.email || email,
            plan: sub.plan || 'monthly',
            expiresAt: sub.expires_at || null,
            daysRemaining,
            source: 'subscriptions'
          });
        }
      } catch (err) {
        console.warn('[API /api/activate-pro check-status] Erreur:', err?.message);
      }
    }

    return res.status(200).json({ success: true, isPro: false, email });
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
