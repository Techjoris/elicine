/**
 * API Serverless & Cron Job : Suivi et alertes e-mails des sorties cinématographiques Éliciné
 * Strictement réservé aux utilisateurs disposant d'un Pass Pro actif.
 * 
 * Actions :
 * - GET /api/movie-alerts?action=cron : Cron quotidien analysant les sorties (J-2 et Jour J)
 * - GET /api/movie-alerts?userId=... : Liste des alertes actives de l'utilisateur
 * - POST /api/movie-alerts : Création d'une alerte (Vérification Pass Pro obligatoire)
 * - DELETE /api/movie-alerts : Suppression / Désactivation d'une alerte
 */

import { createClient } from '@supabase/supabase-js';
import { 
  sendMovieAlertJMinus2Email, 
  sendMovieAlertReleaseDayEmail 
} from './_email.js';

// Configuration Supabase Serverless
const supabaseUrl = 
  process.env.VITE_SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

const supabaseKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  '';

const supabaseAdmin = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

const MASTER_ADMIN_EMAILS = [
  'ivanjoris959@gmail.com',
  'techjoris@gmail.com',
  'admin@elicine.app',
  'joris@elicine.app'
];

/**
 * Vérifie si un utilisateur possède un Pass Pro actif et non expiré au moment de la requête ou de l'envoi
 */
async function verifyUserActiveProStatus(userId, email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  
  // 1. Fondateurs & Master Admin toujours illimités
  if (cleanEmail && MASTER_ADMIN_EMAILS.includes(cleanEmail)) {
    return { isPro: true, reason: 'master_admin' };
  }

  if (!supabaseAdmin) {
    // Si Supabase indisponible en environnement local, repli permissif pour test
    return { isPro: true, reason: 'fallback_offline' };
  }

  try {
    // 2. Vérification dans public.profiles
    let profQuery = supabaseAdmin.from('profiles').select('id, email, is_pro, role, expires_at');
    if (cleanEmail) {
      profQuery = profQuery.ilike('email', cleanEmail);
    } else if (userId) {
      profQuery = profQuery.eq('id', userId);
    }
    const { data: profile } = await profQuery.maybeSingle();

    if (profile) {
      if (profile.role === 'admin' || MASTER_ADMIN_EMAILS.includes((profile.email || '').toLowerCase())) {
        return { isPro: true, reason: 'admin_role' };
      }

      if (profile.is_pro === true || String(profile.is_pro) === 'true') {
        if (profile.expires_at) {
          const expTime = new Date(profile.expires_at).getTime();
          if (expTime > Date.now()) {
            return { isPro: true, expiresAt: profile.expires_at };
          }
        } else {
          return { isPro: true, expiresAt: 'permanent' };
        }
      }
    }

    // 3. Vérification dans public.subscriptions
    let subQuery = supabaseAdmin.from('subscriptions').select('*').eq('status', 'active');
    if (cleanEmail) {
      subQuery = subQuery.ilike('email', cleanEmail);
    } else if (userId) {
      subQuery = subQuery.eq('user_id', userId);
    }
    const { data: subscriptions } = await subQuery.order('created_at', { ascending: false }).limit(1);

    if (Array.isArray(subscriptions) && subscriptions.length > 0) {
      const sub = subscriptions[0];
      if (sub.expires_at) {
        const expTime = new Date(sub.expires_at).getTime();
        if (expTime > Date.now()) {
          return { isPro: true, expiresAt: sub.expires_at };
        }
      } else {
        return { isPro: true, expiresAt: 'active_subscription' };
      }
    }
  } catch (err) {
    console.warn('[MovieAlerts] Erreur vérification Pro Supabase:', err);
  }

  return { isPro: false, reason: 'not_pro_or_expired' };
}

