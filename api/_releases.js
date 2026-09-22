/**
 * Builds the Prochainement feed: candidates are gathered from TMDB discover + trending feeds,
 * ranked by « degré d'attente », then the best candidates are enriched with the one signal
 * TMDB only exposes per title — the weight of the saga or of the platform.
 */
import { anticipationScore, rankByAnticipation, relativeBuzzByReleaseWindow, scaleSignal } from './_anticipation.js';

const TMDB_ORIGIN = 'https://api.themoviedb.org/3';
const DISCOVER_PAGES = [1, 2, 3, 4, 5];
const WINDOW_MONTHS = 6;
/** How many leading candidates receive a per-title TMDB call to weigh their saga/platform. */
const ENRICH_LIMIT = 40;
const ENRICH_CONCURRENCY = 6;
const DEFAULT_LANGUAGE = 'fr-FR';

export function tmdbKey() {
  return (process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || '').trim();
}

export function parisDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function releaseWindowRange(now = new Date()) {
  const today = parisDate(now);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + WINDOW_MONTHS);
  return { today, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

async function tmdbGet(path, params, apiKey) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  search.set('api_key', apiKey);
  const response = await fetch(`${TMDB_ORIGIN}/${path}?${search.toString()}`, {
    signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`TMDB_${response.status}`);
  return response.json();
}

function toCandidate(item, mediaType) {
  const releaseDate = item?.release_date || item?.first_air_date;
  const title = item?.title || item?.name;
  const id = Number(item?.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !title || !releaseDate || !item.poster_path) return null;
  return {
    id, title, overview: item.overview || '',
    poster_path: item.poster_path, backdrop_path: item.backdrop_path ?? null,
    release_date: releaseDate, media_type: mediaType,
    vote_average: Number(item.vote_average) || 0, popularity: Number(item.popularity) || 0,
    voteCount: Number(item.vote_count) || 0, genre_ids: item.genre_ids || [],
    anticipation: 0, buzzPercentile: 0.5, scale: 0, trendingRank: null, daysUntilRelease: 0
  };
}

/** Runs the per-title calls in small waves so TMDB never sees a burst of 40 parallel requests. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length).fill(null);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]).catch(() => null);
    }
  });
  await Promise.all(runners);
  return results;
}

async function enrichCandidate(candidate, apiKey, language) {
  if (candidate.media_type === 'tv') {
    const details = await tmdbGet(`tv/${candidate.id}`, { language }, apiKey);
    return {
      scale: scaleSignal({
        networks: details.networks, numberOfSeasons: details.number_of_seasons, voteCount: details.vote_count
      })
    };
  }
  // TMDB only exposes the weight of a saga through the collection endpoint, and only for the
  // films that actually belong to one, so this second call stays rare.
  const details = await tmdbGet(`movie/${candidate.id}`, { language, append_to_response: 'belongs_to_collection' }, apiKey);
  const collectionId = Number(details?.belongs_to_collection?.id);
  if (!Number.isSafeInteger(collectionId) || collectionId <= 0) return { scale: 0 };
  const collection = await tmdbGet(`collection/${collectionId}`, { language }, apiKey);
  return { scale: scaleSignal({ collection }) };
}

/**
 * @returns {Promise<{items: Array<object>, enrichment: {requested: number, resolved: number}}>}
 */
export async function buildUpcomingReport({ apiKey = tmdbKey(), language = DEFAULT_LANGUAGE, now = new Date(), enrichLimit = ENRICH_LIMIT } = {}) {
  if (!apiKey) throw new Error('TMDB_KEY_MISSING');
  const { today, from, to } = releaseWindowRange(now);

  const discoverStacks = await Promise.all((['movie', 'tv']).flatMap(type => DISCOVER_PAGES.map(async page => {
    const dateKey = type === 'movie' ? 'primary_release_date' : 'first_air_date';
    const data = await tmdbGet(`discover/${type}`, {
      language, page, sort_by: 'popularity.desc', include_adult: false,
      ...(type === 'movie' ? { include_video: false } : { include_null_first_air_dates: false }),
      [`${dateKey}.gte`]: from,
      [`${dateKey}.lte`]: to
    }, apiKey);
    return (data.results || []).map(item => toCandidate(item, type)).filter(Boolean);
  })));

  // Trending feeds carry the closest thing to an explicit "I want to see this" signal.
  const trendingStacks = await Promise.all((['movie', 'tv']).flatMap(type => (['day', 'week']).map(async window => {
    try {
      const data = await tmdbGet(`trending/${type}/${window}`, { language }, apiKey);
      return { type, window, results: data.results || [] };
    } catch {
      return null;
    }
  })));

  const candidates = new Map();
  const ranks = new Map();
  for (const item of discoverStacks.flat()) {
    if (item.release_date <= today || item.release_date > to) continue;
    candidates.set(`${item.media_type}:${item.id}`, item);
  }
  for (const stack of trendingStacks) {
    if (!stack) continue;
    stack.results.forEach((raw, index) => {
      const item = toCandidate(raw, stack.type);
      if (!item || item.release_date <= today || item.release_date > to) return;
      const key = `${stack.type}:${item.id}`;
      const held = ranks.get(key) || {};
      held[stack.window] = index + 1;
      ranks.set(key, held);
      if (!candidates.has(key)) candidates.set(key, item);
    });
  }

  const pool = [...candidates.values()].map(item => ({
    ...item,
    daysUntilRelease: Math.round((Date.parse(`${item.release_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
  }));
  const standings = relativeBuzzByReleaseWindow(pool);
  const scored = pool.map((item, index) => {
    const held = ranks.get(`${item.media_type}:${item.id}`) || {};
    const buzzPercentile = standings[index];
    return {
      ...item,
      buzzPercentile,
      trendingRank: held.week ?? held.day ?? null,
      anticipation: anticipationScore({
        popularity: item.popularity, voteCount: item.voteCount,
        weekRank: held.week, dayRank: held.day, daysUntilRelease: item.daysUntilRelease,
        buzzPercentile, scale: 0
      })
    };
  });

  // Only the leading candidates can still change the visible order, so only they are enriched.
  const leading = rankByAnticipation(scored).slice(0, Math.max(0, enrichLimit));
  const enrichment = await mapWithConcurrency(leading, ENRICH_CONCURRENCY, candidate => enrichCandidate(candidate, apiKey, language));
  const scaleById = new Map();
  leading.forEach((item, index) => {
    const scale = Number(enrichment[index]?.scale) || 0;
    if (scale > 0) scaleById.set(`${item.media_type}:${item.id}`, scale);
  });

  const final = scored.map(item => {
    const scale = scaleById.get(`${item.media_type}:${item.id}`) || 0;
    return {
      ...item,
      scale,
      anticipation: anticipationScore({
        popularity: item.popularity, voteCount: item.voteCount,
        weekRank: ranks.get(`${item.media_type}:${item.id}`)?.week,
        dayRank: ranks.get(`${item.media_type}:${item.id}`)?.day,
        daysUntilRelease: item.daysUntilRelease, buzzPercentile: item.buzzPercentile, scale
      })
    };
  });

  return {
    items: rankByAnticipation(final),
    enrichment: { requested: leading.length, resolved: enrichment.filter(Boolean).length }
  };
}

/** @returns {Promise<Array<object>>} the feed, most awaited title first. */
export async function buildUpcomingFeed(options) {
  return (await buildUpcomingReport(options)).items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const apiKey = tmdbKey();
  if (!apiKey) return res.status(503).json({ error: 'Service de données cinématographiques indisponible.' });
  const requested = String(req.query?.language || '');
  const language = /^[a-z]{2}(-[A-Z]{2})?$/.test(requested) ? requested : DEFAULT_LANGUAGE;

  try {
    const { items, enrichment } = await buildUpcomingReport({ apiKey, language });
    // A partial enrichment (TMDB hiccup) must not be frozen at the edge for fifteen minutes.
    const degraded = enrichment.requested > 0 && enrichment.resolved < enrichment.requested / 2;
    res.setHeader('Cache-Control', degraded ? 'public, s-maxage=60' : 'public, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json({ success: true, updatedAt: new Date().toISOString(), count: items.length, items });
  } catch (error) {
    console.error('[Upcoming]', error.message);
    return res.status(503).json({ success: false, error: 'Les prochaines sorties sont momentanément indisponibles.' });
  }
}
