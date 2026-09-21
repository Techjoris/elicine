const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const STOP_WORDS = new Set([
  'avec', 'dans', 'dont', 'elle', 'film', 'films', 'pour', 'sans', 'serie', 'series',
  'sombre', 'autres', 'where', 'with', 'without', 'movie', 'show', 'the', 'and', 'une',
  'des', 'les', 'sur', 'aux', 'ses', 'qui', 'que', 'plus', 'tres', 'entre'
]);

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
  const keywords = [...new Set([...namedPhrases, ...themes, ...tokens])].slice(0, 8);
  const moods = /\bsombre\b/.test(text) ? ['dark'] : [];
  return { genres, themes, moods, keywords };
}
