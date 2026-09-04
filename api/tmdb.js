export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const apiKey = req.query.api_key || process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé serveur TMDB manquante' });
  }

  const { endpoint, ...params } = req.query;
  if (!endpoint) {
    return res.status(400).json({ error: 'Paramètre endpoint manquant' });
  }

  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k !== 'endpoint' && k !== 'api_key' && v !== undefined && v !== null && v !== '') {
      searchParams.set(k, String(v));
    }
  }

  searchParams.set('api_key', apiKey);
  if (!searchParams.has('language') && !searchParams.has('include_video_language')) {
    searchParams.set('language', params.language || 'fr-FR');
  }

  try {
    const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}?${searchParams.toString()}`;
    const response = await fetch(tmdbUrl);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
