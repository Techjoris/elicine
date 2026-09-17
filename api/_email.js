/**
 * Service d'envoi d'e-mails transactionnels via le SDK Resend officiel pour Éliciné
 * https://resend.com/docs/api-reference/emails/send-email
 */
import { Resend } from 'resend';

// Initialisation du client SDK Resend
const resendApiKey = (
  process.env.RESEND_API_KEY || 
  process.env.VITE_RESEND_API_KEY || 
  ''
).trim();

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Envoie un email via le SDK officiel Resend (avec bloc try/catch explicite et logs détaillés)
 */
export async function sendEmailWithResend({ to, subject, html, text }) {
  const fromEmail = (
    process.env.RESEND_FROM_EMAIL || 
    process.env.RESEND_EMAIL || 
    'Éliciné <support@elicine.app>'
  ).trim();

  const apiKey = (
    process.env.RESEND_API_KEY || 
    process.env.VITE_RESEND_API_KEY || 
    resendApiKey ||
    ''
  ).trim();

  if (!apiKey) {
    console.warn('[Resend] RESEND_API_KEY absente. Simulation envoi à :', to, `(${subject})`);
    return { success: false, simulated: true, message: 'RESEND_API_KEY non configurée' };
  }

  const cleanTo = Array.isArray(to) ? to : [to];
  const client = new Resend(apiKey);

  try {
    const data = await client.emails.send({
      from: fromEmail,
      to: cleanTo,
      subject,
      html,
      text: text || undefined
    });

    if (data.error) {
      console.error('[Resend Error]:', data.error);
      return { success: false, error: data.error };
    }

    console.log('[Resend Success] E-mail envoyé avec succès à', cleanTo, '(ID:', data.data?.id || data?.id, ')');
    return { success: true, data: data.data || data };
  } catch (error) {
    console.error('[Resend Exception]:', error);
    return { success: false, error: error?.message || error };
  }
}

/**
 * Formate un montant dans la devise réelle de la transaction.
 * Prend en charge avec précision : FCFA (XOF/XAF), EUR (€), USD ($), CAD (CA$).
 * Évite rigoureusement la conversion ou l'affichage de dollars par défaut lorsque la transaction a été faite en FCFA.
 */
export function formatEmailCurrency(amount, currency = '') {
  if (amount === null || amount === undefined || amount === '') return '';

  const strAmount = String(amount).trim();

  // Si la chaîne contient déjà une devise formatée, on la normalise proprement
  if (/(FCFA|XOF|XAF)/i.test(strAmount)) {
    return strAmount.replace(/XOF|XAF/gi, 'FCFA');
  }
  if (/€/i.test(strAmount) || /\bEUR\b/i.test(strAmount)) {
    return strAmount.replace(/\bEUR\b/gi, '€');
  }
  if (/CA\$/i.test(strAmount) || /\bCAD\b/i.test(strAmount)) {
    return strAmount.replace(/\bCAD\b/gi, 'CA$');
  }
  if (/\$/i.test(strAmount) || /\bUSD\b/i.test(strAmount)) {
    return strAmount.replace(/\bUSD\b/gi, '$');
  }

  // Nettoyage et extraction de la valeur numérique
  const cleanNumStr = strAmount.replace(/[^0-9.,]/g, '').replace(',', '.');
  const num = parseFloat(cleanNumStr);
  const isNumeric = !isNaN(num);

  const normCurr = String(currency || '').trim().toUpperCase();

  // Détection intelligente de la devise cible :
  // Si devise vide mais montant >= 100 (ex: 500, 1000, 1200, 2000), il s'agit typiquement de FCFA
  let targetCurr = normCurr;
  if (!targetCurr) {
    targetCurr = (isNumeric && num >= 100) ? 'FCFA' : 'USD';
  }

  // Formatage des nombres avec séparateur d'espace insécable français standard
  const formatNumber = (val, minDec = 0, maxDec = 2) => {
    return val.toLocaleString('fr-FR', {
      minimumFractionDigits: minDec,
      maximumFractionDigits: maxDec
    }).replace(/\u202F/g, ' ').replace(/\s/g, ' ');
  };

  if (targetCurr === 'XOF' || targetCurr === 'XAF' || targetCurr === 'FCFA') {
    const formatted = isNumeric ? formatNumber(Math.round(num), 0, 0) : strAmount;
    return `${formatted} FCFA`;
  }

  if (targetCurr === 'EUR' || targetCurr === '€') {
    const hasDec = isNumeric && (num % 1 !== 0);
    const formatted = isNumeric ? formatNumber(num, hasDec ? 2 : 0, 2) : strAmount;
    return `${formatted} €`;
  }

  if (targetCurr === 'CAD') {
    const hasDec = isNumeric && (num % 1 !== 0);
    const formatted = isNumeric ? formatNumber(num, hasDec ? 2 : 0, 2) : strAmount;
    return `${formatted} CA$`;
  }

  if (targetCurr === 'USD' || targetCurr === '$') {
    const hasDec = isNumeric && (num % 1 !== 0);
    const formatted = isNumeric ? formatNumber(num, hasDec ? 2 : 0, 2) : strAmount;
    return `${formatted} $`;
  }

  // Fallback universel
  const formatted = isNumeric ? formatNumber(num, num % 1 !== 0 ? 2 : 0, 2) : strAmount;
  return `${formatted} ${targetCurr}`;
}

