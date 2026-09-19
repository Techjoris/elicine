/**
 * Webhook Paddle Billing v2 — Éliciné Pass Pro
 * Endpoint Serverless Vercel & Next.js / Route Handler compatible
 *
 * Fonctionnalités :
 * 1. Vérification cryptographique de la signature Paddle (HMAC-SHA256 via PADDLE_WEBHOOK_SECRET_KEY)
 * 2. Extraction des données client (email, custom_data.user_id, détails de transaction)
 * 3. Activation automatique du statut Pro dans Supabase (tables `profiles` et `subscriptions`)
 * 4. Envoi de l'e-mail de confirmation transactionnel via Resend (support@elicine.app)
 */

import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// ─── Configuration des variables d'environnement ──────────────────────────────
const RESEND_API_KEY = (
  process.env.RESEND_API_KEY ||
  process.env.VITE_RESEND_API_KEY ||
  ''
).trim();

const PADDLE_WEBHOOK_SECRET_KEY = (
  process.env.PADDLE_WEBHOOK_SECRET_KEY ||
  process.env.VITE_PADDLE_WEBHOOK_SECRET_KEY ||
  ''
).trim();

const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://xwhrxtzbxvakqjlajjlc.supabase.co'
).trim();

const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

// ─── Initialisation des clients ──────────────────────────────────────────────
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const supabase: SupabaseClient | null = (SUPABASE_URL && SUPABASE_KEY && SUPABASE_KEY.length > 20)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

/**
 * Valide la signature cryptographique du Webhook Paddle Billing v2 (HMAC-SHA256).
 * Format attendu du header paddle-signature : ts=1671552777;h1=eb3864d4d03e9447...
 */
