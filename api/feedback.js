import { Resend } from 'resend';
import { checkRateLimit } from './_rateLimit.js';
import { supabaseServer, getRealClientIp } from './_security.js';

// Initialisation de Resend
const resendApiKey = (
  process.env.RESEND_API_KEY || 
  process.env.VITE_RESEND_API_KEY || 
  ''
).trim();

const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Endpoint API Serverless Vercel pour le traitement des feedbacks et signalements
 * Acheminement des messages directement vers support@elicine.app via Resend
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limit: 10 soumissions par minute max par IP
  const limiter = checkRateLimit(req, res, { max: 10, windowMs: 60 * 1000 });
  if (!limiter.allowed) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
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

    // 1. Acheminement immédiat de l'e-mail via Resend vers l'adresse pro
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
      // Fallback REST direct
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
      console.warn('[Feedback API] RESEND_API_KEY non configurée. Simulation de transmission email.');
    }

    // 2. Enregistrement dans Supabase si la table feedback / feedbacks existe
    if (supabaseServer) {
      try {
        const { error: insertError } = await supabaseServer
          .from('feedbacks')
          .insert([feedbackPayload]);

        if (insertError) {
          const { error: fallbackError } = await supabaseServer
            .from('feedback')
            .insert([feedbackPayload]);

          if (fallbackError) {
            console.warn('[Feedback API] Enregistrement Supabase ignoré (tables optionnelles):', insertError.message);
          }
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
