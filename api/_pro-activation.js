/**
 * Service centralisé d'activation du Pass Pro et gestion des abonnements/dons pour Éliciné
 * Connecte Supabase (profiles & subscriptions) et déclenche l'envoi des e-mails Resend
 */
import { createClient } from '@supabase/supabase-js';
import { sendProWelcomeEmail, sendDonationThankYouEmail } from './_email.js';

// Configuration Supabase multi-environnements avec priorité Service Role Key
const supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  process.env.VITE_SUPABASE_URL || 
  process.env.SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co'
).trim();

const supabaseKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  ''
).trim();

export const supabaseAdmin = (supabaseUrl && supabaseKey && supabaseKey.length > 20)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

/**
 * Calcule la date d'expiration en fonction du forfait
 */
export function computePlanExpiry(plan = 'monthly') {
  const expiresDate = new Date();
  if (plan === 'yearly') {
    expiresDate.setFullYear(expiresDate.getFullYear() + 1);
  } else {
    expiresDate.setDate(expiresDate.getDate() + 30);
  }
  return expiresDate.toISOString();
}

/**
 * Fonction centrale d'activation du Pass Pro et enregistrement Supabase + Resend
 * 
 * @param {string} email - Adresse e-mail du client
 * @param {Object} planDetails - Détails du paiement / plan
 * @param {string} [planDetails.plan='monthly'] - 'monthly' | 'yearly' | 'donation'
 * @param {string} [planDetails.customerName] - Nom du client
 * @param {number|string} [planDetails.amount] - Montant réglé
 * @param {string} [planDetails.currency='USD'] - Devise du paiement
 * @param {string} [planDetails.gateway='online'] - 'paypal' | 'saspay' | 'moneroo' | etc.
 * @param {string} [planDetails.paymentReference] - Numéro de commande / transaction
 * @param {string} [planDetails.subscriptionId] - ID de souscription unique
 * @param {boolean} [planDetails.isDonation] - True s'il s'agit d'un don libre
 * @param {string} [planDetails.userId] - ID utilisateur Supabase si disponible
 * @param {string} [planDetails.phone] - Numéro de téléphone si disponible
 * 
 * @returns {Promise<{success: boolean, isPro: boolean, email: string, plan: string, expiresAt?: string, subscriptionId: string, emailSent: boolean, error?: string}>}
 */
export async function activateUserPassPro(email, planDetails = {}) {
  const rawEmail = (email || '').trim().toLowerCase();

  if (!rawEmail || !rawEmail.includes('@')) {
    console.warn('[Activation Pro] ⚠️ Adresse e-mail invalide ou absente:', email);
    return {
      success: false,
      isPro: false,
      email: rawEmail,
      error: 'Adresse email invalide ou non fournie.'
    };
  }

  const {
    plan = 'monthly',
    customerName,
    amount,
    currency = 'USD',
    gateway = 'online',
    paymentReference = '',
    subscriptionId = '',
    isDonation: explicitDonation,
    userId,
    phone
  } = planDetails;

  const now = new Date().toISOString();
  const cleanName = (customerName || rawEmail.split('@')[0] || 'Cinéphile').trim();
  const numericAmount = Number(amount || (plan === 'yearly' ? 15.99 : 1.99));

  // Détection don vs abonnement Pro
  const isDonation = explicitDonation === true || (
    plan === 'donation' || 
    plan === 'don' || 
    String(paymentReference).toLowerCase().includes('don') ||
    (numericAmount > 0 && numericAmount < 1.50 && !['monthly', 'yearly'].includes(plan))
  );

  const normalizedPlan = isDonation ? 'donation' : (plan === 'yearly' ? 'yearly' : 'monthly');
  const expiresAt = isDonation ? null : computePlanExpiry(normalizedPlan);
  const targetSubId = subscriptionId || `sub_${gateway}_${paymentReference || Date.now()}`;

  console.log(`[Activation Centralisée] 🚀 Traitement pour ${rawEmail} | Type: ${isDonation ? 'Don' : 'Pro'} | Gateway: ${gateway} | Montant: ${numericAmount} ${currency}`);

  // 1. Mise à jour de la base de données Supabase
  let dbSuccess = false;
  if (supabaseAdmin) {
    try {
      // 1.A. Mise à jour du profil utilisateur
      if (!isDonation) {
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({
            is_pro: true,
            updated_at: now
          })
          .eq('email', rawEmail);

        if (profileError) {
          console.warn('[Activation Pro Supabase] Note mise à jour profile:', profileError.message);
        } else {
          console.log(`[Activation Pro Supabase] ✅ Profil ${rawEmail} passé à is_pro = true`);
        }
      }

      // 1.B. Upsert dans la table subscriptions
      const { error: subError } = await supabaseAdmin
        .from('subscriptions')
        .upsert({
          id: targetSubId,
          user_id: userId || `usr_${rawEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
          email: rawEmail,
          customer_name: cleanName,
          phone: phone || null,
          plan: normalizedPlan,
          amount: numericAmount,
          currency: currency.toUpperCase(),
          status: 'active',
          payment_reference: paymentReference || null,
          payment_provider: gateway,
          terms_accepted: true,
          created_at: now,
          updated_at: now,
          expires_at: expiresAt
        });

      if (subError) {
        console.warn('[Activation Pro Supabase] Note upsert subscriptions:', subError.message);
      } else {
        console.log(`[Activation Pro Supabase] ✅ Souscription ${targetSubId} enregistrée en statut active`);
      }

      dbSuccess = true;
    } catch (dbErr) {
      console.error('[Activation Pro Supabase] Exception DB:', dbErr);
    }
  } else {
    console.warn('[Activation Pro] ⚠️ Client Supabase non initialisé (variables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes).');
  }

  // 2. Envoi automatique de l'e-mail transactionnel Resend (depuis support@elicine.app)
  let emailSent = false;
  try {
    if (isDonation) {
      console.log(`[Activation Pro] ✉️ Envoi de l'e-mail de remerciement pour don à ${rawEmail}...`);
      const emailRes = await sendDonationThankYouEmail(rawEmail, {
        customerName: cleanName,
        amount: String(numericAmount)
      });
      emailSent = emailRes?.success || false;
    } else {
      console.log(`[Activation Pro] ✉️ Envoi de l'e-mail de bienvenue Pro à ${rawEmail}...`);
      const emailRes = await sendProWelcomeEmail(rawEmail, {
        customerName: cleanName,
        plan: normalizedPlan
      });
      emailSent = emailRes?.success || false;
    }
  } catch (emailErr) {
    console.error('[Activation Pro] Erreur lors de l\'envoi de l\'e-mail Resend:', emailErr);
  }

  return {
    success: true,
    isPro: !isDonation,
    email: rawEmail,
    plan: normalizedPlan,
    expiresAt,
    subscriptionId: targetSubId,
    dbUpdated: dbSuccess,
    emailSent
  };
}
