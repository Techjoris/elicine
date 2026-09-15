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
      console.error('Erreur critique Resend lors du don:', data.error);
      return { success: false, error: data.error };
    }

    console.log('E-mail de remerciement envoyé avec succès:', data);
    return { success: true, data: data.data || data };
  } catch (error) {
    console.error('Erreur critique Resend lors du don:', error);
    return { success: false, error: error?.message || error };
  }
}

/**
 * Template HTML Dark Theme Responsive pour la confirmation d'activation Pass Pro (Minimaliste & Épuré)
 */
export function getProWelcomeEmailHtml({ customerName = 'Cinéphile', plan = 'monthly' }) {
  const planLabel = plan === 'yearly' ? 'Formule Annuelle' : 'Formule Mensuelle';

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
      background-color: #121215;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    }
    .header {
      padding: 32px 32px 16px 32px;
      text-align: left;
    }
    .brand {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #e50914;
      margin-bottom: 8px;
    }
    .title {
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 4px 0;
      letter-spacing: -0.3px;
    }
    .subtitle {
      font-size: 13px;
      color: #71717a;
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
    .benefits-card {
      background-color: #18181c;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 18px 20px;
      margin: 20px 0 24px 0;
    }
    .benefits-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #a1a1aa;
      margin-bottom: 12px;
    }
    .benefit-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 10px;
      font-size: 13.5px;
      color: #e4e4e7;
      line-height: 1.5;
    }
    .benefit-item:last-child {
      margin-bottom: 0;
    }
    .benefit-bullet {
      color: #e50914;
      font-weight: bold;
      margin-right: 10px;
      line-height: 1.4;
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
      padding: 12px 28px;
      border-radius: 8px;
    }
    .signature {
      font-size: 13.5px;
      color: #a1a1aa;
      margin: 20px 0 0 0;
      line-height: 1.6;
    }
    .footer {
      padding: 18px 32px;
      background-color: #0c0c0e;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      text-align: left;
      font-size: 12px;
      color: #71717a;
      line-height: 1.5;
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
        <div class="brand">Éliciné Pro</div>
        <h1 class="title">Votre Pass Pro est activé</h1>
        <p class="subtitle">Confirmation d'abonnement (${planLabel})</p>
      </div>

      <div class="content">
        <p class="paragraph">Bonjour ${customerName},</p>
        <p class="paragraph">
          Votre abonnement au <strong>Pass Pro Éliciné</strong> a bien été activé.
        </p>

        <div class="benefits-card">
          <div class="benefits-title">Vos avantages inclus :</div>
          <div class="benefit-item">
            <span class="benefit-bullet">•</span>
            <span><strong>Recherches & recommandations IA illimitées :</strong> Décrivez n'importe quelle émotion, scène ou thème sans aucune restriction.</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-bullet">•</span>
            <span><strong>Traitement prioritaire :</strong> Recommandations cinématographiques ultra-rapides et personnalisées.</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-bullet">•</span>
            <span><strong>Filtres streaming & catalogue étendu :</strong> Ciblez directement vos plateformes favorites (Netflix, Prime Video, Canal+, Disney+, Apple TV+).</span>
          </div>
        </div>

        <div class="cta-wrapper">
          <a href="https://elicine.app" class="cta-btn">Accéder à ma plateforme</a>
        </div>

        <p class="signature">
          L'équipe Éliciné — L'intelligence artificielle au service du cinéma d'exception.
        </p>
      </div>

      <div class="footer">
        <p style="margin: 0;">Besoin d'assistance ? Contactez notre support à <a href="mailto:support@elicine.app">support@elicine.app</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Template HTML Dark Theme Responsive pour le remerciement suite à un Don / Soutien
 */
export function getDonationThankYouEmailHtml({ customerName = 'Généreux Donateur', amount = '2' }) {
  const formattedAmount = typeof amount === 'string' && (amount.includes('$') || amount.includes('FCFA') || amount.includes('€'))
    ? amount
    : `${amount} $`;

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
      background-color: #070709;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #070709;
      padding: 40px 16px;
    }
    .container {
      max-width: 560px;
      margin: 0 auto;
      background-color: #121214;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
    }
    .header {
      padding: 36px 32px 16px 32px;
      text-align: left;
    }
    .brand {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #e50914;
      margin-bottom: 8px;
    }
    .title {
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      margin: 0;
      letter-spacing: -0.3px;
    }
    .content {
      padding: 16px 32px 32px 32px;
    }
    .paragraph {
      font-size: 14.5px;
      line-height: 1.65;
      color: #d4d4d8;
      margin: 0 0 18px 0;
    }
    .cta-wrapper {
      text-align: left;
      padding: 12px 0 8px 0;
    }
    .cta-btn {
      display: inline-block;
      background-color: #e50914;
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 10px;
    }
    .footer {
      padding: 20px 32px;
      background-color: #0c0c0e;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      text-align: left;
      font-size: 12px;
      color: #71717a;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="brand">Éliciné</div>
        <h1 class="title">Merci pour votre soutien</h1>
      </div>
      <div class="content">
        <p class="paragraph">Bonjour ${customerName},</p>
        <p class="paragraph">
          Toute l'équipe d'<strong>Éliciné</strong> vous adresse ses sincères remerciements pour votre don de <strong>${formattedAmount}</strong>.
        </p>
        <p class="paragraph">
          Votre contribution aide directement à financer nos serveurs d'intelligence artificielle, à enrichir le catalogue de films et à maintenir la plateforme libre d'accès pour toute la communauté de passionnés.
        </p>
        <div class="cta-wrapper">
          <a href="https://elicine.app" class="cta-btn">Continuer sur Éliciné</a>
        </div>
      </div>
      <div class="footer">
        <p style="margin: 0;">Éliciné — L'intelligence artificielle au service du cinéma d'exception.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Déclenche l'envoi de l'email de bienvenue Pro
 */
export async function sendProWelcomeEmail(email, { customerName = 'Cinéphile', plan = 'monthly' } = {}) {
  const html = getProWelcomeEmailHtml({ customerName, plan });
  return sendEmailWithResend({
    to: email,
    subject: 'Votre Pass Pro Éliciné est activé 🎬',
    html,
    text: `Bonjour ${customerName},\n\nVotre abonnement au Pass Pro Éliciné a bien été activé.\n\nVos avantages inclus :\n- Recherches et recommandations IA illimitées\n- Traitement prioritaire de vos requêtes\n- Filtres streaming et catalogue étendu (Netflix, Prime Video, Canal+, Disney+, Apple TV+...)\n\nAccéder à ma plateforme : https://elicine.app\n\nL'équipe Éliciné — L'intelligence artificielle au service du cinéma d'exception.`
  });
}

/**
 * Déclenche l'envoi de l'email de remerciement pour un don
 */
export async function sendDonationThankYouEmail(email, { customerName, amount = '2' } = {}) {
  const html = getDonationThankYouEmailHtml({ customerName, amount });
  return sendEmailWithResend({
    to: email,
    subject: 'Un immense merci pour votre soutien à Éliciné ! 🎬',
    html,
    text: `Un immense merci pour votre soutien à Éliciné ! Votre don de ${amount} permet de financer les serveurs et le développement continu de la plateforme. Rendez-vous sur https://elicine.app`
  });
}
