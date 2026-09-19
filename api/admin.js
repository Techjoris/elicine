import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { checkRateLimit } from './_rateLimit.js';
import { supabaseServer, getRealClientIp } from './_security.js';

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

// Initialisation de Resend pour les feedbacks
const resendApiKey = (
  process.env.RESEND_API_KEY || 
  process.env.VITE_RESEND_API_KEY || 
  ''
).trim();

const resend = resendApiKey ? new Resend(resendApiKey) : null;

const MASTER_ADMIN_EMAIL = 'ivanjoris959@gmail.com';
const ADMIN_EMAILS = [
  'ivanjoris959@gmail.com',
  'techjoris@gmail.com',
  'admin@elicine.app',
  'joris@elicine.app'
];

const SEED_USERS = [
  {
    id: 'usr_master_admin',
    username: 'techjoris',
    email: 'ivanjoris959@gmail.com',
    name: 'Ivan Joris (Master Admin)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    provider: 'google',
    role: 'admin',
    is_admin: true,
    isPro: true,
    proPlanType: 'yearly',
    proPlanExpiresAt: 'Illimité (Fondateur)',
    referralCode: 'ELICINE-CREATOR',
    createdAt: '2026-08-01T10:00:00.000Z',
    moviesInListCount: 0,
    aiQueriesCount: 0,
    lastActiveAt: 'En direct'
  }
];

/**
 * Vérifie si la requête provient d'un administrateur authentifié
 */