/**
 * Template HTML Dark Theme Responsive pour la confirmation d'activation Pass Pro
 * Design élégant Dark Cinema avec accent Rouge Éliciné (#e50914) et hiérarchie en blocs
 */
export function getProWelcomeEmailHtml({ 
  customerName = 'Cinéphile', 
  plan = 'monthly',
  amount = null,
  currency = '',
  expiresAt = null
} = {}) {
  const planLabel = plan === 'yearly' ? 'Formule Annuelle (12 mois)' : 'Formule Mensuelle (30 jours)';
  const formattedAmount = (amount !== null && amount !== undefined && amount !== '')
    ? formatEmailCurrency(amount, currency)
    : null;
  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : (plan === 'yearly' ? '365 jours' : '30 jours');

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre Pass Pro Éliciné est activé</title>
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
      text-transform: uppercase;
      color: #e50914;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #e50914;
      background-color: rgba(229, 9, 20, 0.12);
      border: 1px solid rgba(229, 9, 20, 0.28);
      padding: 3px 9px;
      border-radius: 6px;
    }
    .title {
      font-size: 23px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 6px 0;
      letter-spacing: -0.3px;
      line-height: 1.3;
    }
    .subtitle {
      font-size: 13.5px;
      color: #a1a1aa;
      margin: 0;
    }
    .content {
      padding: 16px 32px 32px 32px;
    }
    .paragraph {
      font-size: 14.5px;
      line-height: 1.65;
      color: #d4d4d8;
      margin: 0 0 16px 0;
    }
    .receipt-box {
      background-color: #171822;
      border: 1px solid rgba(229, 9, 20, 0.22);
      border-radius: 12px;
      padding: 18px 20px;
      margin: 20px 0;
    }
    .receipt-header {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #e50914;
      margin-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding-bottom: 10px;
    }
    .receipt-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 13.5px;
    }
    .receipt-row:last-child {
      margin-bottom: 0;
    }
    .receipt-label {
      color: #a1a1aa;
    }
    .receipt-val {
      color: #ffffff;
      font-weight: 600;
    }
    .receipt-val-highlight {
      color: #ffffff;
      font-weight: 800;
      font-size: 15px;
    }
    .benefits-card {
      background-color: #171822;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 18px 20px;
      margin: 20px 0 24px 0;
    }
    .benefits-title {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #a1a1aa;
      margin-bottom: 14px;
    }
    .benefit-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 13.5px;
      color: #e4e4e7;
      line-height: 1.55;
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
        <h1 class="title">Votre Pass Pro est activé</h1>
        <p class="subtitle">Confirmation de votre souscription à Éliciné</p>
      </div>

      <div class="content">
        <p class="paragraph">Bonjour ${customerName},</p>
        <p class="paragraph">
          Votre abonnement au <strong>Pass Pro Éliciné</strong> est désormais pleinement opérationnel. Nous sommes ravis de vous compter parmi nos membres privilégiés.
        </p>

        <!-- Bloc Récapitulatif Transactionnel -->
        <div class="receipt-box">
          <div class="receipt-header">Récapitulatif de votre formule</div>
          <div class="receipt-row">
            <span class="receipt-label">Formule choisie</span>
            <span class="receipt-val">${planLabel}</span>
          </div>
          ${formattedAmount ? `
          <div class="receipt-row">
            <span class="receipt-label">Montant réglé</span>
            <span class="receipt-val-highlight">${formattedAmount}</span>
          </div>
          ` : ''}
          <div class="receipt-row">
            <span class="receipt-label">Statut</span>
            <span class="receipt-val" style="color: #4ade80;">● Actif</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Période de validité</span>
            <span class="receipt-val">Jusqu'au ${formattedExpiry}</span>
          </div>
        </div>

        <!-- Bloc Avantages Inclus (sans langage technique) -->
        <div class="benefits-card">
          <div class="benefits-title">Vos privilèges inclus :</div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Recommandations sur-mesure illimitées :</strong> Décrivez vos émotions, un souvenir de scène ou une ambiance sans restriction quotidienne de quota.</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Traitement prioritaire instantané :</strong> Analyses scénaristiques et suggestions cinématographiques immédiates.</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Filtres streaming & catalogue étendu :</strong> Ciblez directement vos plateformes favorites (Netflix, Prime Video, Canal+, Disney+, Apple TV+...).</span>
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
 * Template HTML Dark Theme Responsive pour le remerciement suite à un Don / Soutien
 * Utilise la devise réelle de la transaction (FCFA, EUR, USD, etc.) et le slogan officiel d'Éliciné
 */