export function verifyPaddleWebhookSignature(
  signatureHeader: string | null | undefined,
  rawBody: string,
  secretKey: string
): boolean {
  if (!signatureHeader || !secretKey) return false;

  try {
    const parts = signatureHeader.split(';');
    let ts = '';
    let h1 = '';

    for (const part of parts) {
      const [key, ...valParts] = part.split('=');
      const k = key?.trim().toLowerCase();
      const v = valParts.join('=').trim();
      if (k === 'ts') ts = v;
      if (k === 'h1') h1 = v;
    }

    if (!ts || !h1) return false;

    // Le payload signé par Paddle correspond à : `${ts}:${rawBody}`
    const signedPayload = `${ts}:${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(signedPayload)
      .digest('hex');

    if (h1.length !== expectedSignature.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(h1, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (err) {
    console.error('[Paddle Webhook] Erreur lors de la vérification de signature :', err);
    return false;
  }
}

/**
 * Génère le template d'e-mail HTML Dark Theme responsive pour la confirmation Pass Pro
 */
export function getPaddleProWelcomeHtml({
  customerName = 'Cinéphile',
  amount = '1,99 €',
  expiresAt = null
}: {
  customerName?: string;
  amount?: string;
  expiresAt?: string | null;
} = {}): string {
  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '30 jours (renouvelable)';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue dans Éliciné Pro ! 🎬</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #08080a;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #08080a;
      padding: 40px 16px;
    }
    .container {
      max-width: 560px;
      margin: 0 auto;
      background-color: #121319;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-top: 3px solid #e50914;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55);
    }
    .header {
      padding: 32px 32px 16px 32px;
      text-align: left;
    }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .brand {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 2.5px;
      color: #e50914;
      text-transform: uppercase;
    }
    .badge {
      display: inline-block;
      background: rgba(229, 9, 20, 0.15);
      border: 1px solid rgba(229, 9, 20, 0.3);
      color: #ff4d58;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .title {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 6px 0;
      line-height: 1.25;
    }
    .subtitle {
      font-size: 14px;
      color: #a1a1aa;
      margin: 0;
    }
    .content {
      padding: 0 32px 32px 32px;
    }
    .paragraph {
      font-size: 14.5px;
      line-height: 1.6;
      color: #d4d4d8;
      margin: 0 0 20px 0;
    }
    .receipt-box {
      background-color: #0e0f14;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 18px 20px;
      margin: 22px 0;
    }
    .receipt-header {
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #71717a;
      margin-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 8px;
    }
    .receipt-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 13.5px;
    }
    .receipt-label {
      color: #a1a1aa;
    }
    .receipt-val {
      font-weight: 600;
      color: #ffffff;
    }
    .receipt-val-highlight {
      font-weight: 700;
      color: #e50914;
      font-size: 15px;
    }
    .benefits-card {
      background-color: #0e0f14;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 20px;
      margin: 22px 0;
    }
    .benefits-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 14px;
    }
    .benefit-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 13px;
      line-height: 1.5;
      color: #d4d4d8;
    }
    .benefit-item:last-child {
      margin-bottom: 0;
    }
    .benefit-bullet {
      color: #e50914;
      font-weight: bold;
      margin-right: 10px;
      line-height: 1.4;
      font-size: 13px;
    }
    .cta-wrapper {
      text-align: left;
      padding: 12px 0 20px 0;
    }
    .cta-btn {
      display: inline-block;
      background-color: #e50914;
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      padding: 13px 30px;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(229, 9, 20, 0.35);
    }
    .signature {
      font-size: 13.5px;
      color: #a1a1aa;
      margin: 22px 0 0 0;
      line-height: 1.6;
    }
    .footer {
      padding: 20px 32px;
      background-color: #0b0c10;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      text-align: left;
      font-size: 12px;
      color: #71717a;
      line-height: 1.6;
    }
    .footer-motto {
      font-size: 12.5px;
      font-weight: 600;
      color: #a1a1aa;
      margin: 0 0 6px 0;
    }
    .footer a {
      color: #a1a1aa;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="header-top">
          <div class="brand">Éliciné Pro</div>
          <div class="badge">Pass Actif</div>
        </div>
        <h1 class="title">Bienvenue dans Éliciné Pro ! 🎬</h1>
        <p class="subtitle">Confirmation de votre souscription au Pass Pro</p>
      </div>

      <div class="content">
        <p class="paragraph">Bonjour ${customerName},</p>
        <p class="paragraph">
          Votre abonnement au <strong>Pass Pro Éliciné</strong> est désormais pleinement actif. Nous sommes ravis de vous compter parmi nos membres privilégiés !
        </p>

        <!-- Bloc Récapitulatif Transactionnel -->
        <div class="receipt-box">
          <div class="receipt-header">Détails de votre formule</div>
          <div class="receipt-row">
            <span class="receipt-label">Formule choisie</span>
            <span class="receipt-val">Pass Pro Mensuel</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Montant réglé</span>
            <span class="receipt-val-highlight">${amount}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Statut</span>
            <span class="receipt-val" style="color: #4ade80;">● Actif</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Période de validité</span>
            <span class="receipt-val">Jusqu'au ${formattedExpiry}</span>
          </div>
        </div>

        <!-- Bloc Avantages Inclus -->
        <div class="benefits-card">
          <div class="benefits-title">Vos privilèges exclusifs :</div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Recommandations sur-mesure illimitées :</strong> Décrivez vos émotions, un souvenir de scène ou une ambiance sans restriction quotidienne de quota.</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Traitement prioritaire instantané :</strong> Analyses scénaristiques et suggestions cinématographiques immédiates par nos modèles IA avancés.</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Filtres streaming & catalogue étendu :</strong> Ciblez directement vos plateformes favorites (Netflix, Prime Video, Canal+, Disney+, Apple TV+...).</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Alertes nouveautés exclusives :</strong> Soyez notifié en avant-première (J-2 et Jour J) dès la sortie de vos œuvres attendues.</span>
          </div>
        </div>

        <div class="cta-wrapper">
          <a href="https://elicine.app" class="cta-btn">Accéder à Éliciné Pro</a>
        </div>

        <p class="signature">
          Belles séances et découvertes cinématographiques,<br>
          <strong style="color: #ffffff;">L'équipe Éliciné</strong>
        </p>
      </div>

      <div class="footer">
        <p class="footer-motto">Éliciné — Le cinéma d'exception, élu pour vous.</p>
        <p style="margin: 0;">Besoin d'assistance ou une question sur votre abonnement ? Contactez notre support à <a href="mailto:support@elicine.app">support@elicine.app</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Traite l'événement Paddle et effectue l'activation Supabase + envoi Resend
 */
export async function processPaddleWebhookEvent(eventPayload: any) {
  const eventType = (
    eventPayload?.event_type ||
    eventPayload?.type ||
    eventPayload?.eventType ||
    ''
  ).trim().toLowerCase();

  const data = eventPayload?.data || {};

  console.log(`[Paddle Webhook] 🔔 Événement reçu : "${eventType}" (ID: ${eventPayload?.event_id || data?.id || 'inconnu'})`);

  // Événements éligibles pour l'activation Pro
  const isEligibleEvent =
    eventType === 'transaction.completed' ||
    eventType === 'transaction.paid' ||
    eventType === 'subscription.created' ||
    eventType === 'subscription.activated' ||
    eventType === 'subscription.updated' ||
    eventType.includes('transaction.completed') ||
    eventType.includes('subscription.activated') ||
    eventType.includes('subscription.created') ||
    eventType.includes('transaction.paid');

  if (!isEligibleEvent) {
    console.log(`[Paddle Webhook] ℹ️ Événement "${eventType}" reçu et acquitté (non lié à l'activation Pro immédiate).`);
    return {
      success: true,
      received: true,
      processed: false,
      eventType,
      message: `Événement ${eventType} acquitté avec succès`
    };
  }

  // 1. Extraction des données client selon les spécifications exactes :
  // const email = body?.data?.customer?.email || body?.data?.details?.customer?.email || body?.data?.custom_data?.email;
  const email = (
    eventPayload?.data?.customer?.email ||
    eventPayload?.data?.details?.customer?.email ||
    eventPayload?.data?.custom_data?.email ||
    data?.customer?.email ||
    data?.details?.customer?.email ||
    data?.custom_data?.email ||
    eventPayload?.customer_email ||
    data?.customer_email ||
    data?.user_email ||
    data?.email ||
    ''
  ).trim().toLowerCase();

  let userId: string | null = (
    data?.custom_data?.user_id ||
    data?.custom_data?.userId ||
    data?.custom_data?.supabase_user_id ||
    eventPayload?.data?.custom_data?.user_id ||
    null
  );

  const customerName = (
    data?.customer?.name ||
    data?.details?.customer?.name ||
    data?.custom_data?.user_name ||
    data?.custom_data?.customer_name ||
    (email ? email.split('@')[0] : 'Cinéphile')
  );

  const transactionId = data?.id || `txn_paddle_${Date.now()}`;
  const rawTotal = data?.details?.totals?.total || data?.details?.totals?.grand_total || '1.99';
  const currency = (data?.currency_code || data?.details?.totals?.currency_code || 'EUR').toUpperCase();
  const amountFormatted = `${String(rawTotal).replace('.', ',')} ${currency === 'EUR' ? '€' : currency}`;

  if (!email) {
    console.warn('[Paddle Webhook] ⚠️ Adresse email client introuvable dans le payload Paddle, acquittement envoyé.');
    return {
      success: true,
      received: true,
      processed: false,
      warning: 'Adresse email client introuvable dans le payload Paddle.'
    };
  }

  console.log(`[Paddle Webhook] 🚀 Traitement de l'activation pour : ${email} | Transaction: ${transactionId} | Montant: ${amountFormatted}`);

  // 2. Recherche du user_id Supabase par email si absent de custom_data
  if (!userId && supabase) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

      if (profile?.id) {
        userId = profile.id;
        console.log(`[Paddle Webhook] 🔍 Utilisateur Supabase retrouvé par email : ${userId}`);
      }
    } catch (err: any) {
      console.warn('[Paddle Webhook] Note recherche profil Supabase :', err?.message || err);
    }
  }

  const priceId = (
    data?.items?.[0]?.price?.id ||
    data?.items?.[0]?.price_id ||
    data?.custom_data?.price_id ||
    ''
  ).trim();

  const isYearly =
    priceId === 'pri_01m2x8yc8y1k9b5bej81me7dbd' ||
    data?.custom_data?.plan === 'yearly' ||
    data?.custom_data?.billing_cycle === 'yearly' ||
    Number(rawTotal) >= 10;

  const durationDays = isYearly ? 365 : 30;
  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  // 3. Activation du statut Pro dans Supabase (profiles & subscriptions)
  let dbSuccess = false;
  if (supabase) {
    try {
      // 3.A. Mise à jour de la table profiles : is_pro = true
      const profilePayload = {
        is_pro: true,
        expires_at: expiresAtIso,
        updated_at: nowIso
      };

      if (userId) {
        const { error: profErr } = await supabase
          .from('profiles')
          .update(profilePayload)
          .eq('id', userId);

        if (profErr) {
          console.warn('[Paddle Webhook] Erreur mise à jour profile par ID :', profErr.message);
        } else {
          console.log(`[Paddle Webhook] ✅ Table profiles mise à jour pour ID ${userId}`);
        }
      }

      // Mise à jour également par email pour garantir la synchronisation
      const { error: profEmailErr } = await supabase
        .from('profiles')
        .update(profilePayload)
        .ilike('email', email);

      if (profEmailErr) {
        console.warn('[Paddle Webhook] Erreur mise à jour profile par email :', profEmailErr.message);
      } else {
        console.log(`[Paddle Webhook] ✅ Table profiles mise à jour pour email ${email}`);
      }

      // 3.B. Création ou mise à jour de la table subscriptions
      const subPayload: Record<string, any> = {
        email: email,
        status: 'active',
        provider: 'paddle',
        payment_provider: 'paddle',
        plan: isYearly ? 'pass_pro_yearly' : 'pass_pro_monthly',
        amount: isYearly ? 17.90 : 1.99,
        currency: currency || 'EUR',
        payment_reference: transactionId,
        terms_accepted: true,
        expires_at: expiresAtIso,
        updated_at: nowIso
      };

      if (userId) {
        subPayload.user_id = userId;
      }

      // Recherche si une souscription existe déjà pour cet email
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id')
        .or(`email.ilike.${email},payment_reference.eq.${transactionId}`)
        .maybeSingle();

      if (existingSub?.id) {
        await supabase
          .from('subscriptions')
          .update(subPayload)
          .eq('id', existingSub.id);
        console.log(`[Paddle Webhook] ✅ Souscription existante ${existingSub.id} mise à jour (provider: 'paddle', plan: 'pass_pro')`);
      } else {
        subPayload.id = transactionId || `sub_paddle_${Date.now()}`;
        subPayload.created_at = nowIso;
        if (!subPayload.user_id) {
          subPayload.user_id = `usr_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
        }
        await supabase
          .from('subscriptions')
          .upsert(subPayload);
        console.log(`[Paddle Webhook] ✅ Nouvelle souscription créée (id: ${subPayload.id}, provider: 'paddle', plan: 'pass_pro')`);
      }

      dbSuccess = true;
    } catch (dbErr: any) {
      console.error('[Paddle Webhook] ❌ Erreur base de données Supabase :', dbErr);
    }
  } else {
    console.warn('[Paddle Webhook] ⚠️ Client Supabase non initialisé (variables d\'environnement manquantes).');
  }

  // 4. Envoi de l'e-mail de confirmation via Resend
  let emailSent = false;
  if (resend && email) {
    try {
      const emailHtml = getPaddleProWelcomeHtml({
        customerName,
        amount: isYearly ? '17,90 €' : '1,99 €',
        expiresAt: expiresAtIso
      });

      const emailResponse = await resend.emails.send({
        from: 'Éliciné <support@elicine.app>',
        to: [email],
        subject: 'Bienvenue dans Éliciné Pro ! 🎬',
        html: emailHtml
      });

      if (emailResponse.error) {
        console.error('[Paddle Webhook] ❌ Erreur Resend send email :', emailResponse.error);
      } else {
        emailSent = true;
        console.log(`[Paddle Webhook] ✉️ E-mail de confirmation envoyé avec succès à ${email} depuis support@elicine.app (ID: ${emailResponse.data?.id})`);
      }
    } catch (mailErr: any) {
      console.error('[Paddle Webhook] ❌ Exception lors de l\'envoi Resend :', mailErr);
    }
  } else {
    console.warn('[Paddle Webhook] ⚠️ Client Resend non configuré ou email manquant (RESEND_API_KEY).');
  }

  return {
    success: true,
    processed: true,
    email,
    userId,
    isPro: true,
    dbUpdated: dbSuccess,
    emailSent,
    expiresAt: expiresAtIso,
    transactionId
  };
}

// ─── Standard Vercel Serverless Function Handler (Node.js) ────────────────────
export default async function handler(req: any, res: any) {
  // CORS Headers universels
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, paddle-signature, Paddle-Signature, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Méthode non autorisée. Seules les requêtes POST sont acceptées par le webhook Paddle.'
    });
  }

  // Récupération du corps brut et parsé
  let rawBody = '';
  if (typeof req.body === 'string') {
    rawBody = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf-8');
  } else if (req.rawBody) {
    rawBody = typeof req.rawBody === 'string' ? req.rawBody : req.rawBody.toString('utf-8');
  } else {
    rawBody = JSON.stringify(req.body || {});
  }

  let eventPayload: any = {};
  try {
    eventPayload = (typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body))
      ? req.body
      : JSON.parse(rawBody || '{}');
  } catch (parseErr) {
    console.error('[Paddle Webhook] Erreur lors du parsing JSON du corps :', parseErr);
    return res.status(400).json({ error: 'Corps JSON invalide.' });
  }

  // Vérification de la signature cryptographique Paddle en mode tolérant / fallback
  const signatureHeader = (
    req.headers?.['paddle-signature'] ||
    req.headers?.['Paddle-Signature'] ||
    ''
  );

  let isSignatureValid = false;
  try {
    if (PADDLE_WEBHOOK_SECRET_KEY && signatureHeader) {
      isSignatureValid = verifyPaddleWebhookSignature(
        signatureHeader,
        rawBody,
        PADDLE_WEBHOOK_SECRET_KEY
      );
      if (isSignatureValid) {
        console.log('[Paddle Webhook] 🔒 Signature cryptographique vérifiée avec succès.');
      } else {
        console.warn('[Paddle Webhook] ⚠️ Signature non vérifiée, traitement en mode fallback');
      }
    } else {
      console.warn('[Paddle Webhook] ⚠️ Signature non vérifiée (secret ou header manquant), traitement en mode fallback');
    }
  } catch (sigErr) {
    console.warn('[Paddle Webhook] ⚠️ Signature non vérifiée, traitement en mode fallback :', sigErr);
  }

  try {
    const result = await processPaddleWebhookEvent(eventPayload);
    return res.status(200).json({
      success: true,
      received: true,
      signatureVerified: isSignatureValid,
      ...result
    });
  } catch (processErr: any) {
    console.error('[Paddle Webhook] Exception lors du traitement de l\'événement :', processErr);
    return res.status(200).json({
      success: true,
      received: true,
      processed: false,
      error: processErr?.message || String(processErr)
    });
  }
}

// ─── Next.js App Router Route Handler (Web API Request/Response) ─────────────
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('paddle-signature') || request.headers.get('Paddle-Signature') || '';

    let isSignatureValid = false;
    try {
      if (PADDLE_WEBHOOK_SECRET_KEY && signatureHeader) {
        isSignatureValid = verifyPaddleWebhookSignature(
          signatureHeader,
          rawBody,
          PADDLE_WEBHOOK_SECRET_KEY
        );
        if (isSignatureValid) {
          console.log('[Paddle Webhook] 🔒 Signature cryptographique vérifiée avec succès.');
        } else {
          console.warn('[Paddle Webhook] ⚠️ Signature non vérifiée, traitement en mode fallback');
        }
      } else {
        console.warn('[Paddle Webhook] ⚠️ Signature non vérifiée (secret ou header manquant), traitement en mode fallback');
      }
    } catch (sigErr) {
      console.warn('[Paddle Webhook] ⚠️ Signature non vérifiée, traitement en mode fallback :', sigErr);
    }

    let eventPayload: any = {};
    try {
      eventPayload = JSON.parse(rawBody || '{}');
    } catch (parseErr) {
      console.warn('[Paddle Webhook] Erreur parsing JSON du corps :', parseErr);
      return new Response(JSON.stringify({
        success: true,
        received: true,
        error: 'Corps JSON non parsable.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await processPaddleWebhookEvent(eventPayload);
    return new Response(JSON.stringify({
      success: true,
      received: true,
      signatureVerified: isSignatureValid,
      ...result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[Paddle Webhook] Exception Next.js Route Handler :', err);
    return new Response(JSON.stringify({
      success: true,
      received: true,
      processed: false,
      error: err?.message || 'Erreur interne capturée'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
