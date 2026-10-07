import { verifyAccountSession } from './_account-access.js';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { checkRateLimit } from './_rateLimit.js';
import { supabaseServer, getRealClientIp } from './_security.js';

// Configuration Supabase Serverless
const supabaseUrl = 
  process.env.VITE_SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

// Initialisation de Resend pour les feedbacks
const resendApiKey = (
  process.env.RESEND_API_KEY || 
  process.env.VITE_RESEND_API_KEY || 
  ''
).trim();

const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Traitement des feedbacks et signalements utilisateurs via Resend & Supabase
 */
async function handleFeedback(req, res) {
  // Rate limit: 10 soumissions par minute max par IP
  const limiter = checkRateLimit(req, res, { max: 10, windowMs: 60 * 1000 });
  if (!limiter.allowed) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. POST requis pour le feedback.' });
  }

  try {
    const { category, categoryLabel, message, email, name, metadata } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Le message est requis.' });
    }

    if (message.length > 2500) {
      return res.status(400).json({ error: 'Le message ne doit pas dépasser 2500 caractères.' });
    }

    const clientIp = getRealClientIp(req);
    const timestamp = new Date().toISOString();
    const cleanCategory = typeof category === 'string' ? category.slice(0, 100) : 'general';
    const displayCategory = typeof categoryLabel === 'string' && categoryLabel.trim().length > 0 
      ? categoryLabel 
      : cleanCategory;
    const cleanEmail = typeof email === 'string' && email.includes('@') ? email.slice(0, 150).trim() : null;
    const cleanName = typeof name === 'string' && name.trim().length > 0 ? name.slice(0, 100).trim() : 'Utilisateur Éliciné';

    const feedbackPayload = {
      category: cleanCategory,
      category_label: displayCategory,
      message: message.trim(),
      email: cleanEmail,
      name: cleanName,
      client_ip: clientIp,
      metadata: typeof metadata === 'object' ? metadata : {},
      created_at: timestamp,
      target_support_email: 'support@elicine.app',
      status: 'new'
    };

    console.log('[Feedback API] Nouveau signalement reçu:', {
      category: cleanCategory,
      displayCategory,
      email: cleanEmail,
      name: cleanName,
      messageLength: message.length,
      timestamp
    });

    const fromEmail = (
      process.env.RESEND_FROM_EMAIL || 
      process.env.RESEND_EMAIL || 
      'Éliciné <support@elicine.app>'
    ).trim();

    const targetAdminEmail = (
      process.env.ADMIN_EMAIL || 
      process.env.SUPPORT_EMAIL || 
      'support@elicine.app'
    ).trim();

    const emailSubject = `[Éliciné Support] ${displayCategory} - ${cleanName} (${cleanEmail || 'Sans email'})`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #070709; color: #e4e4e7; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #121214; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 28px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; background-color: #e50914; color: #ffffff; margin-bottom: 12px; }
    h2 { margin: 0 0 16px 0; font-size: 20px; color: #ffffff; }
    .meta { background-color: #18181b; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 20px; font-size: 13px; line-height: 1.6; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 6px; }
    .meta-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .label { color: #a1a1aa; font-weight: 600; }
    .value { color: #ffffff; font-weight: 500; }
    .message-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #f59e0b; margin-bottom: 8px; }
    .message-box { background-color: #18181b; border-left: 4px solid #e50914; border-radius: 0 12px 12px 0; padding: 16px; font-size: 14px; line-height: 1.6; color: #f4f4f5; white-space: pre-wrap; word-break: break-word; }
    .cta { text-align: center; margin: 24px 0 12px 0; }
    .btn { display: inline-block; background-color: #e50914; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 700; font-size: 13px; }
    .footer { text-align: center; font-size: 11px; color: #71717a; margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">Nouveau Retour Utilisateur</div>
    <h2>${displayCategory}</h2>
    
    <div class="meta">
      <div class="meta-row"><span class="label">Expéditeur :</span> <span class="value">${cleanName}</span></div>
      <div class="meta-row"><span class="label">E-mail :</span> <span class="value">${cleanEmail ? `<a href="mailto:${cleanEmail}" style="color: #38bdf8; text-decoration: none;">${cleanEmail}</a>` : 'Non communiqué'}</span></div>
      <div class="meta-row"><span class="label">Objet / Catégorie :</span> <span class="value">${displayCategory}</span></div>
      <div class="meta-row"><span class="label">Date :</span> <span class="value">${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</span></div>
      ${metadata?.isPro ? `<div class="meta-row"><span class="label">Statut compte :</span> <span class="value" style="color: #fbbf24;">👑 Abonné Éliciné Pro</span></div>` : ''}
      ${metadata?.url ? `<div class="meta-row"><span class="label">Page source :</span> <span class="value" style="font-size: 11px; color: #a1a1aa;">${metadata.url}</span></div>` : ''}
    </div>

    <div class="message-title">Contenu du message :</div>
    <div class="message-box">${message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

    ${cleanEmail ? `
    <div class="cta">
      <a href="mailto:${cleanEmail}?subject=Re:%20Votre%20message%20sur%20Éliciné%20(${encodeURIComponent(displayCategory)})" class="btn">Répondre directement à ${cleanName} ↗</a>
    </div>
    ` : ''}

    <div class="footer">
      Centre de support Éliciné — Notification automatique acheminée vers ${targetAdminEmail}
    </div>
  </div>
</body>
</html>
    `.trim();

    if (resend) {
      try {
        const sendResponse = await resend.emails.send({
          from: fromEmail,
          to: [targetAdminEmail],
          replyTo: cleanEmail || undefined,
          subject: emailSubject,
          html: htmlContent,
          text: `Nouveau message Éliciné:\nObjet: ${displayCategory}\nDe: ${cleanName} (${cleanEmail || 'Sans email'})\nDate: ${timestamp}\n\nMessage:\n${message.trim()}`
        });

        if (sendResponse.error) {
          console.error('[Feedback Resend Error]:', sendResponse.error);
        } else {
          console.log('[Feedback Resend Success] Email transmis avec succès à', targetAdminEmail, '(ID:', sendResponse.data?.id, ')');
        }
      } catch (emailErr) {
        console.error('[Feedback Resend Exception]:', emailErr);
      }
    } else if (resendApiKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [targetAdminEmail],
            reply_to: cleanEmail || undefined,
            subject: emailSubject,
            html: htmlContent
          })
        });
      } catch (restErr) {
        console.error('[Feedback Resend REST Exception]:', restErr);
      }
    } else {
      console.warn('[Feedback API] RESEND_API_KEY non configurée.');
    }

    if (supabaseServer) {
      try {
        const { error: insertError } = await supabaseServer
          .from('feedbacks')
          .insert([feedbackPayload]);

        if (insertError) {
          await supabaseServer
            .from('feedback')
            .insert([feedbackPayload]);
        }
      } catch (dbErr) {
        console.warn('[Feedback API] Erreur écriture BD (non-bloquant):', dbErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Merci ! Votre retour a bien été transmis directement à notre équipe technique à l'adresse support@elicine.app. Nous vous répondrons sous 24h.",
      receivedAt: timestamp
    });
  } catch (error) {
    console.error('[Feedback API] Erreur interne:', error);
    return res.status(500).json({
      error: "Une erreur est survenue lors de l'enregistrement de votre retour."
    });
  }
}

/**
 * Point d'entrée consolidé pour la console d'administration et les retours utilisateurs
 * Routes : /api/admin, /api/admin/users, /api/feedback
 */
function checked(result) {
  if (result.error) throw new Error('DATABASE_ERROR');
  return result.data;
}

export function createAdminHandler(db = supabaseAdmin) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(200).end();
    const action = req.query?.action || req.body?.action || '';
    if (action === 'feedback' || req.url?.split('?')[0].endsWith('/feedback')) return handleFeedback(req, res);

    const access = await verifyAccountSession(req, db);
    if (!access.isAuthenticated) return res.status(401).json({ error: 'Connectez-vous avec un compte administrateur.' });
    if (!access.isAdmin) return res.status(403).json({ error: 'Accès administrateur refusé.' });

    try {
      if (req.method === 'GET') {
        const profiles = checked(await db.from('profiles').select('*').limit(200)) || [];
        const users = profiles.map(p => ({
          id: p.id, email: p.email || '', name: p.full_name || p.name || p.email?.split('@')[0] || 'Utilisateur',
          username: p.username || p.email?.split('@')[0], avatar: p.avatar_url || undefined,
          role: p.is_admin === true ? 'admin' : 'user', is_admin: p.is_admin === true,
          isPro: p.is_pro === true && (!p.expires_at || Date.parse(p.expires_at) > Date.now()),
          proPlanExpiresAt: p.expires_at || null, referralCode: p.referral_code || '',
          createdAt: p.created_at || '', moviesInListCount: p.movies_count || 0, aiQueriesCount: p.queries_count || 0
        }));
        const premiumSubscribers = users.filter(u => u.isPro).length;
        return res.status(200).json({ success: true, users, metrics: {
          totalUsers: users.length, premiumSubscribers, freeUsers: users.length - premiumSubscribers,
          totalSearches: users.reduce((n, u) => n + u.aiQueriesCount, 0),
          totalSavedMovies: users.reduce((n, u) => n + u.moviesInListCount, 0),
          conversionRate: users.length ? (100 * premiumSubscribers / users.length).toFixed(1) + '%' : '0%'
        } });
      }
      if (!['PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Méthode non autorisée.' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if ('role' in body || 'is_admin' in body || 'isAdmin' in body) {
        return res.status(400).json({ error: 'Les droits administrateur se définissent exclusivement dans Supabase.' });
      }
      const id = typeof body.userId === 'string' ? body.userId.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!id && !email) return res.status(400).json({ error: 'Compte cible requis.' });
      if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({ error: 'Identifiant de compte invalide.' });
      }
      let query = db.from('profiles').select('id, email, is_admin');
      query = id ? query.eq('id', id) : query.eq('email', email);
      const target = checked(await query.maybeSingle());
      if (!target) return res.status(404).json({ error: 'Compte introuvable.' });
      if (email && target.email?.toLowerCase() !== email) return res.status(400).json({ error: 'Compte cible incohérent.' });

      if (req.method === 'PATCH') {
        if (typeof body.isPro !== 'boolean') return res.status(400).json({ error: 'Statut Pro invalide.' });
        checked(await db.from('profiles').update({ is_pro: body.isPro, expires_at: null, updated_at: new Date().toISOString() }).eq('id', target.id));
        return res.status(200).json({ success: true, updated: { userId: target.id, isPro: body.isPro } });
      }
      if (target.is_admin === true) return res.status(403).json({ error: 'Un compte administrateur ne peut pas être supprimé ici.' });
      checked(await db.auth.admin.deleteUser(target.id));
      checked(await db.from('profiles').delete().eq('id', target.id));
      return res.status(200).json({ success: true, deleted: { userId: target.id } });
    } catch {
      return res.status(503).json({ error: 'Opération administrateur indisponible. Réessayez plus tard.' });
    }
  };
}

export default createAdminHandler();
