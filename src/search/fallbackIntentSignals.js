const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const STOP_WORDS = new Set([
  'avec', 'dans', 'dont', 'elle', 'film', 'films', 'pour', 'sans', 'serie', 'series',
  'sombre', 'autres', 'where', 'with', 'without', 'movie', 'show', 'the', 'and', 'une',
  'des', 'les', 'sur', 'aux', 'ses', 'qui', 'que', 'plus', 'tres', 'entre'
]);

const NON_PERSON_WORDS = new Set([
  'action', 'aventure', 'aviation', 'avion', 'avions', 'combat', 'combats', 'comedie', 'crime', 'drame', 'fantastique',
  'fiction', 'forces', 'guerre', 'horreur', 'melancolique', 'militaire', 'moderne',
  'psychologique', 'romance', 'science', 'speciales', 'thriller'
]);

const NON_TITLE_REFERENCES = new Set([
  'ca', 'cela', 'ceci', 'celui ci', 'elle', 'eux', 'lui', 'quelque chose', 'un truc'
]);

/**
 * Recover a bounded actor/person hint when the LLM is unavailable.  This is
 * deliberately grammar-based: it only looks for a name following an explicit
 * "film/série de|avec" construction and never turns arbitrary query tokens
 * into people.  Resolution remains provider-backed and can reject false hits.
 */
export function extractPersonQueries(userQuery = '') {
  const raw = String(userQuery || '').trim();
  if (!raw) return [];
  const normalized = raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const people = [];
  const add = (value, { requireCapitalized = false } = {}) => {
    const name = String(value || '').replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, '').trim();
    const tokens = name.split(/\s+/).filter(Boolean);
    if (tokens.length < 2 || tokens.length > 4 || tokens.some(token => token.length < 2)) return;
    if (requireCapitalized && tokens.some(token => !/^[A-ZÀ-ÖØ-Þ]/u.test(token))) return;
    if (tokens.some(token => NON_PERSON_WORDS.has(normalize(token)))) return;
    if (!people.some(existing => existing.toLowerCase() === name.toLowerCase())) people.push(name);
  };
  const pattern = /\b(?:film|films|movie|movies|série|serie|series)\s+(?:de\s+|d['’]\s*|avec\s+)([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){1,3})(?=\s+(?:ou|où|qui|dans|avec|et|sur|sans|pour|dont|mais|plus|apres|avant)\b|[,.!?;:]|$)/giu;
  for (const match of normalized.matchAll(pattern)) add(match[1]);
  // Also support a leading "de Leonardo DiCaprio" without requiring the
  // noun immediately before it, while retaining the same bounded boundary.
  const directPattern = /\bde\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){1,3})(?=\s+(?:ou|où|qui|dans|avec|et|sur|sans|pour|dont|mais|plus|apres|avant)\b|[,.!?;:]|$)/giu;
  for (const match of normalized.matchAll(directPattern)) add(match[1]);
  const withPattern = /\bavec\s+([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){1,3})(?=\s+(?:ou|où|qui|dans|avec|et|sur|sans|pour|dont|mais|plus|apr[eè]s|avant)\b|[,.!?;:]|$)/giu;
  for (const match of raw.matchAll(withPattern)) add(match[1], { requireCapitalized: true });
  return people.slice(0, 2);
}

/**
 * Recover explicit comparison seeds without attempting generic named-entity
 * recognition. Only bounded comparison grammar is accepted; TMDB resolution
 * remains authoritative and rejects invalid or ambiguous captures.
 */
export function extractReferenceTitleQueries(userQuery = '') {
  const raw = String(userQuery || '').trim();
  if (!raw) return [];
  const patterns = [
    /\b(?:du\s+)?m[êe]me\s+style\s+que\s+(.+)/iu,
    /\bdans\s+le\s+style\s+de\s+(.+)/iu,
    /\b(?:similaire|semblable)\s+[àa]\s+(.+)/iu,
    /\bcomme\s+(.+)/iu
  ];
  const titles = [];
  const add = value => {
    const bounded = String(value || '')
      .split(/[,;!?]|\s+(?:mais|merci|whereas|s['’ ]?il\s+te\s+pla[iî]t)\b/iu, 1)[0]
      .replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, '').trim();
    const titleTokens = bounded.split(/\s+/).filter(Boolean);
    if (!titleTokens.length || titleTokens.length > 8 || bounded.length < 2) return;
    const normalizedTitle = normalize(bounded);
    if (!normalizedTitle || NON_TITLE_REFERENCES.has(normalizedTitle) ||
        /^(?:un|une|le|la|les|film|serie|movie|show)$/.test(normalizedTitle)) return;
    if (!titles.some(title => normalize(title) === normalizedTitle)) titles.push(bounded);
  };
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) add(match[1]);
  }
  return titles.slice(0, 3);
}

/**
 * Minimal deterministic recovery. The adapter uses it only when a provider
 * returned no structured semantics or collapsed the query to generic genres.
 */
export function extractFallbackIntentSignals(userQuery = '') {
  const text = normalize(userQuery);
  const genres = [];
  if (/\b(guerre|militaire|aviation|combat)\b/.test(text)) genres.push('War');
  if (/\b(thriller|oppressant|psychologique)\b/.test(text)) genres.push('Thriller');
  if (/\b(science fiction|sci fi)\b/.test(text)) genres.push('Science Fiction');
  if (/\b(comedie|humour|drole)\b/.test(text)) genres.push('Comedy');
  if (/\b(horreur|horror)\b/.test(text)) genres.push('Horror');

  const themes = [];
  const phrases = [
    ['guerre moderne', 'guerre moderne'],
    ['avion de combat', 'avions de combat'],
    ['avions de combat', 'avions de combat'],
    ['aviation militaire', 'aviation militaire'],
    ['forces speciales', 'forces spéciales'],
    ['pilote de chasse', 'pilotes de chasse'],
    ['pilotes de chasse', 'pilotes de chasse'],
    ['petite ville', 'petite ville'],
    ['voyage dans les reves', 'shared dreams'],
    ['reves des autres', 'shared dreams'],
    ['psychologique', 'psychological'],
    ['memoire', 'mémoire']
  ];
  for (const [needle, value] of phrases) if (text.includes(needle) && !themes.includes(value)) themes.push(value);

  const namedPhrases = String(userQuery).match(/\b[A-ZÀ-ÖØ-Þ][\p{L}'-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+)+/gu) || [];
  const tokens = text.split(/\s+/).filter(token => token.length >= 4 && !STOP_WORDS.has(token));
  // Keep a couple of deterministic lexical variants for the shared-dreams
  // concept. TMDB overviews commonly use singular French "rêve"/"subconscient"
  // even when the user writes plural "rêves"; this improves retrieval without
  // introducing a provider call or changing the ranking formula.
  const dreamVariants = themes.includes('shared dreams') ? ['rêve', 'subconscient'] : [];
  const keywords = [...new Set([...namedPhrases, ...themes, ...dreamVariants, ...tokens])].slice(0, 8);
  const moods = /\bsombre\b/.test(text) ? ['dark'] : [];
  return { genres, themes, moods, keywords, people: extractPersonQueries(userQuery) };
}
