import crypto from 'node:crypto';

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
    const { email, name, avatar } = req.body || {};

    const cleanEmail = (email || 'cinéphile.google@gmail.com').trim().toLowerCase();
    const cleanName = (name || 'Cinéphile Google').trim();
    const cleanAvatar = avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80';
    const username = cleanEmail.split('@')[0];

    const token = crypto.randomBytes(32).toString('hex');
    const referralCode = `CINE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const userProfile = {
      id: `usr_google_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      username,
      email: cleanEmail,
      name: cleanName,
      avatar: cleanAvatar,
      provider: 'google',
      isPro: false,
      referralCode,
      createdAt: new Date().toISOString(),
      myList: []
    };

    return res.status(200).json({
      success: true,
      message: `Connexion Google réussie. Bienvenue, ${cleanName} !`,
      token,
      user: userProfile
    });
  } catch (err) {
    console.error('Erreur API Google Auth:', err);
    return res.status(500).json({ error: 'Erreur lors de la connexion avec Google.' });
  }
}
