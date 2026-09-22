/**
 * Webhook Paddle Billing v2 — Éliciné Pass Pro
 * Endpoint Serverless Vercel & Next.js / Route Handler compatible
 *
 * Fonctionnalités :
 * 1. Vérification cryptographique tolérante de la signature Paddle (HMAC-SHA256 via PADDLE_WEBHOOK_SECRET_KEY)
 * 2. Inspection approfondie du payload Paddle pour récupérer l'e-mail du payeur
 * 3. Réutilisation de la même logique interne d'activation Supabase que /api/activate-pro et /api/saspay (activateUserPassPro)
 * 4. Déclenchement de l'envoi d'e-mail transactionnel Resend depuis support@elicine.app
 * 5. Prise en charge immédiate avec fallback explicite pour la transaction txn_01m2xa1c14bzjhz75hnw6n4en0 et sandytini07@gmail.com
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { supabaseAdmin } from './_pro-activation.js';
import { sendProWelcomeEmail } from './_email.js';
import {
  applyPaddleSubscription,
  extractPaddleEmail,
  hasProcessedPaddleEvent,
  normalizePaddleEvent,
  recordPaddleEventProcessed,
  resolvePaddleIdentity
} from './_paddle-activation.js';
import { applyPaddleSupporter, isSupporterTransaction } from './_paddle-supporter.js';

// ─── Configuration des variables d'environnement ──────────────────────────────
const RESEND_API_KEY = (
  process.env.RESEND_API_KEY ||
  process.env.VITE_RESEND_API_KEY ||
  ''
).trim();

const PADDLE_WEBHOOK_SECRET_KEY = (
  process.env.PADDLE_WEBHOOK_SECRET ||
  process.env.PADDLE_WEBHOOK_SECRET_KEY ||
  process.env.VITE_PADDLE_WEBHOOK_SECRET ||
  process.env.VITE_PADDLE_WEBHOOK_SECRET_KEY ||
  ''
).trim();

const PADDLE_API_KEY = (
  process.env.PADDLE_API_KEY ||
  process.env.VITE_PADDLE_API_KEY ||
  ''
).trim();

const PADDLE_ENV = (
  process.env.PADDLE_ENV ||
  process.env.VITE_PADDLE_ENV ||
  ''
).trim().toLowerCase();

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

const effectiveSupabase: SupabaseClient | null = supabaseAdmin || supabase;

/**
 * Valide la signature cryptographique du Webhook Paddle Billing v2 (HMAC-SHA256).
 * Format attendu du header paddle-signature : ts=1671552777;h1=eb3864d4d03e9447...
 */
function parsePaddleSignatureHeader(signatureHeader: string | null | undefined) {
  const parts = String(signatureHeader || '').split(';');
  let ts = '';
  let h1 = '';
  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    const normalizedKey = key?.trim().toLowerCase();
    const value = valueParts.join('=').trim();
    if (normalizedKey === 'ts') ts = value;
    if (normalizedKey === 'h1') h1 = value;
  }
  return { ts, h1 };
}

export async function verifyPaddleWebhookSignature(
  signatureHeader: string | null | undefined,
  rawBody: string,
  secretKey: string
): Promise<boolean> {
  if (!signatureHeader || !secretKey) return false;

  try {
    const { ts, h1 } = parsePaddleSignatureHeader(signatureHeader);

    if (!ts || !h1) return false;

    // The signed payload is exactly `${ts}:${rawBody}`. Web Crypto keeps the
    // handler compatible with the Edge runtime where the raw request body is
    // available without a JSON body parser.
    const encoder = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw', encoder.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = new Uint8Array(await globalThis.crypto.subtle.sign(
      'HMAC', key, encoder.encode(`${ts}:${rawBody}`)
    ));
    let difference = 0;
    if (h1.length !== signature.length * 2) return false;
    for (let index = 0; index < signature.length; index += 1) {
      difference |= parseInt(h1.slice(index * 2, index * 2 + 2), 16) ^ signature[index];
    }
    return difference === 0;
  } catch (err) {
    console.error('[Paddle Webhook] Erreur lors de la vérification de signature :', err);
    return false;
  }
}

/**
 * Recherche récursive ou par motif d'une adresse email valide dans un objet quelconque
 */
export function extractEmailFromPayload(target: any): string | null {
  if (!target) return null;

  if (typeof target === 'string') {
    const match = target.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0].toLowerCase().trim() : null;
  }

  if (typeof target === 'object') {
    // Vérification prioritaire des champs d'email usuels
    const directFields = [
      target?.email,
      target?.customer?.email,
      target?.details?.customer?.email,
      target?.custom_data?.email,
      target?.custom_data?.user_email,
      target?.custom_data?.customer_email,
      target?.customer_email,
      target?.user_email,
      target?.buyer_email
    ];

    for (const cand of directFields) {
      if (typeof cand === 'string' && cand.includes('@')) {
        const clean = cand.trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
          return clean;
        }
      }
    }

    // Inspection du JSON sérialisé pour détecter toute adresse email
    try {
      const serialized = JSON.stringify(target);
      const matches = serialized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (matches && matches.length > 0) {
        for (const m of matches) {
          const lower = m.toLowerCase().trim();
          if (!lower.includes('paddle.com') && !lower.includes('example.com')) {
            return lower;
          }
        }
        return matches[0].toLowerCase().trim();
      }
    } catch (_) {}
  }

  return null;
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

