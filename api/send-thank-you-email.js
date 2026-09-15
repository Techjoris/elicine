import { sendDonationThankYouEmail, sendProWelcomeEmail } from './_email.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 
  process.env.VITE_SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

const supabaseAnonKey = 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY ||
  '';

const supabase = (supabaseUrl && supabaseAnonKey && supabaseAnonKey.length > 20)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Route API Serverless Vercel: /api/send-thank-you-email
 * Déclenchement direct et immédiat de l'e-mail de remerciement post-don ou post-paiement
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. POST requis.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        body = {};
      }
    }
    body = body || {};

    console.log('[Direct Thank You API] Requête reçue :', JSON.stringify(body, null, 2));

    const email = (
      body.email ||
      body.customerEmail ||
      body.customer_email ||
      body.payer_email ||
      body.donorEmail ||
      ''
    ).trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: "Adresse email du donateur manquante ou invalide."
      });
    }

    const customerName = (
      body.customerName ||
      body.customer_name ||
      body.name ||
      body.donorName ||
      email.split('@')[0] ||
      'Cinéphile'
    ).trim();

    const amount = String(
      body.amount ||
      body.value ||
      body.numericAmount ||
      '2'
    );

    const currency = String(
      body.currency ||
      body.currencyCode ||
      'USD'
    ).toUpperCase();

    const reference = body.reference || body.paymentReference || body.orderId || `dir_${Date.now()}`;
    const isPro = body.isPro === true || body.type === 'pro' || body.plan === 'yearly' || body.plan === 'monthly';

    // 1. Enregistrement optionnel dans Supabase
    if (supabase) {
      const now = new Date().toISOString();
      try {
        if (isPro) {
          await supabase.from('profiles').update({ is_pro: true, updated_at: now }).eq('email', email);
        } else {
          await supabase.from('donations').insert({
            email,
            amount: Number(amount) || 2,
            currency,
            payment_reference: reference,
            created_at: now
          }).catch(() => {});
        }
      } catch (sbErr) {
        console.warn('[Direct Thank You API] Notice Supabase:', sbErr?.message);
      }
    }

    // 2. Déclenchement de l'envoi de l'e-mail via Resend
    let emailResult;
    if (isPro) {
      console.log(`[Direct Thank You API] Envoi e-mail de bienvenue Pro à ${email}...`);
      emailResult = await sendProWelcomeEmail(email, {
        customerName,
        plan: body.plan || 'monthly'
      });
    } else {
      console.log(`[Direct Thank You API] Envoi e-mail de remerciement don à ${email} (Montant: ${amount} ${currency})...`);
      emailResult = await sendDonationThankYouEmail(email, {
        customerName,
        amount: `${amount} ${currency !== 'USD' ? currency : '$'}`
      });
    }

    console.log('[Direct Thank You API] Résultat Resend :', emailResult);

    return res.status(200).json({
      success: true,
      message: 'E-mail de remerciement envoyé avec succès via Resend.',
      email,
      customerName,
      amount,
      currency,
      emailResult
    });

  } catch (error) {
    console.error('Erreur critique Resend lors du don (Direct API):', error);
    return res.status(500).json({
      success: false,
      error: "Erreur interne lors de l'envoi du mail de remerciement.",
      details: error?.message || error
    });
  }
}
