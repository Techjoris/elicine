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
      max-width: 580px;
      margin: 0 auto;
      background-color: #121214;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
    }
    .header {
      padding: 36px 32px 24px 32px;
      text-align: center;
      background: linear-gradient(180deg, rgba(229, 9, 20, 0.15) 0%, rgba(18, 18, 20, 0) 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: rgba(229, 9, 20, 0.2);
      border: 1px solid rgba(229, 9, 20, 0.4);
      border-radius: 16px;
      font-size: 26px;
      margin-bottom: 16px;
    }
    .title {
      font-size: 26px;
      font-weight: 900;
      color: #ffffff;
      margin: 0 0 8px 0;
      letter-spacing: -0.5px;
    }
    .subtitle {
      font-size: 14px;
      color: #a1a1aa;
      margin: 0;
    }
    .content {
      padding: 32px;
    }
    .greeting {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 16px 0;
    }
    .paragraph {
      font-size: 14px;
      line-height: 1.6;
      color: #d4d4d8;
      margin: 0 0 24px 0;
    }
    .features-card {
      background-color: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 28px;
    }
    .features-header {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #f59e0b;
      margin-bottom: 14px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 13.5px;
      color: #e4e4e7;
      line-height: 1.5;
    }
    .feature-item:last-child {
      margin-bottom: 0;
    }
    .feature-icon {
      margin-right: 10px;
      flex-shrink: 0;
    }
    .cta-wrapper {
      text-align: center;
      padding: 8px 0 16px 0;
    }
    .cta-btn {
      display: inline-block;
      background-color: #e50914;
      color: #ffffff !important;
      font-size: 15px;
      font-weight: 800;
      text-decoration: none;
      padding: 16px 36px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(229, 9, 20, 0.4);
    }
    .footer {
      padding: 24px 32px;
      background-color: #0c0c0e;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      text-align: center;
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
        <div class="logo-badge">👑</div>
        <h1 class="title">Bienvenue dans Éliciné Pro !</h1>
        <p class="subtitle">Votre compte est activé avec succès (${planLabel})</p>
      </div>

      <div class="content">
        <p class="greeting">Bonjour ${customerName},</p>
        <p class="paragraph">
          Félicitations ! Votre abonnement <strong>Éliciné Pro</strong> est officiellement actif. Vous bénéficiez dès maintenant d'un accès sans aucune restriction à l'algorithme d'intelligence artificielle cinématographique le plus performant.
        </p>

        <div class="features-card">
          <div class="features-header">Vos privilèges cinéphiles exclusifs :</div>
          <div class="feature-item">
            <span class="feature-icon">⚡</span>
            <span><strong>Recherches IA illimitées :</strong> Décrivez n'importe quelle ambiance, émotion ou souvenir de film sans jamais être limité.</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🎬</span>
            <span><strong>Filtres streaming avancés :</strong> Ciblez directement vos plateformes favorites (Netflix, Prime, Canal+, Disney+, Apple TV...).</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">⭐</span>
            <span><strong>Notes critiques sur-mesure :</strong> Filtrez par notes minimales pour dénicher uniquement des chefs-d'œuvre.</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">📱</span>
            <span><strong>Mode autonome plein écran (PWA) :</strong> Installez Éliciné sur votre écran d'accueil sans barres de navigateur pour une immersion totale.</span>
          </div>
        </div>

        <div class="cta-wrapper">
          <a href="https://elicine.app" class="cta-btn">Accéder à mon compte sur elicine.app</a>
        </div>

        <p class="paragraph" style="font-size: 12.5px; color: #71717a; text-align: center; margin-top: 16px;">
          Si vous n'êtes pas encore connecté sur votre appareil, connectez-vous avec cette même adresse email pour profiter instantanément de vos privilèges Pro.
        </p>
      </div>

      <div class="footer">
        <p style="margin: 0 0 8px 0;"><strong>Éliciné</strong> — Le cinéma d'exception, élu pour vous.</p>
        <p style="margin: 0;">Besoin d'aide ? Contactez notre support à <a href="mailto:contact@elicine.app">contact@elicine.app</a></p>
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
export function getDonationThankYouEmailHtml({ customerName = 'Généreux Ami', amount = '2' }) {
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
    }
    .wrapper {
      width: 100%;
      background-color: #070709;
      padding: 40px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #121214;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      overflow: hidden;
    }
    .header {
      padding: 36px 32px 24px 32px;
      text-align: center;
      background: linear-gradient(180deg, rgba(245, 158, 11, 0.15) 0%, rgba(18, 18, 20, 0) 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: rgba(245, 158, 11, 0.2);
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 16px;
      font-size: 26px;
      margin-bottom: 16px;
    }
    .title {
      font-size: 24px;
      font-weight: 900;
      color: #ffffff;
      margin: 0 0 8px 0;
    }
    .content {
      padding: 32px;
    }
    .paragraph {
      font-size: 14px;
      line-height: 1.6;
      color: #d4d4d8;
      margin: 0 0 20px 0;
    }
    .cta-wrapper {
      text-align: center;
      padding: 12px 0;
    }
    .cta-btn {
      display: inline-block;
      background-color: #e50914;
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 800;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 12px;
    }
    .footer {
      padding: 24px 32px;
      background-color: #0c0c0e;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      text-align: center;
      font-size: 12px;
      color: #71717a;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-badge">❤️</div>
        <h1 class="title">Merci infiniment pour votre soutien !</h1>
      </div>
      <div class="content">
        <p class="paragraph">Bonjour ${customerName},</p>
        <p class="paragraph">
          Toute l'équipe d'<strong>Éliciné</strong> vous adresse ses plus chaleureux remerciements pour votre don de <strong>${amount} $</strong>.
        </p>
        <p class="paragraph">
          Votre générosité contribue directement à financer nos serveurs d'intelligence artificielle, à enrichir le catalogue de films indépendants et à maintenir la plateforme accessible à tous les passionnés du 7ème art.
        </p>
        <div class="cta-wrapper">
          <a href="https://elicine.app" class="cta-btn">Continuer à explorer sur Éliciné</a>
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
    subject: '❤️ Merci pour votre précieux soutien à Éliciné !',
    html,
    text: `Merci pour votre don à Éliciné ! Votre soutien permet de financer les serveurs et le développement continu de la plateforme. Rendez-vous sur https://elicine.app`
  });
}
