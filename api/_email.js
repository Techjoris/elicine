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
 * Template HTML Dark Theme Responsive pour la bienvenue Éliciné Pro
 */
export function getProWelcomeEmailHtml({ customerName = 'Cinéphile', plan = 'monthly' }) {
  const planLabel = plan === 'yearly' ? 'Pass Pro Annuel' : 'Pass Pro Mensuel';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue dans Éliciné Pro</title>
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
      margin: 0 0 4px 0;
      letter-spacing: -0.3px;
    }
    .subtitle {
      font-size: 13px;
      color: #a1a1aa;
      margin: 0;
    }
    .content {
      padding: 16px 32px 32px 32px;
    }
    .greeting {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 14px 0;
    }
    .paragraph {
      font-size: 14.5px;
      line-height: 1.65;
      color: #d4d4d8;
      margin: 0 0 20px 0;
    }
    .features-card {
      background-color: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .features-header {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #f59e0b;
      margin-bottom: 12px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 10px;
      font-size: 13.5px;
      color: #e4e4e7;
      line-height: 1.5;
    }
    .feature-item:last-child {
      margin-bottom: 0;
    }
    .feature-dot {
      color: #e50914;
      margin-right: 10px;
      font-weight: bold;
    }
    .cta-wrapper {
      text-align: left;
      padding: 8px 0 16px 0;
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
        <h1 class="title">Bienvenue dans Éliciné Pro</h1>
        <p class="subtitle">Votre compte est activé avec succès (${planLabel})</p>
      </div>

      <div class="content">
        <p class="greeting">Bonjour ${customerName},</p>
        <p class="paragraph">
          Votre abonnement <strong>Éliciné Pro</strong> est désormais actif. Vous bénéficiez d'un accès sans restriction à l'ensemble des fonctionnalités et de l'intelligence artificielle d'Éliciné.
        </p>

        <div class="features-card">
          <div class="features-header">Vos privilèges Pro inclus :</div>
          <div class="feature-item">
            <span class="feature-dot">•</span>
            <span><strong>Recherches IA illimitées :</strong> Décrivez toute ambiance, émotion ou souvenir de film sans restriction.</span>
          </div>
          <div class="feature-item">
            <span class="feature-dot">•</span>
            <span><strong>Filtres streaming complets :</strong> Ciblez directement vos plateformes favorites (Netflix, Prime Video, Disney+, Canal+, Apple TV+).</span>
          </div>
          <div class="feature-item">
            <span class="feature-dot">•</span>
            <span><strong>Notes critiques sur-mesure :</strong> Filtrez les pépites selon vos exigences de notation.</span>
          </div>
          <div class="feature-item">
            <span class="feature-dot">•</span>
            <span><strong>Mode autonome plein écran :</strong> Installation sur écran d'accueil sans interface de navigateur.</span>
          </div>
        </div>

        <div class="cta-wrapper">
          <a href="https://elicine.app" class="cta-btn">Accéder à Éliciné Pro</a>
        </div>
      </div>

      <div class="footer">
        <p style="margin: 0 0 6px 0;"><strong>Éliciné</strong> — Le cinéma d'exception, élu pour vous.</p>
        <p style="margin: 0;">Besoin d'aide ? Contactez notre équipe à <a href="mailto:support@elicine.app">support@elicine.app</a></p>
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
export async function sendProWelcomeEmail(email, { customerName, plan = 'monthly' } = {}) {
  const html = getProWelcomeEmailHtml({ customerName, plan });
  return sendEmailWithResend({
    to: email,
    subject: '👑 Bienvenue dans Éliciné Pro ! Vos avantages sont activés',
    html,
    text: `Bienvenue dans Éliciné Pro ! Votre compte est activé avec succès. Rendez-vous sur https://elicine.app pour profiter de vos recherches IA illimitées.`
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
