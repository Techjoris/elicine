import { createClient } from '@supabase/supabase-js';
import { sendProWelcomeEmail, sendDonationThankYouEmail } from './_email.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseAdmin = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * Handler Serverless Vercel pour /api/webhook
 * Traite les notifications de paiement (SasPay, PayPal, Moneroo, etc.)
 * Différencie les Abonnements Pro des Dons et envoie les emails automatiques via Resend
 */
export default async function handler(req, res) {
  // Entêtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

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

    console.log('WEBHOOK REÇU:', JSON.stringify(req.body, null, 2));

    // 1. Vérification de l'événement et du statut de succès
    const rawStatus = String(
      body?.status || 
      body?.data?.status || 
      body?.event || 
      body?.event_type || 
      body?.type || 
      body?.data?.type ||
      body?.resource?.status || 
      body?.state ||
      'completed'
    ).toLowerCase().trim();

    const isSuccessEvent = (
      rawStatus === 'completed' ||
      rawStatus === 'success' ||
      rawStatus === 'successful' ||
      rawStatus === 'paid' ||
      rawStatus === 'succeeded' ||
      rawStatus === 'approved' ||
      rawStatus === 'active' ||
      rawStatus === 'payment.completed' ||
      rawStatus === 'payment.success' ||
      rawStatus === 'payment.succeeded' ||
      rawStatus === 'transaction.success' ||
      rawStatus === 'transaction.completed' ||
      rawStatus === 'charge.complete' ||
      rawStatus === 'payment_intent.succeeded' ||
      rawStatus === 'checkout.order.approved' ||
      rawStatus === 'payment.capture.completed'
    );

    // 2. Extraction et nettoyage de l'adresse email
    const rawEmail = 
      body?.email || 
      body?.data?.email || 
      body?.customer_email || 
      body?.customer?.email ||
      body?.data?.customer?.email ||
      body?.data?.customer_email ||
      body?.payer_email || 
      body?.payer?.email_address ||
      body?.resource?.payer?.email_address ||
      body?.metadata?.email ||
      body?.data?.metadata?.email ||
      body?.custom_fields?.email ||
      body?.user_email ||
      '';

    if (!rawEmail || typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
      console.warn('[Webhook Vercel] ⚠️ Email non trouvé dans le payload:', body);
      return res.status(400).json({ error: "Email de l'acheteur manquant ou invalide." });
    }

    const cleanEmail = rawEmail.trim().toLowerCase();

    // 3. Extraction du nom du client
    const customerName = 
      body?.customer_name || 
      body?.name || 
      body?.data?.customer_name || 
      body?.customer?.name ||
      body?.payer?.name?.given_name || 
      cleanEmail.split('@')[0] || 
      'Cinéphile';

    // 4. Extraction du montant, devise et référence
    const numericAmount = Number(
      body?.amount || 
      body?.data?.amount || 
      body?.value || 
      body?.resource?.amount?.value || 
      1.99
    );
    const currency = (
      body?.currency || 
      body?.data?.currency || 
      body?.resource?.amount?.currency_code || 
      'USD'
    ).toUpperCase();
    const paymentReference = 
      body?.reference || 
      body?.payment_reference || 
      body?.order_id || 
      body?.data?.reference || 
      body?.id || 
      body?.resource?.id || 
      `ref_${Date.now()}`;
    const plan = (
      body?.plan || 
      body?.data?.plan || 
      body?.metadata?.plan || 
      (numericAmount > 10 ? 'yearly' : 'monthly')
    );

    // 5. Distinction formelle : Abonnement Pro vs Don / Soutien
    const metadata = body?.metadata || body?.data?.metadata || body?.custom_fields || {};
    const rawType = String(
      metadata?.type || 
      body?.type || 
      body?.item_type || 
      body?.data?.type || 
      body?.data?.item_type || 
      metadata?.item_type || 
      body?.product_type || 
      ''
    ).toLowerCase().trim();

    const isDonation = (
      rawType === 'don' ||
      rawType === 'donation' ||
      rawType === 'tip' ||
      rawType === 'support' ||
      rawType === 'soutien' ||
      body?.is_donation === true ||
      metadata?.is_donation === true
    );

    const now = new Date().toISOString();

    // ==========================================
    // CAS 1 : DON / SOUTIEN (Pas de mode Pro)
    // ==========================================
    if (isDonation) {
      console.log(`[Webhook] Traitement Don/Soutien validé pour ${cleanEmail} (${numericAmount} ${currency})`);

      if (supabaseAdmin) {
        try {
          await supabaseAdmin.from('donations').insert({
            email: cleanEmail,
            amount: numericAmount,
            currency,
            payment_reference: paymentReference,
            created_at: now
          });
        } catch (_) {
          await supabaseAdmin.from('subscriptions').upsert({
            id: `don_${paymentReference}`,
            email: cleanEmail,
            customer_name: customerName,
            plan: 'donation',
            amount: numericAmount,
            currency,
            status: 'completed',
            payment_reference: paymentReference,
            created_at: now,
            updated_at: now
          }).catch(subErr => console.warn('[Webhook Don Warning]:', subErr?.message));
        }
      }

      // Envoi sécurisé et attendu de l'e-mail de remerciement via Resend
      try {
        console.log(`[Webhook Don] Envoi de l'e-mail de remerciement à ${cleanEmail}...`);
        const emailResult = await sendDonationThankYouEmail(cleanEmail, {
          customerName,
          amount: String(numericAmount)
        });
        console.log('E-mail de remerciement envoyé avec succès:', emailResult);
      } catch (error) {
        console.error('Erreur critique Resend lors du don:', error);
      }

      return res.status(200).json({
        success: true,
        type: 'donation',
        message: 'Don enregistré avec succès et email de remerciement envoyé.'
      });
    }

    // ==========================================
    // CAS 2 : ABONNEMENT PRO (Activation is_pro)
    // ==========================================
    console.log(`[Webhook] Activation Abonnement Pro pour ${cleanEmail} (Plan: ${plan})`);

    const expiresDate = new Date();
    if (plan === 'yearly') {
      expiresDate.setFullYear(expiresDate.getFullYear() + 1);
    } else {
      expiresDate.setDate(expiresDate.getDate() + 30);
    }
    const expiresAt = expiresDate.toISOString();

    if (supabaseAdmin) {
      // 1. Activation is_pro dans la table profiles
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          is_pro: true,
          updated_at: now
        })
        .eq('email', cleanEmail);

      if (profileError) {
        console.error('[Webhook Supabase Profile Error]:', profileError);
      } else {
        console.log(`[Webhook Supabase] Profil ${cleanEmail} mis à jour : is_pro = true`);
      }

      // 2. Enregistrement ou mise à jour dans la table subscriptions
      await supabaseAdmin.from('subscriptions').upsert({
        id: `sub_${paymentReference}`,
        email: cleanEmail,
        customer_name: customerName,
        plan,
        amount: numericAmount,
        currency,
        status: 'active',
        payment_reference: paymentReference,
        terms_accepted: true,
        created_at: now,
        updated_at: now,
        expires_at: expiresAt
      }).catch(subErr => console.warn('[Webhook Subscriptions Upsert Warning]:', subErr?.message));
    }

    // 3. Envoi sécurisé et attendu de l'email de bienvenue Pro via Resend
    try {
      console.log(`[Webhook Pro] Envoi de l'email de bienvenue Pro à ${cleanEmail}...`);
      const emailResult = await sendProWelcomeEmail(cleanEmail, {
        customerName,
        plan
      });
      console.log('E-mail de bienvenue Pro envoyé avec succès:', emailResult);
    } catch (error) {
      console.error('Erreur critique Resend lors de l\'activation Pro:', error);
    }

    return res.status(200).json({
      success: true,
      type: 'subscription',
      isPro: true,
      message: 'Abonnement Pro activé avec succès et email de bienvenue envoyé.'
    });

  } catch (err) {
    console.error('[Webhook Internal Error]:', err);
    return res.status(500).json({
      error: 'Erreur interne du serveur lors du traitement du webhook.'
    });
  }
}
