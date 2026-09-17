/**
 * Service centralisé d'activation du Pass Pro et gestion des abonnements/dons pour Éliciné
 * Connecte Supabase (profiles & subscriptions) et déclenche l'envoi des e-mails Resend
 */
import { createClient } from '@supabase/supabase-js';
import { sendProWelcomeEmail, sendDonationThankYouEmail, sendProRenewalReminderEmail } from './_email.js';

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
 * Calcule la date d'expiration exacte (+30 jours pour mensuel, +365 jours pour annuel)
 * basée sur now() + interval '30 days' (new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
 */
export function computePlanExpiry(plan = 'monthly', baseDate = null) {
  const startTime = (baseDate && !isNaN(new Date(baseDate).getTime()))
    ? new Date(baseDate).getTime()
    : Date.now();
  const durationDays = (plan === 'yearly') ? 365 : 30;
  const expiresTimestamp = startTime + (durationDays * 24 * 60 * 60 * 1000);
  return new Date(expiresTimestamp).toISOString();
}

/**
 * Calcule le nombre de jours restants jusqu'à expiration
 */
export function getDaysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const expTime = new Date(expiresAt).getTime();
  if (isNaN(expTime)) return null;
  const diffMs = expTime - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Valide le format UUID v4 standard
 */
export function isUuid(val) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim());
}