export default async function handler(req, res) {
  // En-têtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query.action || req.body?.action || '';

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CRON JOB QUOTIDIEN : ANALYSE DES SORTIES & ENVOI D'EMAILS J-2 ET JOUR J
  // ═══════════════════════════════════════════════════════════════════════════
  if (action === 'cron' || req.headers['x-vercel-cron']) {
    // Calcul des dates au format ISO (YYYY-MM-DD)
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const in2DaysStr = in2Days.toISOString().split('T')[0];

    console.log(`[MovieAlerts Cron] Exécution de l'analyse : Aujourd'hui = ${todayStr} | J-2 = ${in2DaysStr}`);

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase client non configuré pour le cron.' });
    }

    try {
      let sentJMinus2Count = 0;
      let sentDayJCount = 0;
      let skippedNonProCount = 0;
      const errors = [];

      // A. Alertes J-2 : release_date = in2DaysStr ET notified_j_minus_2 = false
      const { data: jMinus2Alerts, error: j2Err } = await supabaseAdmin
        .from('user_movie_alerts')
        .select('*')
        .eq('release_date', in2DaysStr)
        .eq('notified_j_minus_2', false);

      if (j2Err) {
        console.error('[MovieAlerts Cron] Erreur requête J-2:', j2Err);
      } else if (Array.isArray(jMinus2Alerts) && jMinus2Alerts.length > 0) {
        console.log(`[MovieAlerts Cron] ${jMinus2Alerts.length} alerte(s) J-2 identifiée(s) pour le ${in2DaysStr}`);

        for (const alert of jMinus2Alerts) {
          // Vérification systématique du Pass Pro actif au moment de l'envoi
          const proCheck = await verifyUserActiveProStatus(alert.user_id, alert.email);
          if (!proCheck.isPro) {
            console.log(`[MovieAlerts Cron] E-mail J-2 ignoré pour ${alert.email} : Pass Pro expiré ou inactif.`);
            skippedNonProCount++;
            continue;
          }

          try {
            const emailRes = await sendMovieAlertJMinus2Email(alert.email, {
              customerName: alert.email.split('@')[0],
              movieTitle: alert.movie_title,
              moviePoster: alert.poster_path,
              releaseDate: alert.release_date,
              movieId: alert.movie_id,
              mediaType: alert.media_type || 'movie',
              overview: alert.overview || ''
            });

            if (emailRes.success) {
              sentJMinus2Count++;
              // Marquer comme envoyé
              await supabaseAdmin
                .from('user_movie_alerts')
                .update({ notified_j_minus_2: true, updated_at: new Date().toISOString() })
                .eq('id', alert.id);
            } else {
              errors.push({ alertId: alert.id, type: 'j_minus_2', error: emailRes.error });
            }
          } catch (e) {
            console.error(`[MovieAlerts Cron] Exception envoi J-2 à ${alert.email}:`, e);
            errors.push({ alertId: alert.id, type: 'j_minus_2', error: e.message });
          }
        }
      }

      // B. Alertes Jour J : release_date = todayStr ET notified_release_day = false
      const { data: dayJAlerts, error: dayJErr } = await supabaseAdmin
        .from('user_movie_alerts')
        .select('*')
        .eq('release_date', todayStr)
        .eq('notified_release_day', false);

      if (dayJErr) {
        console.error('[MovieAlerts Cron] Erreur requête Jour J:', dayJErr);
      } else if (Array.isArray(dayJAlerts) && dayJAlerts.length > 0) {
        console.log(`[MovieAlerts Cron] ${dayJAlerts.length} alerte(s) Jour J identifiée(s) pour aujourd'hui (${todayStr})`);

        for (const alert of dayJAlerts) {
          // Vérification systématique du Pass Pro actif au moment de l'envoi
          const proCheck = await verifyUserActiveProStatus(alert.user_id, alert.email);
          if (!proCheck.isPro) {
            console.log(`[MovieAlerts Cron] E-mail Jour J ignoré pour ${alert.email} : Pass Pro expiré ou inactif.`);
            skippedNonProCount++;
            continue;
          }

          try {
            const emailRes = await sendMovieAlertReleaseDayEmail(alert.email, {
              customerName: alert.email.split('@')[0],
              movieTitle: alert.movie_title,
              moviePoster: alert.poster_path,
              releaseDate: alert.release_date,
              movieId: alert.movie_id,
              mediaType: alert.media_type || 'movie',
              overview: alert.overview || ''
            });

            if (emailRes.success) {
              sentDayJCount++;
              // Marquer comme envoyé
              await supabaseAdmin
                .from('user_movie_alerts')
                .update({ notified_release_day: true, updated_at: new Date().toISOString() })
                .eq('id', alert.id);
            } else {
              errors.push({ alertId: alert.id, type: 'release_day', error: emailRes.error });
            }
          } catch (e) {
            console.error(`[MovieAlerts Cron] Exception envoi Jour J à ${alert.email}:`, e);
            errors.push({ alertId: alert.id, type: 'release_day', error: e.message });
          }
        }
      }

      return res.status(200).json({
        success: true,
        date: todayStr,
        jMinus2Target: in2DaysStr,
        results: {
          sentJMinus2Count,
          sentDayJCount,
          skippedNonProCount,
          errorsCount: errors.length
        },
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (cronErr) {
      console.error('[MovieAlerts Cron Error]:', cronErr);
      return res.status(500).json({ error: 'Erreur exécution cron alertes sorties.', details: cronErr.message });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. GET : RÉCUPÉRATION DES ALERTES ACTIVES DE L'UTILISATEUR
  // ═══════════════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const userId = (req.query.userId || '').trim();
    const email = (req.query.email || '').toLowerCase().trim();

    if (!userId && !email) {
      return res.status(400).json({ error: 'userId ou email requis.' });
    }

    if (!supabaseAdmin) {
      return res.status(200).json({ success: true, alerts: [] });
    }

    try {
      let query = supabaseAdmin.from('user_movie_alerts').select('*');
      if (userId && email) {
        query = query.or(`user_id.eq.${userId},email.ilike.${email}`);
      } else if (userId) {
        query = query.eq('user_id', userId);
      } else {
        query = query.ilike('email', email);
      }

      const { data: alerts, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      return res.status(200).json({
        success: true,
        alerts: alerts || []
      });
    } catch (err) {
      console.warn('[MovieAlerts GET Error]:', err);
      return res.status(500).json({ error: 'Erreur lors de la récupération des alertes.' });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. POST : CRÉATION D'UNE ALERTE (RÉSERVÉE STRICTEMENT AUX MEMBRES PASS PRO)
  // ═══════════════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    try {
      const { 
        userId, 
        email, 
        movieId, 
        movieTitle, 
        posterPath, 
        backdropPath, 
        releaseDate, 
        mediaType, 
        overview 
      } = req.body || {};

      if (!movieId || !movieTitle || (!userId && !email)) {
        return res.status(400).json({ error: 'Champs obligatoires manquants (movieId, movieTitle, userId/email).' });
      }

      const cleanEmail = (email || '').toLowerCase().trim();

      // 🛡️ CONDITION D'ACCÈS OBLIGATOIRE : VÉRIFICATION DU PASS PRO ACTIF
      const proCheck = await verifyUserActiveProStatus(userId, cleanEmail);
      if (!proCheck.isPro) {
        return res.status(403).json({
          success: false,
          requirePro: true,
          error: "Le suivi et les notifications de sortie par e-mail sont réservés aux membres disposant d'un Pass Pro actif."
        });
      }

      if (!supabaseAdmin) {
        return res.status(200).json({
          success: true,
          offline: true,
          alert: {
            id: 'alt_' + Date.now(),
            user_id: userId || 'local',
            email: cleanEmail,
            movie_id: movieId,
            movie_title: movieTitle,
            poster_path: posterPath,
            release_date: releaseDate,
            media_type: mediaType || 'movie'
          }
        });
      }

      // Insertion ou mise à jour sécurisée dans user_movie_alerts
      const alertPayload = {
        user_id: userId || cleanEmail,
        email: cleanEmail,
        movie_id: Number(movieId),
        movie_title: movieTitle,
        poster_path: posterPath || null,
        backdrop_path: backdropPath || null,
        release_date: releaseDate || null,
        media_type: mediaType || 'movie',
        overview: overview || null,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from('user_movie_alerts')
        .upsert(alertPayload, { onConflict: 'user_id,movie_id' })
        .select()
        .single();

      if (error) {
        console.error('[MovieAlerts POST Supabase Error]:', error);
        throw error;
      }

      return res.status(200).json({
        success: true,
        message: `Alerte de sortie activée avec succès pour « ${movieTitle} ».`,
        alert: data
      });
    } catch (err) {
      console.error('[MovieAlerts POST Error]:', err);
      return res.status(500).json({ error: "Erreur lors de l'enregistrement de l'alerte." });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. DELETE : SUPPRESSION D'UNE ALERTE
  // ═══════════════════════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    try {
      const alertId = (req.body?.alertId || req.query.alertId || '').trim();
      const userId = (req.body?.userId || req.query.userId || '').trim();
      const movieId = req.body?.movieId || req.query.movieId;
      const email = (req.body?.email || req.query.email || '').toLowerCase().trim();

      if (!supabaseAdmin) {
        return res.status(200).json({ success: true, offline: true });
      }

      let deleteQuery = supabaseAdmin.from('user_movie_alerts').delete();

      if (alertId) {
        deleteQuery = deleteQuery.eq('id', alertId);
      } else if (movieId && (userId || email)) {
        deleteQuery = deleteQuery.eq('movie_id', Number(movieId));
        if (userId) deleteQuery = deleteQuery.eq('user_id', userId);
        if (email) deleteQuery = deleteQuery.ilike('email', email);
      } else {
        return res.status(400).json({ error: 'Identifiant d\'alerte ou (userId/email + movieId) requis.' });
      }

      const { error } = await deleteQuery;
      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Alerte de sortie supprimée avec succès.'
      });
    } catch (err) {
      console.error('[MovieAlerts DELETE Error]:', err);
      return res.status(500).json({ error: "Erreur lors de la suppression de l'alerte." });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
