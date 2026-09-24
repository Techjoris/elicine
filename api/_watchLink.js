/**
 * Résolution du lien direct vers la fiche d'un film sur une plateforme.
 *
 * TMDB ne publie aucun identifiant de catalogue par plateforme : son endpoint
 * `watch/providers` ne renvoie qu'un lien intermédiaire vers sa propre page
 * themoviedb.org. Faute d'identifiant, l'application retombait sur la page de
 * recherche de la plateforme au lieu du film. JustWatch — la source qui alimente
 * déjà les disponibilités TMDB pour la France — expose `standardWebURL`, l'URL
 * exacte de la fiche du titre chez chaque fournisseur (netflix.com/title/…,
 * disneyplus.com/browse/entity-…, tv.apple.com/…).
 *
 * Ce module ne contient que de la logique pure d'appariement et la requête
 * amont, afin de rester testable sans réseau.
 */

const JUSTWATCH_ENDPOINT = 'https://apis.justwatch.com/graphql';
const DEFAULT_TIMEOUT_MS = 8000;
const MIN_TITLE_SCORE = 0.6;

/**
 * Un même fournisseur ne s'écrit pas pareil chez TMDB et chez JustWatch
 * (« Amazon Prime Video » / « Amazon Video », « Canal+ » / « Canal VOD »).
 * La clé canonique fait le pont entre les deux référentiels.
 */
export const PROVIDER_ALIASES = [
  ['netflix', /netflix/i],
  ['prime', /prime\s*video|amazon\s*video|amazon/i],
  ['disney', /disney/i],
  ['canal', /canal/i],
  ['apple', /apple/i],
  // « Premiere Max » est un loueur français sans rapport avec HBO Max : le nom
  // doit être « Max » ou « HBO Max », pas un mot contenant « max ».
  ['max', /^(hbo\s*)?max(\s|$|\+)/i],
  ['paramount', /paramount/i],
  ['arte', /\barte\b|arte\s*boutique/i],
  ['tf1', /tf1/i],
  ['france-tv', /france\.?tv|francetv/i],
  ['m6', /6play|\bm6\b/i],
  ['rakuten', /rakuten/i],
  ['pathe', /path[eé]/i],
  ['mubi', /mubi/i],
  ['crunchyroll', /crunchyroll/i],
  ['sooner', /sooner/i],
  ['plex', /plex/i],
  ['filmbox', /filmbox/i]
];

/** Clé canonique d'un nom de fournisseur, ou null si inconnu. */
export function providerKeyFor(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) return null;
  const match = PROVIDER_ALIASES.find(([, pattern]) => pattern.test(value));
  return match ? match[0] : null;
}

/** Titre comparable : minuscules, sans accent, sans ponctuation. */
export function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Proximité entre deux titres, de 0 à 1. */
export function titleSimilarity(a, b) {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const shared = [...leftTokens].filter(token => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? shared / union : 0;
}

/**
 * Note un candidat JustWatch. Le titre pèse le plus lourd ; l'année ne sert
 * qu'à départager deux adaptations homonymes, jamais à écarter le bon titre.
 */
export function scoreCandidate(node, title, year) {
  const content = node?.content || {};
  let score = titleSimilarity(title, content.title || '');

  const wanted = Number(year);
  const candidate = Number(content.originalReleaseYear);
  if (Number.isFinite(wanted) && wanted > 0 && Number.isFinite(candidate) && candidate > 0) {
    const gap = Math.abs(wanted - candidate);
    if (gap === 0) score += 0.25;
    else if (gap <= 1) score += 0.1;
    else score -= 0.2;
  }

  return score;
}

/** Meilleur candidat parmi les résultats, ou null si aucun ne ressemble au titre demandé. */
export function pickBestCandidate(edges, title, year, objectType = null) {
  let best = null;
  let bestScore = 0;

  for (const edge of Array.isArray(edges) ? edges : []) {
    const node = edge?.node;
    if (!node) continue;
    if (objectType && node.objectType && node.objectType !== objectType) continue;
    const score = scoreCandidate(node, title, year);
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  }

  return bestScore >= MIN_TITLE_SCORE ? best : null;
}

/** URL de la fiche du fournisseur demandé parmi les offres d'un titre. */
export function pickOfferUrl(offers, providerName) {
  const wanted = providerKeyFor(providerName);
  if (!wanted) return null;
  const offer = (Array.isArray(offers) ? offers : []).find(candidate =>
    providerKeyFor(candidate?.package?.clearName) === wanted
    && typeof candidate?.standardWebURL === 'string'
    && candidate.standardWebURL.startsWith('http'));
  return offer ? offer.standardWebURL : null;
}

export function buildJustWatchQuery() {
  return `query ElicineTitleWatch($country: Country!, $language: Language!, $query: String!, $platform: Platform!) {
  popularTitles(country: $country, first: 6, filter: { searchQuery: $query }) {
    edges {
      node {
        objectType
        content(country: $country, language: $language) {
          title
          originalReleaseYear
        }
        offers(country: $country, platform: $platform) {
          standardWebURL
          monetizationType
          package { clearName }
        }
      }
    }
  }
}`;
}

/**
 * Interroge JustWatch et renvoie `{ [cleFournisseur]: url }`.
 * Toute erreur amont renvoie un objet vide : l'appelant garde alors son repli.
 */
export async function resolveTitleWatchLinks({
  title,
  year = '',
  country = 'FR',
  mediaType = 'movie',
  language = 'fr',
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (!cleanTitle || typeof fetchImpl !== 'function') return {};

  const objectType = mediaType === 'tv' ? 'SHOW' : 'MOVIE';

  try {
    const response = await fetchImpl(JUSTWATCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; Elicine/1.0)' },
      body: JSON.stringify({
        query: buildJustWatchQuery(),
        variables: {
          country: String(country || 'FR').toUpperCase().slice(0, 2) || 'FR',
          language,
          query: cleanTitle,
          platform: 'WEB'
        }
      }),
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined
    });

    if (!response?.ok) return {};
    const payload = await response.json();
    const edges = payload?.data?.popularTitles?.edges;
    const best = pickBestCandidate(edges, cleanTitle, year, objectType);
    if (!best) return {};

    const links = {};
    for (const offer of Array.isArray(best.offers) ? best.offers : []) {
      const key = providerKeyFor(offer?.package?.clearName);
      const url = offer?.standardWebURL;
      if (key && typeof url === 'string' && url.startsWith('http') && !links[key]) {
        links[key] = url;
      }
    }
    return links;
  } catch {
    return {};
  }
}
