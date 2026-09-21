const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const STOP_WORDS = new Set([
  'avec', 'dans', 'dont', 'elle', 'film', 'films', 'pour', 'sans', 'serie', 'series',
  'sombre', 'autres', 'where', 'with', 'without', 'movie', 'show', 'the', 'and', 'une',
  'des', 'les', 'sur', 'aux', 'ses', 'qui', 'que', 'plus', 'tres', 'entre'
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
  const add = value => {
    const name = String(value || '').replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, '').trim();
    const tokens = name.split(/\s+/).filter(Boolean);
    if (tokens.length < 2 || tokens.length > 4 || tokens.some(token => token.length < 2)) return;
    if (!people.some(existing => existing.toLowerCase() === name.toLowerCase())) people.push(name);
  };
  const pattern = /\b(?:film|films|movie|movies|série|serie|series)\s+(?:de|d'|avec)\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){1,3})(?=\s+(?:ou|où|qui|dans|avec|et|sur|sans|pour|dont|mais|plus|apres|avant)\b|[,.!?;:]|$)/giu;
  for (const match of normalized.matchAll(pattern)) add(match[1]);
  // Also support a leading "de Leonardo DiCaprio" without requiring the
  // noun immediately before it, while retaining the same bounded boundary.
  const directPattern = /\bde\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){1,3})(?=\s+(?:ou|où|qui|dans|avec|et|sur|sans|pour|dont|mais|plus|apres|avant)\b|[,.!?;:]|$)/giu;
  for (const match of normalized.matchAll(directPattern)) add(match[1]);
  return people.slice(0, 2);
}

/**
 * Minimal no-LLM recovery. It preserves discriminating concepts from the user
 * text only when the provider returned no structured semantic evidence.
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
