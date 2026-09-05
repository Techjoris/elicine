import crypto from 'node:crypto';

// In-memory user store for serverless runtime instance
const runtimeUsers = new Map();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

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
    const { username, email, password } = req.body || {};

    const cleanUsername = (username || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = typeof password === 'string' ? password : '';

    // Identifier validation
    if (!cleanUsername && !cleanEmail) {
      return res.status(400).json({ 
        error: "Veuillez fournir une adresse email ou un nom d'utilisateur." 
      });
    }

    // Flexible Netflix-style password validation: min 4, max 60 characters
    if (cleanPassword.length < 4 || cleanPassword.length > 60) {
      return res.status(400).json({ 
        error: 'Le mot de passe doit contenir entre 4 et 60 caractères.' 
      });
    }

    // Generate Salt & Hash
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(cleanPassword, salt);
    const token = crypto.randomBytes(32).toString('hex');

    const displayName = cleanUsername || cleanEmail.split('@')[0] || 'Cinéphile';
    const finalEmail = cleanEmail || `${cleanUsername.toLowerCase()}@elicine.app`;
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const referralCode = `CINE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const newUser = {
      id: userId,
      username: cleanUsername || cleanEmail.split('@')[0],
      email: finalEmail,
      name: displayName,
      isPro: false,
      referralCode,
      createdAt: new Date().toISOString(),
      myList: []
    };

    // Store in runtime cache
    runtimeUsers.set(finalEmail, { ...newUser, salt, passwordHash });
    if (cleanUsername) {
      runtimeUsers.set(cleanUsername.toLowerCase(), { ...newUser, salt, passwordHash });
    }

    return res.status(200).json({
      success: true,
      message: 'Inscription réussie ! Bienvenue sur Éliciné.',
      token,
      user: newUser
    });
  } catch (err) {
    console.error('Erreur API Register:', err);
    return res.status(500).json({ error: 'Erreur interne du serveur lors de la création du compte.' });
  }
}
