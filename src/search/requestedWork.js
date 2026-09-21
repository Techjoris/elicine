/**
 * Requested-work detection: is the user asking FOR a named work, or only using
 * a named work as a style reference?
 *
 * "Inception" and "shutter iland" identify a work; "films du même style que
 * Shutter Island" references one. The two must not be handled the same way:
 * the first one gets the exact work as the answer, the second one must not let
 * the seed monopolise the grid.
 *
 * Pure query/title string logic: no catalogue call, no media-type branch and no
 * hardcoded title, so films and series follow exactly the same rule.
 */

export const REQUESTED_WORK_THRESHOLD = 0.78;
export const REQUESTED_WORK_LIMIT = 2;

/**
 * Comparison grammar that turns a named work into a reference instead of the
 * answer. "comme", "style", "similaire", "façon", "ressemble" are query
 * relations, never part of a title.
 */
const REFERENCE_MARKERS = /(?:^| )(?:comme|style|similaire|similaires|similar|ressemble|ressemblent|ressemblant|facon|maniere|esprit|veine|genre|type|sorte|kind|like|alike|reminds)(?: |$)/u;

/** Query roles and articles that carry no title information. */
const QUERY_STOPWORDS = new Set(['film', 'films', 'movie', 'movies', 'serie', 'series', 'show', 'shows',
  'tv', 'television', 'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'ce', 'cet', 'cette',
  'ces', 'mon', 'ma', 'mes', 'the', 'a', 'an', 'of', 'les']);

const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/["'’‘`´]/g, ' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

/** Query tokens without roles/articles and without a trailing release year. */
export function queryTitleTokens(value) {
  const tokens = normalize(value).split(' ').filter(token => token && !QUERY_STOPWORDS.has(token));
  const last = tokens.at(-1);
  if (tokens.length > 1 && /^(?:19|20)\d{2}$/.test(last || '')) tokens.pop();
  return tokens;
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length || !right.length) return Math.max(left.length, right.length);
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const saved = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return previous[right.length];
}

/** Character-level closeness of two values, 0..1, accent and case insensitive. */
export function characterSimilarity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/**
 * How much the query looks like the title itself, 0..1. Token coverage catches
 * "le silence des agneaux" and a small edit distance catches "shutter iland"
 * once the interpreter repaired the title.
 */
export function titleQuerySimilarity(query, title) {
  const leftTokens = queryTitleTokens(query);
  const right = normalize(title);
  if (!leftTokens.length || !right) return 0;
  const rightTokens = right.split(' ');
  const rightSet = new Set(rightTokens);
  const leftSet = new Set(leftTokens);
  const coverage = leftTokens.filter(token => rightSet.has(token)).length / leftTokens.length;
  // The title is named inside a slightly longer query ("Inception de
  // Christopher Nolan"): the extra words qualify the work, they do not replace
  // it. A much longer query is a description, never a title, so the reverse
  // coverage only counts while the query stays close to the title length.
  const titleCoverage = leftTokens.length <= rightTokens.length + 5
    ? rightTokens.filter(token => leftSet.has(token)).length / rightTokens.length : 0;
  const left = leftTokens.join(' ');
  return Math.max(coverage, titleCoverage, characterSimilarity(left, right));
}

export function isReferenceQuery(query) {
  return REFERENCE_MARKERS.test(normalize(query));
}

/**
 * Resolved works the user is naming as the answer itself. Returns the resolved
 * entities (with their resolution confidence) so the ranking and the result
 * budget can treat the requested work differently from a style seed.
 */
export function detectRequestedTitles(userQuery, resolvedTitles = [],
  { threshold = REQUESTED_WORK_THRESHOLD, limit = REQUESTED_WORK_LIMIT } = {}) {
  if (typeof userQuery !== 'string' || !userQuery.trim() || isReferenceQuery(userQuery)) return [];
  const scored = [];
  for (const resolved of Array.isArray(resolvedTitles) ? resolvedTitles : []) {
    if (!resolved || typeof resolved !== 'object') continue;
    const titles = [resolved.canonicalTitle, resolved.originalTitle, resolved.inputTitle].filter(Boolean);
    const similarity = Math.max(0, ...titles.map(title => titleQuerySimilarity(userQuery, title)));
    if (similarity >= threshold) scored.push({ ...resolved, querySimilarity: Number(similarity.toFixed(4)) });
  }
  return scored.sort((left, right) => right.querySimilarity - left.querySimilarity).slice(0, limit);
}
