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
    const cleanEmail = (email || '').trim().toLowerCase();

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({ 
        error: "Veuillez fournir une adresse email valide." 
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
