/**
 * Endpoint de résolution des liens directs vers les fiches de streaming.
 *
 * `GET /api/watch-link?title=Dune&year=2024&type=movie&country=FR`
 *   → `{ "links": { "netflix": "https://www.netflix.com/title/…", … } }`
 *
 * Le calcul se fait côté serveur : pas de requête cross-origin depuis le
 * navigateur, cache partagé entre visiteurs, et un échec amont reste invisible
 * pour l'utilisateur (l'application garde son repli vers la recherche).
 */
import { resolveTitleWatchLinks } from './_watchLink.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map();

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.links;
}

function writeCache(key, links) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), links });
}

export default async function handler(req, res) {
  const cacheHeaders = { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' };

  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ links: {} });
    }

    const title = String(req.query?.title || '').trim().slice(0, 160);
    if (!title) {
      return res.status(400).json({ links: {} });
    }

    const year = String(req.query?.year || '').replace(/\D/g, '').slice(0, 4);
    const country = (String(req.query?.country || 'FR').toUpperCase().slice(0, 2) || 'FR');
    const mediaType = req.query?.type === 'tv' ? 'tv' : 'movie';
    const cacheKey = `${country}|${mediaType}|${year}|${title.toLowerCase()}`;

    const cached = readCache(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', cacheHeaders['Cache-Control']);
      return res.status(200).json({ links: cached });
    }

    const links = await resolveTitleWatchLinks({ title, year, country, mediaType });
    writeCache(cacheKey, links);

    res.setHeader('Cache-Control', cacheHeaders['Cache-Control']);
    return res.status(200).json({ links });
  } catch {
    return res.status(200).json({ links: {} });
  }
}