/**
 * Fonction centrale d'activation du Pass Pro et enregistrement Supabase + Resend
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
    currency: rawCurrency,
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
  const currency = (rawCurrency 
    ? String(rawCurrency).trim() 
    : ((gateway === 'saspay' || numericAmount >= 100) ? 'FCFA' : 'USD')).toUpperCase();

  // Détection don vs abonnement Pro
  const isDonation = explicitDonation === true || (
    plan === 'donation' || 
    plan === 'don' || 
    String(paymentReference).toLowerCase().includes('don') ||
    (numericAmount > 0 && numericAmount < 1.50 && !['monthly', 'yearly'].includes(plan))
  );

  const normalizedPlan = isDonation ? 'donation' : (plan === 'yearly' ? 'yearly' : 'monthly');

  // Vérification si l'utilisateur possède déjà une période Pro active pour prolonger
  let baseExpiry = null;
  if (supabaseAdmin && !isDonation) {
    try {
      const { data: existingProf } = await supabaseAdmin
        .from('profiles')
        .select('id, expires_at, is_pro')
        .ilike('email', rawEmail.trim())
        .maybeSingle();

      const currentExpiry = existingProf?.expires_at;
      if (existingProf?.is_pro && currentExpiry && new Date(currentExpiry).getTime() > Date.now()) {
        baseExpiry = currentExpiry;
        console.log(`[Activation Pro Supabase] 🔄 Prolongation de l'abonnement existant pour ${rawEmail} depuis le ${currentExpiry}`);
      }
    } catch (_) {}
  }

  // Calcul exact : now + 30 jours (ou 365 jours)
  const expiresAt = isDonation ? null : computePlanExpiry(normalizedPlan, baseExpiry);
  const targetSubId = subscriptionId || `sub_${gateway}_${paymentReference || Date.now()}`;

  console.log(`[Activation Centralisée] 🚀 Traitement pour ${rawEmail} | Type: ${isDonation ? 'Don' : 'Pro (30 jours)'} | Gateway: ${gateway} | Montant: ${numericAmount} ${currency} | Expiration: ${expiresAt || 'N/A'}`);

  // 1. Mise à jour de la base de données Supabase
  let dbSuccess = false;
  if (supabaseAdmin) {
    try {
      const validUserUuid = (userId && isUuid(userId)) ? userId : null;

      // 1.A. Mise à jour du profil utilisateur
      if (!isDonation) {
        const cleanEmail = rawEmail.trim().toLowerCase();
        const profileUpdatePayload = {
          is_pro: true,
          expires_at: expiresAt,
          updated_at: now
        };

        let profileQuery = supabaseAdmin
          .from('profiles')
          .update(profileUpdatePayload);

        if (validUserUuid) {
          profileQuery = profileQuery.or(`id.eq.${validUserUuid},email.ilike.${cleanEmail}`);
        } else {
          profileQuery = profileQuery.ilike('email', cleanEmail);
        }

        const { error: profileError } = await profileQuery;

        if (profileError) {
          console.warn('[Activation Pro Supabase] Note mise à jour profile avec expires_at:', profileError.message);
          // Fallback avec mise à jour minimale garantie
          const { error: fallbackErr } = await supabaseAdmin
            .from('profiles')
            .update({
              is_pro: true,
              updated_at: now
            })
            .ilike('email', cleanEmail);

          if (fallbackErr) {
            console.error('[Activation Pro Supabase] Erreur mise à jour profile repli:', fallbackErr.message);
          } else {
            console.log(`[Activation Pro Supabase] ✅ Profil ${cleanEmail} passé à is_pro = true (repli minimal)`);
          }
        } else {
          console.log(`[Activation Pro Supabase] ✅ Profil ${cleanEmail} passé à is_pro = true & expiration définie au ${expiresAt}`);
        }

        // Si le profil n'existe pas encore et qu'on a un UUID d'authentification valide, création proactive
        try {
          const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('id, is_pro')
            .ilike('email', cleanEmail)
            .maybeSingle();

          if (!existingProfile && validUserUuid) {
            await supabaseAdmin
              .from('profiles')
              .insert({
                id: validUserUuid,
                email: cleanEmail,
                username: cleanName,
                is_pro: true,
                expires_at: expiresAt,
                created_at: now,
                updated_at: now
              });
            console.log(`[Activation Pro Supabase] 🆕 Profil créé pour ${cleanEmail} (ID: ${validUserUuid}, Exp: ${expiresAt})`);
          }
        } catch (insertErr) {
          console.warn('[Activation Pro Supabase] Note création profil:', insertErr?.message);
        }
      }

      // 1.B. Upsert dans la table subscriptions (avec colonne expires_at)
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
          expires_at: expiresAt,
          created_at: now,
          updated_at: now
        };

        const { error: subError } = await supabaseAdmin
          .from('subscriptions')
          .upsert(subPayload);

        if (subError) {
          console.warn('[Activation Pro Supabase] Note upsert subscriptions:', subError.message);
        } else {
          console.log(`[Activation Pro Supabase] ✅ Souscription ${targetSubId} enregistrée en statut active jusqu'au ${expiresAt}`);
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
      console.log(`[Activation Pro] ✉️ Envoi de l'e-mail de remerciement pour don à ${rawEmail} (${numericAmount} ${currency})...`);
      const emailRes = await sendDonationThankYouEmail(rawEmail, {
        customerName: cleanName,
        amount: numericAmount,
        currency: currency
      });
      emailSent = emailRes?.success || false;
    } else {
      console.log(`[Activation Pro] ✉️ Envoi de l'e-mail de bienvenue Pro à ${rawEmail} (${normalizedPlan}, ${numericAmount} ${currency})...`);
      const emailRes = await sendProWelcomeEmail(rawEmail, {
        customerName: cleanName,
        plan: normalizedPlan,
        amount: numericAmount,
        currency: currency,
        expiresAt
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
    daysRemaining: isDonation ? null : 30,
    subscriptionId: targetSubId,
    dbUpdated: dbSuccess,
    emailSent
  };
}

/**
 * Vérifie et rétrograde automatiquement les abonnements expirés (is_pro -> false)
 */
