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
  // Preserve channel breadth before taking more formulations of the same idea.
  const keywordQueries = unique([...concepts, ...informative.flatMap(conceptVariants), ...expansion.addedTerms])
    .filter(term => term.length >= 3 && term.length <= 80).slice(0, 8);
  return { rich, semanticConcepts: semantic.semanticConcepts, narrativeMotifs: semantic.narrativeMotifs,
    concepts, keywordQueries, people: collectSemanticPeople(semantic), expansion,
    intentType: semantic.intentType, maxVariants: 5 };
}

/** Two precise angles and one backoff on the SAME concepts. Sparse provider
 * tagging must not turn AND into an exclusion of the described work.
 */
export function narrativeKeywordAngles(ids = []) {
  const keys = [...new Set(ids)].slice(0, 3);
  if (keys.length < 2) return [{ ids: keys, conjunction: false }];
  const precise = keys.length === 2 ? [keys] : [[keys[0], keys[1]], [keys[0], keys[2]]];
  return [...precise.map(ids => ({ ids, conjunction: true })), { ids: keys, conjunction: false }];
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
