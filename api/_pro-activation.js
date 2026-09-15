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
 * Valide le format UUID v4 standard
 */
export function isUuid(val) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim());
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
      const validUserUuid = (userId && isUuid(userId)) ? userId : null;

      // 1.A. Mise à jour du profil utilisateur
      if (!isDonation) {
        const profileUpdatePayload = {
          is_pro: true,
          pass_status: 'pro',
          updated_at: now
        };
        if (expiresAt) {
          profileUpdatePayload.pro_expires_at = expiresAt;
        }

        let profileQuery = supabaseAdmin
          .from('profiles')
          .update(profileUpdatePayload);

        if (validUserUuid) {
          profileQuery = profileQuery.or(`id.eq.${validUserUuid},email.eq.${rawEmail}`);
        } else {
          profileQuery = profileQuery.eq('email', rawEmail);
        }

        const { error: profileError } = await profileQuery;

        if (profileError) {
          console.warn('[Activation Pro Supabase] Note mise à jour profile étendue:', profileError.message);
          // Fallback avec mise à jour minimale si certaines colonnes (pass_status/pro_expires_at) n'existent pas encore
          const { error: fallbackErr } = await supabaseAdmin
            .from('profiles')
            .update({
              is_pro: true,
              updated_at: now
            })
            .eq('email', rawEmail);

          if (fallbackErr) {
            console.warn('[Activation Pro Supabase] Note mise à jour profile repli:', fallbackErr.message);
          } else {
            console.log(`[Activation Pro Supabase] ✅ Profil ${rawEmail} passé à is_pro = true (fallback)`);
          }
        } else {
          console.log(`[Activation Pro Supabase] ✅ Profil ${rawEmail} passé à is_pro = true & pass_status = 'pro'`);
        }

        // Si le profil n'existe pas encore et qu'on a un UUID d'authentification valide, création proactive
        try {
          const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('id, is_pro')
            .eq('email', rawEmail)
            .maybeSingle();

          if (!existingProfile && validUserUuid) {
            await supabaseAdmin
              .from('profiles')
              .insert({
                id: validUserUuid,
                email: rawEmail,
                username: cleanName,
                is_pro: true,
                pass_status: 'pro',
                pro_expires_at: expiresAt,
                created_at: now,
                updated_at: now
              });
            console.log(`[Activation Pro Supabase] 🆕 Profil créé pour ${rawEmail} (ID: ${validUserUuid})`);
          }
        } catch (insertErr) {
          console.warn('[Activation Pro Supabase] Note création profil:', insertErr?.message);
        }
      }

      // 1.B. Upsert dans la table subscriptions (uniquement pour les abonnements Pro mensuels ou annuels)
      if (!isDonation) {
        const subPlan = (normalizedPlan === 'yearly') ? 'yearly' : 'monthly';
        const subPayload = {
          id: targetSubId,
          user_id: validUserUuid || `usr_${rawEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
          email: rawEmail,
          customer_name: cleanName,
          phone: phone || null,
          plan: subPlan,
          amount: numericAmount,
          currency: currency.toUpperCase(),
          status: 'active',
          payment_reference: paymentReference || null,
          payment_provider: gateway,
          terms_accepted: true,
          created_at: now,
          updated_at: now
        };

        const { error: subError } = await supabaseAdmin
          .from('subscriptions')
          .upsert(subPayload);

        if (subError) {
          console.warn('[Activation Pro Supabase] Note upsert subscriptions:', subError.message);
        } else {
          console.log(`[Activation Pro Supabase] ✅ Souscription ${targetSubId} enregistrée en statut active`);
        }
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
