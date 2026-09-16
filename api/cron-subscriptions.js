/**
 * Endpoint Cron Serverless : /api/cron-subscriptions
 * 1. Rétrograde automatiquement les abonnements expirés (is_pro = false, pass_status = 'free')
 * 2. Détecte les abonnements Pro arrivant à expiration (J-3, J-1) et envoie automatiquement un e-mail de relance Resend
 */
import { downgradeExpiredSubscriptions, processExpirationReminders } from './_pro-activation.js';

export default async function handler(req, res) {
  // En-têtes CORS universels
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Vérification de sécurité optionnelle (CRON_SECRET si défini dans l'environnement)
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (cronSecret) {
    const authHeader = req.headers?.authorization || '';
    const querySecret = req.query?.secret || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (querySecret !== cronSecret && bearerToken !== cronSecret) {
      return res.status(401).json({
        success: false,
        error: "Accès non autorisé : CRON_SECRET invalide."
      });
    }
  }

  console.log('[Cron Subscriptions] ⏱️ Exécution du cycle de maintenance des abonnements Pro...');

  try {
    // 1. Rétrogradation des comptes expirés
    const downgradeResult = await downgradeExpiredSubscriptions();

    // 2. Envoi des e-mails de relance pour les comptes expirant sous 3 jours
    const remindersResult = await processExpirationReminders();

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      downgrade: downgradeResult,
      reminders: remindersResult,
      message: 'Cycle de maintenance et relances d\'abonnements exécuté avec succès.'
    });
  } catch (error) {
    console.error('[Cron Subscriptions] Exception critique:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erreur serveur lors de l\'exécution du cron.'
    });
  }
}
