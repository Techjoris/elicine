export default async function handler(req, res) {
  const apiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé serveur TMDB manquante' });
  }

  const { endpoint, ...params } = req.query;
  if (!endpoint) {
    return res.status(400).json({ error: 'Paramètre endpoint manquant' });
  }

  const searchParams = new URLSearchParams(params);
  searchParams.set('api_key', apiKey);
  searchParams.set('language', params.language || 'fr-FR');

  try {
    const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}?${searchParams.toString()}`;
    const response = await fetch(tmdbUrl);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
