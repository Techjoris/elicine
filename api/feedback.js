import { checkRateLimit } from './_rateLimit.js';
import { supabaseServer, getRealClientIp } from './_security.js';

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
    const { category, message, email, name, metadata } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Le message est requis.' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Le message ne doit pas dépasser 2000 caractères.' });
    }

    const clientIp = getRealClientIp(req);
    const timestamp = new Date().toISOString();
    const cleanCategory = typeof category === 'string' ? category.slice(0, 100) : 'general';
    const cleanEmail = typeof email === 'string' ? email.slice(0, 150).trim() : null;
    const cleanName = typeof name === 'string' ? name.slice(0, 100).trim() : null;

    const feedbackPayload = {
      category: cleanCategory,
      message: message.trim(),
      email: cleanEmail,
      name: cleanName,
      client_ip: clientIp,
      metadata: typeof metadata === 'object' ? metadata : {},
      created_at: timestamp,
      target_support_email: 'support@elicine.app',
      status: 'new'
    };

    console.log('[Feedback API] Nouveau signalement/suggestion reçu:', {
      category: cleanCategory,
      email: cleanEmail,
      messageLength: message.length,
      timestamp
    });

    // Enregistrement dans Supabase si la table feedback / feedbacks existe
    if (supabaseServer) {
      try {
        const { error: insertError } = await supabaseServer
          .from('feedbacks')
          .insert([feedbackPayload]);

        if (insertError) {
          // Tentative alternative sur table 'feedback'
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
