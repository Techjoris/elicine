export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Suppression totale du simulateur de connexion Google mock
  return res.status(400).json({ 
    error: "L'authentification simulée a été définitivement supprimée. Veuillez utiliser le flux Supabase OAuth officiel." 
  });
}
