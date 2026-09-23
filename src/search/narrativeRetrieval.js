import { conceptMatch, conceptSpecificity, conceptVariants } from './semanticLexicon.js';
import { expandSemanticTerms } from './semanticExpansion.js';
import { collectSemanticPeople, createSemanticIntentContext } from './semanticIntentContext.js';
import { normalizeTerm } from './tmdbRetrievalParams.js';

const unique = values => [...new Set(values.map(normalizeTerm).filter(Boolean))];
const inflectionKey = term => normalizeTerm(term).split(' ').map(word =>
  word.length > 3 && /s$/.test(word) && !/(ss|us|is)$/.test(word) ? word.slice(0, -1) : word).join(' ');

/** Same words and granularity only; never accept a parent keyword. */
export function narrativeKeywordId(term, results = []) {
  const ids = [...new Set((Array.isArray(results) ? results : []).filter(row => inflectionKey(row.name) === inflectionKey(term))
    .map(row => Number(row.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  return ids.length === 1 ? ids[0] : null;
}

/** Retrieval-only plan. Dimensions stay separate; expansions never replace them.
 * Three keyword angles + one lexical angle + one embedding, with no new LLM.
 */
export function buildNarrativeRetrievalPlan(intent = {}, semanticContext = {}) {
  const semantic = createSemanticIntentContext(semanticContext);
  const generic = new Set(unique([...(intent.genres || []), ...(intent.moods || []),
    'action', 'adventure', 'comedy', 'crime', 'drama', 'family', 'fantasy', 'horror',
    'mystery', 'romance', 'science fiction', 'thriller', 'war', 'film', 'movie', 'series', 'tv']));
  const dimensions = [semantic.semanticConcepts, semantic.narrativeMotifs,
    intent.themes || [], intent.keywords || []].map(values => unique(values).filter(term => !generic.has(term)));
  // Interleave channels so a long concept list cannot erase actions or keywords.
  const terms = [];
  for (let index = 0; index < Math.max(...dimensions.map(values => values.length)); index++) {
    for (const values of dimensions) if (values[index] && !terms.includes(values[index])) terms.push(values[index]);
  }
  // Do not count singular/plural or bilingual equivalents as separate dimensions.
  const concepts = terms.filter((term, index) => !terms.slice(0, index).some(previous =>
    inflectionKey(previous) === inflectionKey(term) || conceptVariants(previous).includes(term))).slice(0, 18);
  const rich = concepts.length >= 2;
  const expansion = expandSemanticTerms({ ...intent,
    themes: unique([...(intent.themes || []), ...semantic.semanticConcepts, ...semantic.narrativeMotifs]) });
  const informative = [...concepts].sort((a, b) => conceptSpecificity(b) - conceptSpecificity(a));
  // Provider wordings, interleaved by concept: every described concept gives its
  // first formulation before any concept gives a second one. A concept that
  // looks redundant locally ("fighter pilots" beside "military aviation") can
  // still be the only wording the provider taxonomy actually tags, so it must
  // reach the keyword resolution instead of being crowded out by the variants
  // of the first concept.
  const variantsByConcept = informative.map(concept =>
    conceptVariants(concept).filter(variant => variant !== concept));
  const interleavedVariants = [];
  for (let depth = 0; depth < 5; depth++) {
    for (const variants of variantsByConcept) if (variants[depth]) interleavedVariants.push(variants[depth]);
  }
  const keywordQueries = unique([...concepts, ...interleavedVariants, ...expansion.addedTerms])
    .filter(term => term.length >= 3 && term.length <= 80).slice(0, 16);
  return { rich, semanticConcepts: semantic.semanticConcepts, narrativeMotifs: semantic.narrativeMotifs,
    concepts, keywordQueries, people: collectSemanticPeople(semantic), expansion,
    intentType: semantic.intentType, maxVariants: 5 };
}

/** How far back a "modern" request is read when no year bound is stated. */
export const RECENT_ANGLE_HORIZON_YEARS = 25;

/**
 * Complementary keyword angles for a rich request.
 *
 * A multi-concept request is answered by the *intersection* of its concepts,
 * and one broad OR angle ordered by popularity buries that intersection under
 * the most popular works of the genre. This generator therefore builds, from
 * the concepts the interpreter already wrote:
 *
 *  - the most discriminating **pairs** of concepts as AND angles (specificity
 *    of the two concepts named, never a fixed anchor on the first one);
 *  - when the request states a modern period, the same leading pair sorted by
 *    release date instead of popularity, so a precise contemporary work is not
 *    crowded out of the provider's first page;
 *  - one broad OR backoff, because sparse provider tagging must not turn AND
 *    into an exclusion of the described work.
 *
 * Bounded by construction (four angles at most) and derived only from the
 * intent: no title, no identifier, no per-query rule.
 */
export function narrativeKeywordAngles(resolved = [], {
  temporalDirection = 0, precisePairs = 2, complementaryPairs = 0, includeRecent = temporalDirection > 0,
  includeGenreFree = false, broadLimit = 3
} = {}) {
  const entries = (Array.isArray(resolved) ? resolved : [])
    .map(item => (item && typeof item === 'object' ? { term: item.term, id: Number(item.id) } : { term: null, id: Number(item) }))
    .filter(entry => Number.isSafeInteger(entry.id) && entry.id > 0)
    .filter((entry, index, all) => all.findIndex(other => other.id === entry.id) === index);
  const keys = entries.map(entry => entry.id);
  // One concept (or none) has no intersection to build: keep the historical
  // broad angle, which is the only Discover channel in that case.
  if (keys.length < 2) return [{ ids: keys, conjunction: false }];

  // Historical angles first: the two pairs anchored on the leading concept that
  // the recorded retrieval corpus was built on. The complementary pairs come
  // after, so the historical request set is never reordered.
  const anchored = [];
  for (let index = 1; index < Math.min(entries.length, 1 + Math.max(1, precisePairs)); index++) {
    anchored.push({ ids: [entries[0].id, entries[index].id], left: 0, right: index });
  }
  const pairs = [];
  for (let left = 0; left < entries.length; left++) {
    for (let right = left + 1; right < entries.length; right++) {
      const first = entries[left];
      const second = entries[right];
      const score = (first.term ? conceptSpecificity(first.term) : 0.6) + (second.term ? conceptSpecificity(second.term) : 0.6);
      const alreadyAnchored = anchored.some(pair => pair.left === left && pair.right === right);
      if (!alreadyAnchored) pairs.push({ ids: [first.id, second.id], score, left, right });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.left - b.left || a.right - b.right);
  const extra = pairs.slice(0, Math.max(0, complementaryPairs)).map(pair => ({ ...pair, complementary: true }));
  const precise = [...anchored, ...extra];
  if (!precise.length) precise.push({ ids: [entries[0].id, entries[1].id] });
  const angles = precise.map(pair => ({ ids: pair.ids, conjunction: true }));
  if (includeRecent && temporalDirection > 0 && precise.length) {
    // The recent angle carries the WHOLE concept set in disjunction, ordered by
    // release date: an intersection of two provider keywords is often empty, and
    // it is exactly the popular-ordering of the broad angle that buries a
    // precise contemporary work. Both are additive: no other angle changes.
    angles.push({ ids: keys, conjunction: false, recentFirst: true, complementary: true,
      recentSinceYears: RECENT_ANGLE_HORIZON_YEARS });
  }
  // The historical broad angle keeps its original width: widening it would
  // reorder the very pool the recorded corpus was built on. The concepts beyond
  // that width are explored by the additive angles below.
  angles.push({ ids: keys.slice(0, Math.max(2, broadLimit)), conjunction: false });
  // A declared genre is a dimension of the request, not a gate: a work that
  // answers several described concepts can legitimately belong to another
  // genre (a science-fiction film about fighter jets and aerial combat answers
  // a war-and-aviation request). One disjunctive angle therefore drops the
  // genre constraint, so the intersection is reachable before the ranking
  // decides - the ranking still weights the genre family.
  if (includeGenreFree && keys.length >= 2) {
    angles.push({ ids: keys, conjunction: false, withoutGenre: true, complementary: true });
  }
  return angles;
}

const labels = value => (Array.isArray(value) ? value : [value]).flatMap(item =>
  typeof item === 'object' ? item?.name || '' : item || '');
export function narrativeEvidence(row, plan) {
  if (!plan?.rich) return { matched: 0, coverage: 0 };
  const facts = row.constraintData || {};
  const text = [row.overview, row.metadata?.overview, facts.overview, row.profile_text,
    ...labels(row.keywords), ...labels(row.themes), ...labels(facts.keywords), ...labels(facts.themes)].join(' ');
  const weights = plan.concepts.map(term => conceptSpecificity(term));
  const matches = plan.concepts.map(term => conceptMatch(text, term));
  return { matched: matches.filter(match => match === 1).length,
    coverage: matches.reduce((sum, match, index) => sum + match * weights[index], 0) /
      (weights.reduce((sum, weight) => sum + weight, 0) || 1) };
}

/** Applied before source truncation, especially to full person filmographies. */
export function prioritizeNarrativeRows(rows, plan) {
  if (!plan?.rich) return rows;
  return rows.map((row, index) => ({ row, index, ...narrativeEvidence(row, plan) }))
    .sort((a, b) => b.matched - a.matched || b.coverage - a.coverage || a.index - b.index).map(item => item.row);
}

/** Safe PostgREST expression: two dimensions must match, in either text column.
 * Alternatives preserve whole concepts, so a frequent word cannot select a row.
 */
export function narrativeLexicalFilter(plan, columns = ['original_title', 'overview']) {
  const groups = plan.concepts.slice(0, 6).map(term => {
    const alternatives = conceptVariants(term).slice(0, 4).map(value => value.replace(/[^\p{L}\p{N}\s-]/gu, '').trim());
    return `or(${alternatives.flatMap(value => columns.map(column => `${column}.ilike.%${value}%`)).join(',')})`;
  });
  const pairs = [];
  // One bounded expression, not one network call per pair.
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const pair = `and(${groups[i]},${groups[j]})`;
    // A bounded URL as well as a bounded number of dimensions (PostgREST GET).
    if (encodeURIComponent([...pairs, pair].join(',')).length <= 12000) pairs.push(pair);
  }
  return pairs.join(',');
}
