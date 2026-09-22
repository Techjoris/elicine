import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { emailConfigured, parisDate, dueMilestone, releaseEmailPayload, sendReleaseEmail, readReleaseEmail } from './_release-email.js';

function database() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  return key && url ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
function checked(result) { if (result.error) throw new Error(`DATABASE_${result.error.code || 'ERROR'}`); return result.data; }

/** Owner accounts are Pro everywhere else in the product; the alert API must agree. */
const FOUNDER_EMAILS = ['ivanjoris959@gmail.com', 'techjoris@gmail.com', 'admin@elicine.app', 'joris@elicine.app'];

export async function hasPro(db, user, now = new Date()) {
  const email = String(user?.email || '').toLowerCase().trim();
  if (FOUNDER_EMAILS.includes(email)) return true;
  const columns = 'is_pro, expires_at';
  let profile = checked(await db.from('profiles').select(columns).eq('id', user.id).maybeSingle());
  if (!profile && email) profile = checked(await db.from('profiles').select(columns).ilike('email', email).maybeSingle());
  if (profile?.is_pro === true && (!profile.expires_at || Date.parse(profile.expires_at) > now.getTime())) return true;
  // A project without the subscriptions table must not turn alert activation into a server error
  // for the accounts whose profile already carries the entitlement.
  try {
    const subs = checked(await db.from('subscriptions').select('expires_at').eq('user_id', user.id).eq('status', 'active'));
    return (subs || []).some(s => s.expires_at && Date.parse(s.expires_at) > now.getTime());
  } catch (error) {
    console.warn('[Release alerts] subscriptions lookup unavailable:', error.message);
    return false;
  }
}
async function authenticate(db, req) {
  const token = /^Bearer (.+)$/.exec(req.headers?.authorization || '')?.[1];
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data?.user;
}
async function releaseDetails(movieId, mediaType) {
  const key = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
  if (!key) throw new Error('TMDB_NOT_CONFIGURED');
  const params = new URLSearchParams({ api_key: key, language: 'fr-FR' });
  const response = await fetch(`https://api.themoviedb.org/3/${mediaType}/${movieId}?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('TMDB_UNAVAILABLE');
  const item = await response.json();
  return { movie_title: item.title || item.name, release_date: item.release_date || item.first_air_date,
    poster_path: item.poster_path, backdrop_path: item.backdrop_path, overview: item.overview || '' };
}

export async function handleReleaseAlerts(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!/^Bearer .+/.test(req.headers?.authorization || '')) return res.status(401).json({ error: 'Connectez-vous pour gérer vos alertes.' });
  const db = database();
  if (!db) return res.status(503).json({ error: 'Les alertes sont temporairement indisponibles.' });
  try {
    const user = await authenticate(db, req);
    if (!user) return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (req.method === 'GET') {
      const alerts = checked(await db.from('user_movie_alerts').select('*').eq('user_id', user.id).eq('status', 'active').order('release_date'));
      return res.status(200).json({ success: true, alerts });
    }
    // Cancellation remains available after Pro expires.
    if (req.method === 'DELETE') {
      if (!/^[0-9a-f-]{36}$/i.test(body.alertId || '')) return res.status(400).json({ error: 'Identifiant d’alerte requis.' });
      checked(await db.from('user_movie_alerts').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', body.alertId).eq('user_id', user.id));
      return res.status(200).json({ success: true });
    }
    if (!await hasPro(db, user)) return res.status(403).json({ requirePro: true, error: 'Les alertes sont réservées aux membres Eliciné Pro.' });
    if (!user.email || !user.email_confirmed_at) return res.status(422).json({ error: 'Confirmez votre adresse e-mail avant d’activer une alerte.' });
    if (!emailConfigured()) return res.status(503).json({ error: 'Les e-mails sont temporairement indisponibles. Aucune alerte n’a été activée.' });
    const movieId = Number(body.movieId);
    const mediaType = body.mediaType;
    if (!Number.isSafeInteger(movieId) || movieId <= 0 || !['movie', 'tv'].includes(mediaType)) return res.status(400).json({ error: 'Titre invalide.' });
    const details = await releaseDetails(movieId, mediaType);
    if (!details.release_date || details.release_date <= parisDate()) return res.status(400).json({ error: 'Ce titre n’a pas de sortie future confirmée.' });
    const alert = checked(await db.rpc('subscribe_release_alert', { p_user_id: user.id, p_email: user.email, p_movie_id: movieId, p_media_type: mediaType, p_details: details }));
    return res.status(200).json({ success: true, active: true, alert });
  } catch (error) {
    console.error('[Release alerts]', error.message?.startsWith('DATABASE_') ? error.message : 'REQUEST_FAILED');
    return res.status(503).json({ error: 'Impossible d’enregistrer les alertes. Réessayez plus tard.' });
  }
}

export async function processReleaseAlerts(db, { now = new Date(), onlyAlertIds, deadline = Date.now() + 230000 } = {}) {
  const counts = { accepted: 0, delivered: 0, failed: 0, unknown: 0, skipped: 0, deferred: 0 };
  let pendingQuery = db.from('release_email_deliveries').select('*').eq('status', 'accepted').order('updated_at').limit(100);
  if (onlyAlertIds) pendingQuery = pendingQuery.in('alert_id', onlyAlertIds);
  for (const delivery of checked(await pendingQuery) || []) {
    try {
      const result = await readReleaseEmail(delivery.provider_id);
      const status = ['delivered', 'opened', 'clicked'].includes(result.last_event) ? 'delivered' : ['failed', 'bounced', 'complained', 'suppressed'].includes(result.last_event) ? 'failed' : 'accepted';
      checked(await db.from('release_email_deliveries').update({ status, provider_status: result.last_event, updated_at: new Date().toISOString() }).eq('id', delivery.id));
      if (status === 'delivered') counts.delivered++;
      if (status === 'failed') counts.failed++;
    } catch { console.warn('[Release email] Delivery verification unavailable', delivery.id); }
    await new Promise(resolve => setTimeout(resolve, 550));
  }
  const dates = [parisDate(now), parisDate(new Date(now.getTime() + 2 * 86400000))];
  let lastId = null;
  while (Date.now() < deadline) {
    let query = db.from('user_movie_alerts').select('*').eq('status', 'active').in('release_date', dates).order('id').limit(50);
    if (onlyAlertIds) query = query.in('id', onlyAlertIds);
    if (lastId) query = query.gt('id', lastId);
    const alerts = checked(await query);
    for (const alert of alerts || []) {
      if (Date.now() >= deadline) { counts.deferred++; break; }
      lastId = alert.id;
      try {
        const milestone = dueMilestone(alert.release_date, now);
        if (!milestone || !await hasPro(db, { id: alert.user_id, email: alert.email }, now)) { counts.skipped++; continue; }
        const { data: auth, error: authError } = await db.auth.admin.getUserById(alert.user_id);
        if (authError || !auth.user?.email_confirmed_at || !auth.user.email) { counts.skipped++; continue; }
        const latest = await releaseDetails(alert.movie_id, alert.media_type);
        if (latest.release_date !== alert.release_date) {
          checked(await db.from('user_movie_alerts').update({ release_date: latest.release_date || null, updated_at: new Date().toISOString() }).eq('id', alert.id));
          counts.skipped++; continue;
        }
        const payload = releaseEmailPayload(alert, milestone, auth.user.email);
        const claim = checked(await db.rpc('claim_release_email', { p_alert_id: alert.id, p_milestone: milestone, p_delivery_id: randomUUID(), p_payload: payload }));
        // A milestone already claimed (or claimed concurrently) must never trigger a second send.
        if (!claim?.id || !claim.payload) { counts.skipped++; continue; }
        try {
          const result = await sendReleaseEmail(claim.payload, claim.id);
          checked(await db.from('release_email_deliveries').update({ status: 'accepted', provider_id: result.id, provider_status: 'accepted', updated_at: new Date().toISOString() }).eq('id', claim.id));
          checked(await db.from('user_movie_alerts').update({ [milestone === 'j_minus_2' ? 'notified_j_minus_2' : 'notified_release_day']: true, updated_at: new Date().toISOString() }).eq('id', alert.id));
          counts.accepted++;
          console.info('[Release email]', JSON.stringify({ deliveryId: claim.id, milestone, status: 'accepted', providerId: result.id }));
        } catch (error) {
          // Preserve ambiguous attempts permanently: never send again after Resend's 24h idempotency window.
          checked(await db.from('release_email_deliveries').update({ status: 'unknown', error_code: /^RESEND_/.test(error.message) ? error.message : 'SEND_OUTCOME_UNKNOWN', updated_at: new Date().toISOString() }).eq('id', claim.id));
          counts.unknown++;
          console.error('[Release email]', JSON.stringify({ deliveryId: claim.id, milestone, status: 'unknown' }));
        }
        await new Promise(resolve => setTimeout(resolve, 550));
      } catch { counts.failed++; console.error('[Release email] Processing failed', alert.id); }
    }
    if (!alerts?.length || alerts.length < 50 || counts.deferred) break;
  }
  if (Date.now() >= deadline) counts.deferred++;
  return counts;
}

// Under a platform time limit shorter than 230s (e.g. Vercel Hobby: 60s), the cron must stop
// before it is killed so every unprocessed alert is safely picked up by the next run.
function executionBudgetMs() {
  const configured = Number(process.env.RELEASE_ALERT_BUDGET_MS);
  return Number.isFinite(configured) && configured >= 5000 ? configured : 230000;
}

export async function handleReleaseCron(req, res) {
  if (!process.env.CRON_SECRET || req.headers?.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const db = database();
  if (!db || !emailConfigured()) return res.status(503).json({ error: 'ALERTS_NOT_CONFIGURED' });
  try {
    const counts = await processReleaseAlerts(db, { deadline: Date.now() + executionBudgetMs() });
    const success = !counts.failed && !counts.unknown && !counts.deferred;
    console.info('[Release cron]', JSON.stringify(counts));
    return res.status(success ? 200 : 502).json({ success, ...counts });
  } catch (error) {
    console.error('[Release cron]', error.message?.startsWith('DATABASE_') ? error.message : 'CRON_FAILED');
    return res.status(503).json({ success: false, error: 'CRON_FAILED' });
  }
}
