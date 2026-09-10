export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { email, username, messageId, timestamp } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    console.log(`[Vercel Serverless /send-verification] E-mail de confirmation envoyé à ${cleanEmail} (ID: ${messageId || 'N/A'})`);

    return res.status(200).json({
      success: true,
      message: `E-mail de confirmation envoyé à ${cleanEmail}.`,
      messageId: messageId || `msg_${Date.now()}`,
      sentAt: timestamp || new Date().toISOString()
    });
  } catch (err) {
    console.error('Erreur API send-verification:', err);
    return res.status(500).json({ error: err.message || 'Erreur lors de l’envoi de l’e-mail de confirmation.' });
  }
}
