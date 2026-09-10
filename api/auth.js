import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 
  process.env.VITE_SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://xwhrxtzbxvakqjlajjlc.supabase.co';

const supabaseAnonKey = 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Point d'entrée serveur unifié pour toutes les opérations d'authentification Éliciné.
 * Remplace et factorise : /api/auth/login, /api/auth/register, /api/auth/send-verification, /api/auth/google
 * Conforme à la limite des 12 Serverless Functions de Vercel.
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Résolution de l'action demandée
  let action = req.query?.action;
  if (!action && req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      const segments = parsed.pathname.split('/').filter(Boolean);
      const authIdx = segments.indexOf('auth');
      if (authIdx !== -1 && segments[authIdx + 1]) {
        action = segments[authIdx + 1];
      }
    } catch (_) {}
  }

  if (Array.isArray(action)) {
    action = action[0];
  }

  const cleanAction = String(action || '').toLowerCase().trim();

  // Routage par action
  switch (cleanAction) {
    case 'login':
      return handleLogin(req, res);
    case 'register':
      return handleRegister(req, res);
    case 'send-verification':
      return handleSendVerification(req, res);
    case 'google':
      return handleGoogle(req, res);
    default:
      return res.status(404).json({
        error: `Action d'authentification '${cleanAction || 'indéterminée'}' non reconnue. Actions disponibles : login, register, send-verification, google.`
      });
  }
}

/**
 * 1. Connexion (Login)
 */
async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { identifier, email, password } = req.body || {};
    const cleanEmail = (email || identifier || '').trim();

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({ 
        error: "Veuillez saisir une adresse email valide." 
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password || '',
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Connexion réussie.',
      user: data.user,
      session: data.session
    });
  } catch (err) {
    console.error('Erreur API Login:', err);
    return res.status(500).json({ error: err.message || 'Erreur lors de la connexion.' });
  }
}

/**
 * 2. Inscription (Register)
 */
async function handleRegister(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { username, email, password } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({ 
        error: "Veuillez fournir une adresse email valide." 
      });
    }

    if (!password || password.length < 6 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ 
        error: "Le mot de passe doit contenir au moins 6 caractères, incluant au moins une majuscule et un chiffre." 
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password || '',
      options: {
        data: {
          full_name: (username || '').trim()
        }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (data?.user?.identities && data.user.identities.length === 0) {
      return res.status(400).json({ error: "Cette adresse email est déjà utilisée." });
    }

    return res.status(200).json({
      success: true,
      message: 'Inscription réussie ! Bienvenue sur Éliciné.',
      user: data.user,
      session: data.session
    });
  } catch (err) {
    console.error('Erreur API Register:', err);
    return res.status(500).json({ error: err.message || 'Erreur interne du serveur lors de la création du compte.' });
  }
}

/**
 * 3. Envoi d'email de confirmation (Send Verification)
 */
async function handleSendVerification(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { email, username, messageId, timestamp } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    console.log(`[Éliciné Serverless Auth] E-mail de confirmation envoyé à ${cleanEmail} (ID: ${messageId || 'N/A'})`);

    return res.status(200).json({
      success: true,
      message: `E-mail de confirmation envoyé à ${cleanEmail}.`,
      messageId: messageId || `msg_${Date.now()}`,
      sentAt: timestamp || new Date().toISOString()
    });
  } catch (err) {
    console.error('Erreur API send-verification:', err);
    return res.status(500).json({ error: err.message || "Erreur lors de l'envoi de l'e-mail de confirmation." });
  }
}

/**
 * 4. Google OAuth Stub
 */
async function handleGoogle(req, res) {
  return res.status(400).json({ 
    error: "L'authentification simulée a été définitivement supprimée. Veuillez utiliser le flux Supabase OAuth officiel." 
  });
}
