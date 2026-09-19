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
import { 
  sendMovieAlertJMinus2Email, 
  sendMovieAlertReleaseDayEmail 
} from './_email.js';

const FOUNDER_EMAILS = [
  'ivanjoris959@gmail.com',
  'techjoris@gmail.com',
  'admin@elicine.app',
  'joris@elicine.app'
];

async function checkUserIsPro(email, userId) {
  const cleanEmail = (email || '').toLowerCase().trim();
  if (cleanEmail && FOUNDER_EMAILS.includes(cleanEmail)) {
    return true;
  }
  if (!supabaseAdmin) return true;

  try {
    let profQuery = supabaseAdmin.from('profiles').select('id, email, is_pro, role, expires_at');
    if (cleanEmail) profQuery = profQuery.ilike('email', cleanEmail);
    else if (userId) profQuery = profQuery.eq('id', userId);
    const { data: profile } = await profQuery.maybeSingle();

    if (profile) {
      if (profile.role === 'admin' || FOUNDER_EMAILS.includes((profile.email || '').toLowerCase())) return true;
      if (profile.is_pro === true || String(profile.is_pro) === 'true') {
        if (!profile.expires_at || new Date(profile.expires_at).getTime() > Date.now()) return true;
      }
    }

    let subQuery = supabaseAdmin.from('subscriptions').select('*').eq('status', 'active');
    if (cleanEmail) subQuery = subQuery.ilike('email', cleanEmail);
    else if (userId) subQuery = subQuery.eq('user_id', userId);
    const { data: subs } = await subQuery.order('created_at', { ascending: false }).limit(1);
    if (Array.isArray(subs) && subs.length > 0) {
      const sub = subs[0];
      if (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now()) return true;
    }
  } catch (_) {}

  return false;
}

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

  // ─── ACTION : Alertes de sorties cinématographiques (/api/movie-alerts) ────
  if (action === 'movie-alerts' || action === 'alerts') {
    if (req.method === 'GET') {
      if (!userId && !email) {
        return res.status(400).json({ error: 'userId ou email requis' });
      }
      try {
        if (supabaseAdmin) {
          let query = supabaseAdmin
            .from('user_movie_alerts')
            .select('*');
          if (userId) query = query.eq('user_id', userId);
          else if (email) query = query.ilike('email', email);
          const { data, error } = await query.order('created_at', { ascending: false });
          if (!error && data) {
            return res.status(200).json({ success: true, alerts: data });
          }
        }
      } catch (err) {
        console.warn('[Movie Alerts GET error]:', err?.message);
      }
      return res.status(200).json({ success: true, alerts: [] });
    }

    if (req.method === 'POST') {
      const userIsPro = await checkUserIsPro(email, userId);
      if (!userIsPro) {
        return res.status(403).json({
          success: false,
          requirePro: true,
          error: "La programmation d'alertes de sorties par email est strictement réservée aux abonnés Éliciné Pro."
        });
      }

      const movieId = Number(body.movieId || body.movie_id);
      const movieTitle = String(body.movieTitle || body.movie_title || body.title || 'Film');
      const releaseDate = body.releaseDate || body.release_date || null;
      const posterPath = body.posterPath || body.poster_path || null;
      const backdropPath = body.backdropPath || body.backdrop_path || null;
      const mediaType = body.mediaType || body.media_type || 'movie';
      const overview = body.overview || '';

      const alertItem = {
        id: `alt_${movieId}_${Date.now()}`,
        user_id: userId || null,
        email: email || null,
        movie_id: movieId,
        movie_title: movieTitle,
        release_date: releaseDate,
        poster_path: posterPath,
        backdrop_path: backdropPath,
        media_type: mediaType,
        overview,
        status: 'active',
        notified_j_minus_2: false,
        notified_release_day: false,
        created_at: new Date().toISOString()
      };

      if (supabaseAdmin) {
        try {
          await supabaseAdmin
            .from('user_movie_alerts')
            .upsert(alertItem, { onConflict: 'user_id,movie_id' });
        } catch (dbErr) {
          console.warn('[Movie Alerts POST db notice]:', dbErr?.message);
        }
      }

      return res.status(200).json({
        success: true,
        active: true,
        alert: alertItem
      });
    }

    if (req.method === 'DELETE') {
      const alertId = body.alertId || body.id || req.query?.alertId || req.query?.id;
      const movieId = body.movieId || body.movie_id || req.query?.movieId || req.query?.movie_id;

      if (supabaseAdmin) {
        try {
          let delQuery = supabaseAdmin.from('user_movie_alerts').delete();
          if (alertId) {
            delQuery = delQuery.eq('id', alertId);
          } else if (movieId && userId) {
            delQuery = delQuery.eq('user_id', userId).eq('movie_id', movieId);
          } else if (movieId && email) {
            delQuery = delQuery.ilike('email', email).eq('movie_id', movieId);
          }
          await delQuery;
        } catch (delErr) {
          console.warn('[Movie Alerts DELETE db notice]:', delErr?.message);
        }
      }

      return res.status(200).json({ success: true, message: 'Alerte supprimée avec succès.' });
    }

    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  // ─── ACTION : Cron Quotidien des Alertes Sorties Cinéma (09:00) ────────────
  if (action === 'movie-alerts-cron') {
    const authHeader = req.headers['authorization'] || '';
    const cronSecret = process.env.CRON_SECRET || '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers['x-cron-secret'] !== cronSecret) {
      console.warn('[Cron Movie Alerts] ⚠️ Requête sans secret strict.');
    }

    let processedCount = 0;
    let jMinus2Count = 0;
    let releaseDayCount = 0;

    if (supabaseAdmin) {
      try {
        const { data: alerts } = await supabaseAdmin
          .from('user_movie_alerts')
          .select('*')
          .eq('status', 'active');

        if (Array.isArray(alerts) && alerts.length > 0) {
          const today = new Date();

          for (const alert of alerts) {
            if (!alert.email || !alert.release_date) continue;
            processedCount++;

            const releaseTime = new Date(alert.release_date).getTime();
            const nowTime = today.getTime();
            const diffDays = Math.round((releaseTime - nowTime) / (1000 * 60 * 60 * 24));

            // Alerte J-2
            if (diffDays <= 2 && diffDays > 0 && !alert.notified_j_minus_2) {
              await sendMovieAlertJMinus2Email(alert.email, {
                customerName: alert.customer_name || 'Cinéphile',
                movieTitle: alert.movie_title,
                moviePoster: alert.poster_path,
                releaseDate: alert.release_date,
                movieId: alert.movie_id,
                mediaType: alert.media_type,
                overview: alert.overview
              });
              await supabaseAdmin
                .from('user_movie_alerts')
                .update({ notified_j_minus_2: true, updated_at: new Date().toISOString() })
                .eq('id', alert.id);
              jMinus2Count++;
            }

            // Alerte Jour J
            if (diffDays <= 0 && !alert.notified_release_day) {
              await sendMovieAlertReleaseDayEmail(alert.email, {
                customerName: alert.customer_name || 'Cinéphile',
                movieTitle: alert.movie_title,
                moviePoster: alert.poster_path,
                releaseDate: alert.release_date,
                movieId: alert.movie_id,
                mediaType: alert.media_type,
                overview: alert.overview
              });
              await supabaseAdmin
                .from('user_movie_alerts')
                .update({ notified_release_day: true, status: 'completed', updated_at: new Date().toISOString() })
                .eq('id', alert.id);
              releaseDayCount++;
            }
          }
        }
      } catch (cronErr) {
        console.error('[Cron Movie Alerts Exception]:', cronErr);
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      processed: processedCount,
      jMinus2Sent: jMinus2Count,
      releaseDaySent: releaseDayCount
    });
  }

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
            .select('id, email, is_pro, expires_at')
            .eq('id', userId)
            .maybeSingle();
          if (data) prof = data;
        }
        if (!prof && email) {
          const { data } = await supabaseAdmin
            .from('profiles')
            .select('id, email, is_pro, expires_at')
            .ilike('email', email.trim())
            .maybeSingle();
          if (data) prof = data;
        }

        if (prof && (prof.is_pro === true || String(prof.is_pro) === 'true')) {
          const effectiveExpiry = prof.expires_at;

          // 1. Vérification de dépassement de date d'expiration (Rétrogradation automatique au vol)
          if (effectiveExpiry && new Date(effectiveExpiry).getTime() < Date.now()) {
            console.log(`[API check-status] ⏱️ Expiration détectée pour ${prof.email} (${effectiveExpiry}). Rétrogradation automatique...`);
            await supabaseAdmin
              .from('profiles')
              .update({
                is_pro: false,
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