export function getDonationThankYouEmailHtml({ 
  customerName = 'Généreux Donateur', 
  amount = '2',
  currency = ''
} = {}) {
  const formattedAmount = formatEmailCurrency(amount, currency);

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Merci pour votre soutien à Éliciné</title>
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
      text-transform: uppercase;
      color: #e50914;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #e50914;
      background-color: rgba(229, 9, 20, 0.12);
      border: 1px solid rgba(229, 9, 20, 0.28);
      padding: 3px 9px;
      border-radius: 6px;
    }
    .title {
      font-size: 23px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 6px 0;
      letter-spacing: -0.3px;
      line-height: 1.3;
    }
    .subtitle {
      font-size: 13.5px;
      color: #a1a1aa;
      margin: 0;
    }
    .content {
      padding: 16px 32px 32px 32px;
    }
    .paragraph {
      font-size: 14.5px;
      line-height: 1.65;
      color: #d4d4d8;
      margin: 0 0 16px 0;
    }
    .receipt-box {
      background-color: #171822;
      border: 1px solid rgba(229, 9, 20, 0.22);
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0 24px 0;
      text-align: left;
    }
    .receipt-label {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #a1a1aa;
      margin-bottom: 8px;
    }
    .receipt-amount-display {
      font-size: 26px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
      margin-bottom: 12px;
    }
    .receipt-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 13px;
    }
    .receipt-meta-item {
      color: #71717a;
    }
    .receipt-meta-status {
      color: #4ade80;
      font-weight: 600;
    }
    .cta-wrapper {
      text-align: left;
      padding: 8px 0 20px 0;
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
          <div class="brand">Éliciné</div>
          <div class="badge">Soutien Reçu</div>
        </div>
        <h1 class="title">Merci pour votre soutien</h1>
        <p class="subtitle">Votre contribution fait vivre le cinéma d'exception</p>
      </div>

      <div class="content">
        <p class="paragraph">Bonjour ${customerName},</p>
        <p class="paragraph">
          Toute l'équipe d'<strong>Éliciné</strong> vous adresse ses sincères remerciements pour votre don et votre générosité.
        </p>

        <!-- Bloc Reçu Transactionnel avec Devise Réelle -->
        <div class="receipt-box">
          <div class="receipt-label">Montant de votre contribution</div>
          <div class="receipt-amount-display">${formattedAmount}</div>
          <div class="receipt-meta">
            <span class="receipt-meta-item">Bénéficiaire : Éliciné (Plateforme Indépendante)</span>
            <span class="receipt-meta-status">● Confirmé avec succès</span>
          </div>
        </div>

        <p class="paragraph">
          Votre geste permet directement de préserver l'indépendance de notre plateforme, d'enrichir le catalogue d'œuvres cinématographiques et de maintenir l'expérience libre et accessible pour toute la communauté de passionnés.
        </p>

        <div class="cta-wrapper">
          <a href="https://elicine.app" class="cta-btn">Continuer sur Éliciné</a>
        </div>

        <p class="signature">
          Avec toute notre gratitude,<br>
          <strong style="color: #ffffff;">L'équipe Éliciné</strong>
        </p>
      </div>

      <div class="footer">
        <p class="footer-motto">Éliciné — Le cinéma d'exception, élu pour vous.</p>
        <p style="margin: 0;">Une question ou besoin d'assistance ? Contactez-nous à <a href="mailto:support@elicine.app">support@elicine.app</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Déclenche l'envoi de l'email de remerciement pour un don / soutien
 */
export async function sendDonationThankYouEmail(email, { 
  customerName = 'Généreux Donateur', 
  amount = '2',
  currency = ''
} = {}) {
  const formattedAmount = formatEmailCurrency(amount, currency);
  const html = getDonationThankYouEmailHtml({ customerName, amount, currency });

  return sendEmailWithResend({
    to: email,
    subject: 'Merci pour votre soutien à Éliciné ☕',
    html,
    text: `Bonjour ${customerName},\n\nToute l'équipe d'Éliciné vous adresse ses sincères remerciements pour votre don de ${formattedAmount}.\n\nVotre geste permet directement de préserver l'indépendance de notre plateforme, d'enrichir le catalogue d'œuvres cinématographiques et de maintenir l'expérience accessible pour toute la communauté de passionnés.\n\nContinuer sur Éliciné : https://elicine.app\n\nÉliciné — Le cinéma d'exception, élu pour vous.`
  });
}

/**
 * Déclenche l'envoi de l'email de bienvenue Pro
 */
export async function sendProWelcomeEmail(email, { 
  customerName = 'Cinéphile', 
  plan = 'monthly',
  amount = null,
  currency = '',
  expiresAt = null
} = {}) {
  const formattedAmount = (amount !== null && amount !== undefined && amount !== '') 
    ? formatEmailCurrency(amount, currency) 
    : null;
  const planLabel = plan === 'yearly' ? 'Formule Annuelle' : 'Formule Mensuelle';
  const html = getProWelcomeEmailHtml({ customerName, plan, amount, currency, expiresAt });

  return sendEmailWithResend({
    to: email,
    subject: 'Votre Pass Pro Éliciné est activé 🎬',
    html,
    text: `Bonjour ${customerName},\n\nVotre abonnement au Pass Pro Éliciné (${planLabel}${formattedAmount ? ` - ${formattedAmount}` : ''}) a bien été activé.\n\nVos avantages inclus :\n- Recommandations sur-mesure illimitées\n- Traitement prioritaire instantané\n- Filtres streaming et catalogue étendu (Netflix, Prime Video, Canal+, Disney+, Apple TV+...)\n\nAccéder à ma plateforme : https://elicine.app\n\nÉliciné — Le cinéma d'exception, élu pour vous.`
  });
}

/**
 * Template HTML Dark Theme Responsive pour la relance avant expiration du Pass Pro (J-3 ou J-1)
 * Utilise la devise réelle de renouvellement et supprime tout jargon technique
 */
export function getProRenewalReminderEmailHtml({ 
  customerName = 'Cinéphile', 
  daysRemaining = 3, 
  expiresAt = null,
  renewalUrl = 'https://elicine.app?upgrade=pro',
  amount = null,
  currency = ''
} = {}) {
  const formattedDate = expiresAt 
    ? new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'très prochainement';

  const daysLabel = daysRemaining <= 1 
    ? "demain (moins de 24h)" 
    : `dans ${daysRemaining} jours (${formattedDate})`;

  const priceFormatted = (amount !== null && amount !== undefined && amount !== '')
    ? formatEmailCurrency(amount, currency)
    : null;

  const priceText = priceFormatted ? `au tarif habituel de ${priceFormatted} / mois` : 'au tarif préférentiel habituel';
  const ctaPrice = priceFormatted ? ` (${priceFormatted})` : '';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre Pass Pro Éliciné arrive à expiration</title>
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
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-top: 3px solid #f59e0b;
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
      text-transform: uppercase;
      color: #f59e0b;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #f59e0b;
      background-color: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 3px 9px;
      border-radius: 6px;
    }
    .title {
      font-size: 23px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 6px 0;
      letter-spacing: -0.3px;
      line-height: 1.3;
    }
    .subtitle {
      font-size: 13.5px;
      color: #f59e0b;
      margin: 0;
      font-weight: 600;
    }
    .content {
      padding: 16px 32px 32px 32px;
    }
    .paragraph {
      font-size: 14.5px;
      line-height: 1.65;
      color: #d4d4d8;
      margin: 0 0 16px 0;
    }
    .countdown-box {
      background-color: #171822;
      border: 1px solid rgba(245, 158, 11, 0.22);
      border-radius: 12px;
      padding: 16px 20px;
      margin: 20px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .countdown-text {
      font-size: 13.5px;
      color: #a1a1aa;
    }
    .countdown-highlight {
      font-size: 15px;
      font-weight: 800;
      color: #f59e0b;
    }
    .benefits-card {
      background-color: #171822;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 18px 20px;
      margin: 20px 0 24px 0;
    }
    .benefits-title {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #a1a1aa;
      margin-bottom: 14px;
    }
    .benefit-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 13.5px;
      color: #e4e4e7;
      line-height: 1.55;
    }
    .benefit-item:last-child {
      margin-bottom: 0;
    }
    .benefit-bullet {
      color: #f59e0b;
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
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #000000 !important;
      font-size: 14px;
      font-weight: 800;
      text-decoration: none;
      padding: 13px 30px;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
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
          <div class="badge">Rappel d'expiration</div>
        </div>
        <h1 class="title">Votre Pass Pro arrive à terme</h1>
        <p class="subtitle">Expiration prévue ${daysLabel}</p>
      </div>

      <div class="content">
        <p class="paragraph">Bonjour ${customerName},</p>
        <p class="paragraph">
          Votre période d'abonnement au <strong>Pass Pro Éliciné</strong> arrive bientôt à son terme (${daysLabel}).
        </p>

        <p class="paragraph">
          Pour continuer à explorer sans interruption l'ensemble des sélections cinématographiques exclusives, vous pouvez renouveler votre formule dès aujourd'hui (${priceText}).
        </p>

        <div class="countdown-box">
          <span class="countdown-text">Temps restant avant expiration</span>
          <span class="countdown-highlight">J-${daysRemaining} (${formattedDate})</span>
        </div>

        <div class="benefits-card">
          <div class="benefits-title">Ce que vous conservez en renouvelant :</div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Recommandations sur-mesure 100% illimitées :</strong> Ne soyez jamais interrompu dans votre exploration de films.</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Traitement prioritaire instantané :</strong> Suggestions immédiates et affinées selon vos goûts.</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-bullet">✦</span>
            <span><strong>Filtres streaming complets :</strong> Netflix, Prime Video, Canal+, Disney+, Apple TV+, etc.</span>
          </div>
        </div>

        <div class="cta-wrapper">
          <a href="${renewalUrl}" class="cta-btn">Renouveler mon Pass Pro${ctaPrice}</a>
        </div>

        <p class="signature">
          À très vite pour de nouvelles découvertes cinématographiques,<br>
          <strong style="color: #ffffff;">L'équipe Éliciné</strong>
        </p>
      </div>

      <div class="footer">
        <p class="footer-motto">Éliciné — Le cinéma d'exception, élu pour vous.</p>
        <p style="margin: 0;">Besoin d'aide ou d'informations sur votre formule ? Contactez <a href="mailto:support@elicine.app">support@elicine.app</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Déclenche l'envoi de l'email de relance avant expiration Pro (J-3 ou J-1)
 */
export async function sendProRenewalReminderEmail(email, { 
  customerName = 'Cinéphile', 
  daysRemaining = 3, 
  expiresAt = null,
  renewalUrl = 'https://elicine.app?upgrade=pro',
  amount = null,
  currency = ''
} = {}) {
  const html = getProRenewalReminderEmailHtml({ customerName, daysRemaining, expiresAt, renewalUrl, amount, currency });
  const subject = daysRemaining <= 1
    ? '⚠️ Dernier jour : Votre Pass Pro Éliciné expire demain'
    : `🎬 Plus que ${daysRemaining} jours pour votre Pass Pro Éliciné`;

  return sendEmailWithResend({
    to: email,
    subject,
    html,
    text: `Bonjour ${customerName},\n\nVotre Pass Pro Éliciné arrive à expiration dans ${daysRemaining} jour(s).\n\nPour continuer à profiter de vos recommandations illimitées et de tous les filtres sans interruption, renouvelez votre formule en cliquant ici : ${renewalUrl}\n\nÉliciné — Le cinéma d'exception, élu pour vous.`
  });
}

/**
 * Normalise l'URL du poster TMDB pour les emails
 */
function normalizeMoviePosterUrl(poster) {
  if (!poster) return 'https://elicine.app/icons/icon-512x512.png';
  if (poster.startsWith('http')) return poster;
  return `https://image.tmdb.org/t/p/w500${poster.startsWith('/') ? '' : '/'}${poster}`;
}

/**
 * Formate une date en français pour les emails d'alerte
 */
function formatMovieReleaseDate(dateStr) {
  if (!dateStr) return 'Prochainement';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Template HTML Dark Theme Responsive pour l'alerte J-2 avant la sortie d'un film/série
 */
export function getMovieAlertJMinus2EmailHtml({ 
  customerName = 'Cinéphile',
  movieTitle = 'Film à venir',
  moviePoster = null,
  releaseDate = null,
  movieId = '',
  mediaType = 'movie',
  overview = ''
} = {}) {
  const formattedDate = formatMovieReleaseDate(releaseDate);
  const posterUrl = normalizeMoviePosterUrl(moviePoster);
  const movieUrl = movieId ? `https://elicine.app?movie=${movieId}` : 'https://elicine.app';
  const typeLabel = (mediaType === 'tv' || mediaType === 'SÉRIE') ? 'cette série' : 'ce film';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerte Sortie J-2 : ${movieTitle}</title>
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
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-top: 3px solid #f59e0b;
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
      text-transform: uppercase;
      color: #f59e0b;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #f59e0b;
      background-color: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 3px 9px;
      border-radius: 6px;
    }
    .title {
      font-size: 23px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 6px 0;
      letter-spacing: -0.3px;
      line-height: 1.3;
    }
    .subtitle {
      font-size: 14px;
      color: #f59e0b;
      margin: 0;
      font-weight: 600;
    }
    .content {
      padding: 16px 32px 32px 32px;
    }
    .paragraph {
      font-size: 14.5px;
      line-height: 1.65;
      color: #d4d4d8;
      margin: 0 0 16px 0;
    }
    .movie-card {
      background-color: #171822;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 18px;
      margin: 20px 0;
      display: flex;
      gap: 16px;
    }
    .movie-poster {
      width: 100px;
      height: 145px;
      object-fit: cover;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      flex-shrink: 0;
    }
    .movie-info {
      flex: 1;
      min-width: 0;
    }
    .movie-title {
      font-size: 17px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 6px 0;
      line-height: 1.3;
    }
    .movie-date {
      font-size: 12.5px;
      color: #f59e0b;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .movie-overview {
      font-size: 12px;
      color: #a1a1aa;
      line-height: 1.5;
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .countdown-banner {
      background-color: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.2);
      border-radius: 10px;
      padding: 12px 16px;
      margin: 16px 0 24px 0;
      font-size: 13px;
      color: #fbbf24;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cta-wrapper {
      text-align: left;
      padding: 8px 0 20px 0;
    }
    .cta-btn {
      display: inline-block;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #000000 !important;
      font-size: 14px;
      font-weight: 800;
      text-decoration: none;
      padding: 13px 30px;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
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
          <div class="badge">Alerte Sortie • J-2</div>
        </div>
        <h1 class="title">Préparez vos popcorns !</h1>
        <p class="subtitle">Sortie dans 2 jours : ${formattedDate}</p>
      </div>

      <div class="content">
        <p class="paragraph">Bonjour ${customerName},</p>
        <p class="paragraph">
          En tant que membre privilégié du <strong>Pass Pro Éliciné</strong>, vous avez activé le suivi de ${typeLabel} très attendu(e) :
        </p>

        <!-- Carte Film -->
        <div class="movie-card">
          <img src="${posterUrl}" alt="${movieTitle}" class="movie-poster" />
          <div class="movie-info">
            <h2 class="movie-title">${movieTitle}</h2>
            <div class="movie-date">✦ Sortie officielle le ${formattedDate}</div>
            ${overview ? `<p class="movie-overview">${overview}</p>` : ''}
          </div>
        </div>

        <div class="countdown-banner">
          🍿 Plus que 48 heures avant la sortie officielle ! Vous recevrez une nouvelle alerte le jour J dès sa mise à disposition.
        </div>

        <div class="cta-wrapper">
          <a href="${movieUrl}" class="cta-btn">Voir la fiche sur Éliciné</a>
        </div>

        <p class="signature">
          À très vite pour cette grande sortie,<br>
          <strong style="color: #ffffff;">L'équipe Éliciné</strong>
        </p>
      </div>

      <div class="footer">
        <p class="footer-motto">Éliciné — Le cinéma d'exception, élu pour vous.</p>
        <p style="margin: 0;">Alerte exclusive réservée aux membres actifs du Pass Pro Éliciné. Besoin d'aide ? <a href="mailto:support@elicine.app">support@elicine.app</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Template HTML Dark Theme Responsive pour l'alerte Jour J (Jour de la sortie)
 */
export function getMovieAlertReleaseDayEmailHtml({ 
  customerName = 'Cinéphile',
  movieTitle = 'Film du jour',
  moviePoster = null,
  releaseDate = null,
  movieId = '',
  mediaType = 'movie',
  overview = ''
} = {}) {
  const formattedDate = formatMovieReleaseDate(releaseDate);
  const posterUrl = normalizeMoviePosterUrl(moviePoster);
  const movieUrl = movieId ? `https://elicine.app?movie=${movieId}` : 'https://elicine.app';
  const typeLabel = (mediaType === 'tv' || mediaType === 'SÉRIE') ? 'la série' : 'le film';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jour J : ${movieTitle} est disponible !</title>
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
      border: 1px solid rgba(229, 9, 20, 0.3);
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
      text-transform: uppercase;
      color: #e50914;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #4ade80;
      background-color: rgba(74, 222, 128, 0.12);
      border: 1px solid rgba(74, 222, 128, 0.3);
      padding: 3px 9px;
      border-radius: 6px;
    }
    .title {
      font-size: 23px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 6px 0;
      letter-spacing: -0.3px;
      line-height: 1.3;
    }
    .subtitle {
      font-size: 14px;
      color: #e50914;
      margin: 0;
      font-weight: 600;
    }
    .content {
      padding: 16px 32px 32px 32px;
    }
    .paragraph {
      font-size: 14.5px;
      line-height: 1.65;
      color: #d4d4d8;
      margin: 0 0 16px 0;
    }
    .movie-card {
      background-color: #171822;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 18px;
      margin: 20px 0;
      display: flex;
      gap: 16px;
    }
    .movie-poster {
      width: 100px;
      height: 145px;
      object-fit: cover;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      flex-shrink: 0;
    }
    .movie-info {
      flex: 1;
      min-width: 0;
    }
    .movie-title {
      font-size: 17px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 6px 0;
      line-height: 1.3;
    }
    .movie-status {
      font-size: 12.5px;
      color: #4ade80;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .movie-overview {
      font-size: 12px;
      color: #a1a1aa;
      line-height: 1.5;
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .release-banner {
      background-color: rgba(74, 222, 128, 0.08);
      border: 1px solid rgba(74, 222, 128, 0.2);
      border-radius: 10px;
      padding: 12px 16px;
      margin: 16px 0 24px 0;
      font-size: 13px;
      color: #4ade80;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cta-wrapper {
      text-align: left;
      padding: 8px 0 20px 0;
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
          <div class="badge">Jour J • Disponible</div>
        </div>
        <h1 class="title">C'est le grand jour !</h1>
        <p class="subtitle">« ${movieTitle} » est officiellement disponible</p>
      </div>

      <div class="content">
        <p class="paragraph">Bonjour ${customerName},</p>
        <p class="paragraph">
          L'attente est enfin terminée ! Comme convenu avec votre alerte <strong>Pass Pro Éliciné</strong>, nous avons le plaisir de vous informer que ${typeLabel} <strong>« ${movieTitle} »</strong> sort officiellement aujourd'hui (${formattedDate}).
        </p>

        <!-- Carte Film -->
        <div class="movie-card">
          <img src="${posterUrl}" alt="${movieTitle}" class="movie-poster" />
          <div class="movie-info">
            <h2 class="movie-title">${movieTitle}</h2>
            <div class="movie-status">● Disponible dès aujourd'hui</div>
            ${overview ? `<p class="movie-overview">${overview}</p>` : ''}
          </div>
        </div>

        <div class="release-banner">
          🎬 Retrouvez toutes les disponibilités de streaming, bandes-annonces et détails directement sur votre plateforme.
        </div>

        <div class="cta-wrapper">
          <a href="${movieUrl}" class="cta-btn">Découvrir sur Éliciné</a>
        </div>

        <p class="signature">
          Nous vous souhaitons un excellent visionnage,<br>
          <strong style="color: #ffffff;">L'équipe Éliciné</strong>
        </p>
      </div>

      <div class="footer">
        <p class="footer-motto">Éliciné — Le cinéma d'exception, élu pour vous.</p>
        <p style="margin: 0;">Alerte exclusive réservée aux membres actifs du Pass Pro Éliciné. Besoin d'aide ? <a href="mailto:support@elicine.app">support@elicine.app</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Déclenche l'envoi de l'email d'alerte J-2 avant la sortie d'un film ou d'une série
 */
export async function sendMovieAlertJMinus2Email(email, {
  customerName = 'Cinéphile',
  movieTitle = 'Film à venir',
  moviePoster = null,
  releaseDate = null,
  movieId = '',
  mediaType = 'movie',
  overview = ''
} = {}) {
  const html = getMovieAlertJMinus2EmailHtml({
    customerName,
    movieTitle,
    moviePoster,
    releaseDate,
    movieId,
    mediaType,
    overview
  });

  return sendEmailWithResend({
    to: email,
    subject: `🍿 Plus que 2 jours : « ${movieTitle} » sort très bientôt !`,
    html,
    text: `Bonjour ${customerName},\n\nPréparez vos popcorns ! Le film ou la série « ${movieTitle} » que vous suivez sur Éliciné Pro sort officiellement dans 2 jours (${formatMovieReleaseDate(releaseDate)}).\n\nDécouvrir sur Éliciné : https://elicine.app?movie=${movieId}\n\nÉliciné — Le cinéma d'exception, élu pour vous.`
  });
}

/**
 * Déclenche l'envoi de l'email d'alerte le Jour J de la sortie d'un film ou d'une série
 */
export async function sendMovieAlertReleaseDayEmail(email, {
  customerName = 'Cinéphile',
  movieTitle = 'Film du jour',
  moviePoster = null,
  releaseDate = null,
  movieId = '',
  mediaType = 'movie',
  overview = ''
} = {}) {
  const html = getMovieAlertReleaseDayEmailHtml({
    customerName,
    movieTitle,
    moviePoster,
    releaseDate,
    movieId,
    mediaType,
    overview
  });

  return sendEmailWithResend({
    to: email,
    subject: `🎬 C'est le jour J ! « ${movieTitle} » est disponible dès aujourd'hui`,
    html,
    text: `Bonjour ${customerName},\n\nL'attente est terminée ! Le film ou la série « ${movieTitle} » que vous suivez sur Éliciné Pro est officiellement disponible dès aujourd'hui (${formatMovieReleaseDate(releaseDate)}).\n\nAccéder au film sur Éliciné : https://elicine.app?movie=${movieId}\n\nÉliciné — Le cinéma d'exception, élu pour vous.`
  });
}

