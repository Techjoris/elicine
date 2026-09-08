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
      message: `Connexion réussie.`,
      user: data.user,
      session: data.session
    });
  } catch (err) {
    console.error('Erreur API Login:', err);
    return res.status(500).json({ error: err.message || 'Erreur lors de la connexion.' });
  }
}