const PADDLE_SUBSCRIPTION_EVENTS = new Set([
  'subscription.created', 'subscription.updated', 'subscription.activated',
  'subscription.trialing', 'subscription.past_due', 'subscription.canceled',
  'subscription.cancelled', 'subscription.paused', 'subscription.resumed'
]);
const PADDLE_TRANSACTION_EVENTS = new Set(['transaction.completed', 'transaction.paid']);

function isEligiblePaddleEvent(eventType: string) {
  return PADDLE_SUBSCRIPTION_EVENTS.has(eventType) || PADDLE_TRANSACTION_EVENTS.has(eventType);
}

async function fetchPaddleCustomer(customerId: string) {
  if (!PADDLE_API_KEY || !customerId) return null;
  const baseUrl = PADDLE_ENV === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
  const response = await fetch(`${baseUrl}/customers/${encodeURIComponent(customerId)}`, {
    headers: { Authorization: `Bearer ${PADDLE_API_KEY}` }
  });
  if (!response.ok) throw new Error(`PADDLE_CUSTOMER_${response.status}`);
  const payload: any = await response.json();
  return payload?.data || payload;
}

/**
 * Apply one Paddle Billing event to Supabase.
 *
 * The old flow required an email in the payload. Paddle subscription events
 * carry data.customer_id and data.custom_data.user_id, but not necessarily an
 * email, so a real subscription.created stopped before writing anything. The
 * identity now resolves through user_id, stored Paddle identifiers or the
 * Paddle customer API. Access is applied from the real subscription status.
 */
export async function processPaddleWebhookEvent(eventPayload: any, options: {
  rawBody?: string;
  signatureVerified?: boolean | null;
  supabase?: SupabaseClient | null;
  fetchCustomer?: ((customerId: string) => Promise<any>) | null;
} = {}) {
  const event = normalizePaddleEvent(eventPayload, options.rawBody || '');
  const { eventType, eventId, subscriptionId, transactionId, customerId } = event;
  const runtimeSupabase = options.supabase || effectiveSupabase;

  console.log(`[Paddle Webhook] 🔔 Événement reçu : "${eventType}" (ID: ${eventId || 'N/A'} | Sub: ${subscriptionId || 'N/A'} | Tx: ${transactionId || 'N/A'} | Customer: ${customerId || 'N/A'})`);

  if (!isEligiblePaddleEvent(eventType)) {
    return {
      success: true,
      received: true,
      processed: false,
      eventType,
      message: `Événement ${eventType} acquitté sans traitement métier.`
    };
  }

  if (!runtimeSupabase) {
    console.error('[Paddle Webhook] ❌ Supabase service role absent : impossible d’activer Pro.');
    return {
      success: false,
      received: true,
      processed: false,
      retryable: true,
      error: 'SUPABASE_NOT_CONFIGURED'
    };
  }

  if (await hasProcessedPaddleEvent({ supabase: runtimeSupabase, eventId })) {
    console.log(`[Paddle Webhook] ♻️ Événement déjà traité : ${eventId}`);
    return {
      success: true,
      received: true,
      processed: false,
      duplicate: true,
      eventType,
      eventId
    };
  }

  const identity = await resolvePaddleIdentity({
    supabase: runtimeSupabase,
    event,
    fetchCustomer: options.fetchCustomer || fetchPaddleCustomer
  });

  // ─── Produit « Eliciné Supporter » : soutien ponctuel, jamais un Pass Pro ───
  // Traité avant le flux d'abonnement et retourné tôt : appliquer un paiement one-time
  // Supporter ne doit ni activer Pro, ni envoyer l'e-mail de bienvenue Pro.
  if (isSupporterTransaction(event)) {
    const supporter = await applyPaddleSupporter({ supabase: runtimeSupabase, identity, event });
    if (!supporter.processed && supporter.retryable) {
      console.error('[Paddle Webhook] ❌ Soutien Supporter non enregistré :', supporter);
      return { success: false, received: true, ...supporter, eventType, eventId };
    }
    const supporterRecord = await recordPaddleEventProcessed({ supabase: runtimeSupabase, event });
    console.log(`[Paddle Webhook] 💛 Soutien Supporter ${supporter.amountCents} ${supporter.currency} enregistré (${eventId}).`);
    return {
      success: true,
      received: true,
      processed: Boolean(supporter.processed),
      duplicate: Boolean(supporter.duplicate || supporterRecord.duplicate),
      supporter: true,
      isPro: false,
      eventType,
      eventId,
      ...supporter
    };
  }

  if (!identity?.email) {
    console.error('[Paddle Webhook] ❌ Utilisateur Supabase introuvable (user_id / customer_id / subscription_id).');
    return {
      success: false,
      received: true,
      processed: false,
      retryable: true,
      error: 'PADDLE_IDENTITY_NOT_RESOLVED',
      eventType,
      eventId,
      subscriptionId,
      customerId
    };
  }

  const result = await applyPaddleSubscription({
    supabase: runtimeSupabase,
    identity,
    event,
    now: new Date().toISOString()
  });

  if (!result.processed) {
    console.error('[Paddle Webhook] ❌ Synchronisation Supabase échouée :', result);
    return {
      success: false,
      received: true,
      ...result,
      eventType,
      eventId
    };
  }

  const record = await recordPaddleEventProcessed({ supabase: runtimeSupabase, event });
  if (record.duplicate) {
    return {
      success: true,
      received: true,
      processed: false,
      duplicate: true,
      eventType,
      eventId
    };
  }

  let emailSent = false;
  const welcomeEvents = new Set(['subscription.created', 'subscription.activated',
    'transaction.completed', 'transaction.paid']);
  if (result.isPro && welcomeEvents.has(eventType)) {
    const amount = Number(event.data?.details?.totals?.total || event.data?.details?.totals?.grand_total || 1.99);
    const currency = String(event.data?.currency_code || event.data?.details?.totals?.currency_code || 'EUR').toUpperCase();
    const customerName = event.data?.customer?.name || event.customData?.user_name || identity.email.split('@')[0];
    try {
      const welcome = await sendProWelcomeEmail(identity.email, {
        customerName,
        plan: result.plan || 'monthly',
        amount,
        currency,
        expiresAt: result.expiresAt
      });
      emailSent = Boolean(welcome?.success);
      if (!emailSent && resend) {
        const fallback = await resend.emails.send({
          from: 'Éliciné <support@elicine.app>',
          to: [identity.email],
          subject: 'Bienvenue dans Éliciné Pro ! 🎬',
          html: getPaddleProWelcomeHtml({
            customerName,
            amount: `${String(amount).replace('.', ',')} €`,
            expiresAt: result.expiresAt
          })
        });
        emailSent = !fallback.error;
      }
    } catch (mailError: any) {
      console.error('[Paddle Webhook] Erreur envoi email:', mailError?.message || mailError);
    }
  }

  console.log(`[Paddle Webhook] ✅ ${eventType} | ${identity.email} | Pro=${result.isPro} | statut=${result.status} | expire=${result.expiresAt}`);
  return {
    success: true,
    received: true,
    processed: true,
    eventType,
    eventId,
    signatureVerified: options.signatureVerified ?? null,
    ...result,
    emailSent
  };
}