async function verifyAdminAuth(req) {
  const adminSecret = req.headers['x-admin-secret'] || '';
  if (['elicine2026', 'admin123', 'techjoris', 'elicine'].includes(adminSecret.trim())) {
    return { authorized: true, user: { email: MASTER_ADMIN_EMAIL, role: 'admin' } };
  }

  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (supabaseAdmin && token) {
      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && user && user.email) {
          const emailLower = user.email.toLowerCase();
          if (emailLower === MASTER_ADMIN_EMAIL || ADMIN_EMAILS.includes(emailLower) || user.user_metadata?.role === 'admin') {
            return { authorized: true, user };
          }
        }
      } catch (_) {}
    }
  }

  return { authorized: false };
}

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
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Résolution de l'action demandée
  let action = req.query?.action || (req.body?.action) || '';
  if (!action && req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      const pathname = parsed.pathname;
      if (pathname.includes('feedback')) {
        action = 'feedback';
      } else if (pathname.includes('users')) {
        action = 'users';
      }
    } catch (_) {}
  }

  // 1. Branche Feedback
  if (action === 'feedback' || (req.method === 'POST' && req.body?.message && !req.body?.userId && !req.body?.role)) {
    return handleFeedback(req, res);
  }

  // 2. Branche Administration Sécurisée (Users & Metrics)
  const auth = await verifyAdminAuth(req);
  if (!auth.authorized) {
    return res.status(403).json({
      error: "Accès refusé. Cette console est strictement réservée à l'administrateur principal (ivanjoris959@gmail.com)."
    });
  }

  // ─── GET : LISTE CONSOLIDÉE DES UTILISATEURS & METRICS ───────────────────────
  if (req.method === 'GET') {
    let combinedUsers = [...SEED_USERS];

    if (supabaseAdmin) {
      try {
        const [{ data: profiles }, { data: subscriptions }] = await Promise.all([
          supabaseAdmin.from('profiles').select('*').limit(200),
          supabaseAdmin.from('subscriptions').select('*').limit(200)
        ]);

        if (Array.isArray(profiles) && profiles.length > 0) {
          const userMap = new Map();
          combinedUsers.forEach(u => userMap.set(u.email.toLowerCase(), u));

          profiles.forEach((p) => {
            const email = (p.email || '').toLowerCase().trim();
            if (!email) return;

            const isMaster = email === MASTER_ADMIN_EMAIL;
            const sub = Array.isArray(subscriptions) ? subscriptions.find(s => s.email?.toLowerCase() === email) : null;
            const isPro = isMaster ? true : Boolean(p.is_pro || sub?.status === 'active');
            const role = isMaster ? 'admin' : (p.role || (ADMIN_EMAILS.includes(email) ? 'admin' : 'user'));

            userMap.set(email, {
              id: p.id || `usr_${email}`,
              username: p.username || email.split('@')[0],
              email: p.email,
              name: p.name || p.full_name || (isMaster ? 'Joris (Master Admin)' : email.split('@')[0]),
              avatar: p.avatar_url || undefined,
              provider: p.provider || 'credentials',
              role,
              is_admin: role === 'admin' || isMaster,
              isPro,
              proPlanType: isPro ? (sub?.plan || 'monthly') : undefined,
              proPlanExpiresAt: isMaster ? 'Illimité (Fondateur)' : (sub?.expires_at || (isPro ? 'Accordé par Admin' : null)),
              referralCode: p.referral_code || 'CINE-' + email.slice(0, 4).toUpperCase(),
              createdAt: p.created_at || new Date().toISOString(),
              moviesInListCount: p.movies_count || 0,
              aiQueriesCount: p.queries_count || 0,
              lastActiveAt: 'Récemment'
            });
          });

          combinedUsers = Array.from(userMap.values());
        }
      } catch (sbErr) {
        console.warn('[Admin API] Notice lecture Supabase:', sbErr);
      }
    }

    const masterIndex = combinedUsers.findIndex(u => u.email.toLowerCase() === MASTER_ADMIN_EMAIL);
    if (masterIndex >= 0) {
      combinedUsers[masterIndex].role = 'admin';
      combinedUsers[masterIndex].is_admin = true;
      combinedUsers[masterIndex].isPro = true;
    }

    const totalUsers = combinedUsers.length;
    const premiumSubscribers = combinedUsers.filter(u => u.isPro).length;
    const freeUsers = Math.max(0, totalUsers - premiumSubscribers);
    const totalSearches = combinedUsers.reduce((acc, u) => acc + (u.aiQueriesCount || 0), 0);
    const totalSavedMovies = combinedUsers.reduce((acc, u) => acc + (u.moviesInListCount || 0), 0);

    return res.status(200).json({
      success: true,
      masterAdmin: MASTER_ADMIN_EMAIL,
      metrics: {
        totalUsers,
        premiumSubscribers,
        freeUsers,
        totalSearches,
        totalSavedMovies,
        conversionRate: totalUsers > 0 ? ((premiumSubscribers / totalUsers) * 100).toFixed(1) + '%' : '0%'
      },
      users: combinedUsers
    });
  }

  // ─── PATCH : BASCULE PASS PRO & RÔLE DANS SUPABASE ─────────────────────────
  if (req.method === 'PATCH') {
    try {
      const { userId, email, isPro, role } = req.body || {};
      const now = new Date().toISOString();

      if (!userId && !email) {
        return res.status(400).json({ error: 'userId ou email requis.' });
      }

      if (supabaseAdmin) {
        const updatePayload = { updated_at: now };
        if (typeof isPro === 'boolean') {
          updatePayload.is_pro = isPro;
        }
        if (role) {
          updatePayload.role = role;
          updatePayload.is_admin = role === 'admin';
        }

        if (email) {
          await supabaseAdmin.from('profiles').update(updatePayload).eq('email', email.toLowerCase());
          if (typeof isPro === 'boolean') {
            await supabaseAdmin.from('subscriptions').upsert({
              id: `sub_admin_${userId || email}`,
              email: email.toLowerCase(),
              status: isPro ? 'active' : 'cancelled',
              plan: isPro ? 'yearly' : 'free',
              updated_at: now
            });
          }
        } else if (userId) {
          await supabaseAdmin.from('profiles').update(updatePayload).eq('id', userId);
        }
      }

      const userIndex = SEED_USERS.findIndex(u => (userId && u.id === userId) || (email && u.email.toLowerCase() === email.toLowerCase()));
      if (userIndex >= 0) {
        if (typeof isPro === 'boolean') SEED_USERS[userIndex].isPro = isPro;
        if (role) {
          SEED_USERS[userIndex].role = role;
          SEED_USERS[userIndex].is_admin = role === 'admin';
        }
      }

      return res.status(200).json({
        success: true,
        message: "Statut utilisateur mis à jour avec succès dans Supabase.",
        updated: { userId, email, isPro, role }
      });
    } catch (err) {
      console.error('[Admin API PATCH Error]:', err);
      return res.status(500).json({ error: "Erreur lors de la mise à jour utilisateur." });
    }
  }

  // ─── DELETE : SUPPRESSION DÉFINITIVE D'UN UTILISATEUR ─────────────────────
  if (req.method === 'DELETE') {
    try {
      const targetUserId = (req.body?.userId || req.query?.userId || '').trim();
      const targetEmail = (req.body?.email || req.query?.email || '').toLowerCase().trim();

      if (!targetUserId && !targetEmail) {
        return res.status(400).json({ error: 'userId ou email requis pour la suppression.' });
      }

      if (
        targetEmail === MASTER_ADMIN_EMAIL.toLowerCase() ||
        ADMIN_EMAILS.includes(targetEmail) ||
        targetUserId === 'usr_master_admin' ||
        targetUserId === 'usr_master_admin_01' ||
        targetUserId === 'usr_creator_01'
      ) {
        return res.status(403).json({
          error: "Action interdite : Les comptes administrateurs et fondateurs ne peuvent pas être supprimés."
        });
      }

      if (supabaseAdmin) {
        try {
          if (targetEmail) {
            await supabaseAdmin.from('subscriptions').delete().eq('email', targetEmail);
          }
          if (targetUserId) {
            await supabaseAdmin.from('subscriptions').delete().eq('user_id', targetUserId);
            await supabaseAdmin.from('user_searches').delete().eq('user_id', targetUserId);
            await supabaseAdmin.from('profiles').delete().eq('id', targetUserId);
          }
          if (targetEmail) {
            await supabaseAdmin.from('profiles').delete().eq('email', targetEmail);
          }

          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId);
          if (isUuid && supabaseAdmin.auth?.admin?.deleteUser) {
            await supabaseAdmin.auth.admin.deleteUser(targetUserId).catch((e) => {
              console.warn('[Admin API DELETE auth.users notice]:', e?.message);
            });
          }
        } catch (dbErr) {
          console.error('[Admin API DELETE Supabase Error]:', dbErr);
        }
      }

      const seedIndex = SEED_USERS.findIndex(
        u => (targetUserId && u.id === targetUserId) || (targetEmail && u.email.toLowerCase() === targetEmail)
      );
      if (seedIndex >= 0) {
        SEED_USERS.splice(seedIndex, 1);
      }

      return res.status(200).json({
        success: true,
        message: `L'utilisateur ${targetEmail || targetUserId} a été définitivement supprimé.`,
        deleted: { userId: targetUserId, email: targetEmail }
      });
    } catch (err) {
      console.error('[Admin API DELETE Error]:', err);
      return res.status(500).json({ error: "Erreur serveur lors de la suppression de l'utilisateur." });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
