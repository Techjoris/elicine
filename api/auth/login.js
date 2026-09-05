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
    const { identifier, password } = req.body || {};

    const cleanIdentifier = (identifier || '').trim();
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!cleanIdentifier) {
      return res.status(400).json({ 
        error: "Veuillez saisir votre adresse email ou nom d'utilisateur." 
      });
    }

    if (cleanPassword.length < 4 || cleanPassword.length > 60) {
      return res.status(400).json({ 
        error: 'Le mot de passe doit contenir entre 4 et 60 caractères.' 
      });
    }

    const isEmail = cleanIdentifier.includes('@');
    const username = isEmail ? cleanIdentifier.split('@')[0] : cleanIdentifier;
    const email = isEmail ? cleanIdentifier.toLowerCase() : `${cleanIdentifier.toLowerCase()}@elicine.app`;
    const displayName = username.charAt(0).toUpperCase() + username.slice(1);

    // Generate session token
    const token = crypto.randomBytes(32).toString('hex');
    const referralCode = `CINE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Return user profile
    const userProfile = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      username,
      email,
      name: displayName,
      isPro: false,
      referralCode,
      createdAt: new Date().toISOString(),
      myList: []
    };

    return res.status(200).json({
      success: true,
      message: `Connexion réussie. Bon retour, ${displayName} !`,
      token,
      user: userProfile
    });
  } catch (err) {
    console.error('Erreur API Login:', err);
    return res.status(500).json({ error: 'Erreur lors de la connexion.' });
  }
}