// ─── Edge runtime: request.text() preserves the exact Paddle-signed body ──────
// Vercel's Node runtime parses application/json before the handler, which makes
// the HMAC impossible to verify. The Edge runtime exposes the raw request.
export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, paddle-signature, Paddle-Signature, Authorization',
  'Content-Type': 'application/json'
};

function responseStatus(result: any) {
  if (result?.success) return 200;
  if (result?.error === 'PADDLE_IDENTITY_NOT_RESOLVED') return 422;
  return result?.retryable ? 500 : 400;
}

function jsonResponse(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: CORS_HEADERS });
}

export async function handlePaddleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === 'GET') {
    return jsonResponse({
      status: 'Paddle Webhook Endpoint Active',
      supportedMethods: ['POST', 'OPTIONS'],
      ready: Boolean(PADDLE_WEBHOOK_SECRET_KEY),
      secretConfigured: Boolean(PADDLE_WEBHOOK_SECRET_KEY),
      paddleApiKeyConfigured: Boolean(PADDLE_API_KEY),
      environment: PADDLE_ENV || 'unspecified'
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non autorisée. Seules les requêtes POST sont acceptées.' }, 405);
  }

  if (!PADDLE_WEBHOOK_SECRET_KEY) {
    console.error('[Paddle Webhook] ❌ PADDLE_WEBHOOK_SECRET / PADDLE_WEBHOOK_SECRET_KEY absent.');
    return jsonResponse({ success: false, error: 'WEBHOOK_SECRET_NOT_CONFIGURED' }, 500);
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get('paddle-signature') || request.headers.get('Paddle-Signature') || '';
  if (!signatureHeader) {
    console.warn('[Paddle Webhook] ❌ Signature Paddle absente.');
    return jsonResponse({ success: false, error: 'PADDLE_SIGNATURE_MISSING' }, 401);
  }
  if (!(await verifyPaddleWebhookSignature(signatureHeader, rawBody, PADDLE_WEBHOOK_SECRET_KEY))) {
    console.warn('[Paddle Webhook] ❌ Signature Paddle invalide.');
    return jsonResponse({ success: false, error: 'PADDLE_SIGNATURE_INVALID' }, 401);
  }

  let eventPayload: any;
  try {
    eventPayload = JSON.parse(rawBody || '{}');
  } catch {
    return jsonResponse({ success: false, error: 'INVALID_JSON' }, 400);
  }

  const result = await processPaddleWebhookEvent(eventPayload, {
    rawBody,
    signatureVerified: true
  });
  return jsonResponse(result, responseStatus(result));
}

export default handlePaddleRequest;
export const POST = handlePaddleRequest;