export async function downgradeExpiredSubscriptions() {
  if (!supabaseAdmin) {
    return { success: false, error: 'Client Supabase Admin non configuré', count: 0 };
  }

  const nowIso = new Date().toISOString();
  let downgradedProfilesCount = 0;
  let downgradedSubsCount = 0;

  try {
    // 1. Tenter l'appel de la procédure stockée PostgreSQL
    try {
      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('downgrade_expired_subscriptions');
      if (!rpcError && rpcData && rpcData.length > 0) {
        return {
          success: true,
          method: 'rpc',
          downgradedProfiles: rpcData[0].downgraded_profiles_count,
          downgradedSubscriptions: rpcData[0].downgraded_subscriptions_count
        };
      }
    } catch (_) {}

    // 2. Repli direct via requêtes Supabase REST
    const { data: expiredProfiles, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, expires_at')
      .eq('is_pro', true)
      .neq('email', 'ivanjoris959@gmail.com');

    if (!fetchErr && Array.isArray(expiredProfiles)) {
      const expiredIds = [];
      for (const p of expiredProfiles) {
        const exp = p.expires_at;
        if (exp && new Date(exp).getTime() < Date.now()) {
          expiredIds.push(p.id);
        }
      }

      if (expiredIds.length > 0) {
        const { error: updateErr } = await supabaseAdmin
          .from('profiles')
          .update({
            is_pro: false,
            updated_at: nowIso
          })
          .in('id', expiredIds);

        if (!updateErr) {
          downgradedProfilesCount = expiredIds.length;
          console.log(`[Cron Subscriptions] 🔻 ${downgradedProfilesCount} profil(s) expiré(s) rétrogradé(s) en Free.`);
        }
      }
    }

    // 3. Mise à jour des souscriptions expirées
    const { data: expiredSubs, error: subsFetchErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, expires_at')
      .eq('status', 'active')
      .neq('email', 'ivanjoris959@gmail.com');

    if (!subsFetchErr && Array.isArray(expiredSubs)) {
      const expiredSubIds = expiredSubs
        .filter(s => s.expires_at && new Date(s.expires_at).getTime() < Date.now())
        .map(s => s.id);

      if (expiredSubIds.length > 0) {
        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'expired', updated_at: nowIso })
          .in('id', expiredSubIds);
        downgradedSubsCount = expiredSubIds.length;
      }
    }

    return {
      success: true,
      method: 'rest_fallback',
      downgradedProfiles: downgradedProfilesCount,
      downgradedSubscriptions: downgradedSubsCount
    };
  } catch (error) {
    console.error('[Cron Subscriptions] Erreur lors de la rétrogradation:', error);
    return { success: false, error: error?.message, count: 0 };
  }
}

/**
 * Détecte les abonnements Pro arrivant à expiration (J-3 ou J-1) et envoie automatiquement un e-mail de relance
 */
export async function processExpirationReminders({ maxReminders = 50 } = {}) {
  if (!supabaseAdmin) {
    return { success: false, error: 'Client Supabase Admin non configuré', remindersSent: 0 };
  }

  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  const results = [];

  try {
    // 1. Récupération des profils Pro actifs
    const { data: activeProfiles, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, is_pro, expires_at')
      .eq('is_pro', true)
      .neq('email', 'ivanjoris959@gmail.com')
      .limit(maxReminders);

    if (fetchErr || !Array.isArray(activeProfiles)) {
      console.warn('[Cron Reminders] Erreur récupération profiles:', fetchErr?.message);
      return { success: false, error: fetchErr?.message, remindersSent: 0 };
    }

    for (const profile of activeProfiles) {
      const email = (profile.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) continue;

      const effectiveExpiry = profile.expires_at;
      if (!effectiveExpiry) continue;

      const expTime = new Date(effectiveExpiry).getTime();
      const timeRemainingMs = expTime - now;

      // Vérifier si l'expiration est comprise entre 0 et 3 jours (72h)
      if (timeRemainingMs > 0 && timeRemainingMs <= threeDaysMs) {
        const daysRemaining = Math.max(1, Math.ceil(timeRemainingMs / (1000 * 60 * 60 * 24)));

        // Récupération optionnelle des détails de devise de la dernière souscription
        let subAmount = null;
        let subCurrency = '';
        try {
          const { data: subData } = await supabaseAdmin
            .from('subscriptions')
            .select('amount, currency')
            .eq('email', email)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (subData) {
            subAmount = subData.amount;
            subCurrency = subData.currency;
          }
        } catch (_) {}

        console.log(`[Cron Reminders] ✉️ Envoi relance expiration (J-${daysRemaining}) à ${email} (${subCurrency || 'défaut'})...`);
        const emailRes = await sendProRenewalReminderEmail(email, {
          customerName: profile.email?.split('@')[0] || 'Cinéphile',
          daysRemaining,
          expiresAt: effectiveExpiry,
          renewalUrl: 'https://elicine.app?upgrade=pro',
          amount: subAmount,
          currency: subCurrency
        });

        if (emailRes?.success) {
          results.push({ email, daysRemaining, status: 'sent' });
        } else {
          results.push({ email, daysRemaining, status: 'failed', error: emailRes?.error });
        }
      }
    }

    return {
      success: true,
      remindersSent: results.filter(r => r.status === 'sent').length,
      results
    };
  } catch (error) {
    console.error('[Cron Reminders] Exception globale:', error);
    return { success: false, error: error?.message, remindersSent: 0 };
  }
}

export const processRenewalReminders = processExpirationReminders;
