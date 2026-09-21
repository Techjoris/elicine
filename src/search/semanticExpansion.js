export const SEMANTIC_EXPANSION_LIMIT = 8;

const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** One-hop, curated relations only. Triggers never recursively expand results. */
export const SEMANTIC_RELATIONS = Object.freeze([
  Object.freeze({
    triggers: Object.freeze(['guerre moderne', 'modern warfare']),
    terms: Object.freeze(['modern warfare', 'military', 'special forces', 'special operations', 'armed forces'])
  }),
  Object.freeze({
    triggers: Object.freeze(['aviation militaire', 'military aviation']),
    terms: Object.freeze(['military aviation', 'air force', 'aerial combat', 'combat aviation'])
  }),
  Object.freeze({
    triggers: Object.freeze(['avion de combat', 'avions de combat', 'fighter aircraft', 'fighter jets']),
    terms: Object.freeze(['fighter aircraft', 'fighter jets', 'aerial combat', 'fighter pilots'])
  }),
  Object.freeze({
    triggers: Object.freeze(['forces speciales', 'special forces']),
    terms: Object.freeze(['special forces', 'special operations', 'military', 'armed forces'])
  }),
  Object.freeze({
    triggers: Object.freeze(['pilote de chasse', 'pilotes de chasse', 'fighter pilots']),
    terms: Object.freeze(['fighter pilots', 'fighter aircraft', 'air force', 'aerial combat', 'military aviation'])
  }),
  Object.freeze({
    triggers: Object.freeze(['combat aerien', 'aerial combat', 'combat aviation']),
    terms: Object.freeze(['aerial combat', 'combat aviation', 'fighter aircraft', 'fighter pilots'])
  }),
  Object.freeze({
    triggers: Object.freeze(['memoire', 'memory']),
    terms: Object.freeze(['memory', 'memories', 'identity'])
  }),
  Object.freeze({
    triggers: Object.freeze(['melancolique', 'melancholic']),
    terms: Object.freeze(['melancholic', 'melancholy', 'reflective', 'grief'])
  }),
  Object.freeze({
    triggers: Object.freeze(['petite ville', 'small town']),
    terms: Object.freeze(['small town', 'isolated community', 'rural mystery'])
  }),
  Object.freeze({
    triggers: Object.freeze(['oppressant', 'oppressive']),
    terms: Object.freeze(['oppressive', 'claustrophobic', 'tense', 'psychological tension'])
  })
]);

const containsPhrase = (value, phrase) => value === phrase || (` ${value} `).includes(` ${phrase} `);

export function expandSemanticTerms(intent = {}, limit = SEMANTIC_EXPANSION_LIMIT) {
  const sourceTerms = [...new Set([
    ...(intent.themes || []), ...(intent.keywords || []), ...(intent.moods || [])
  ].map(normalize).filter(Boolean))];
  const sourceSet = new Set(sourceTerms);
  const matched = SEMANTIC_RELATIONS.filter(relation => sourceTerms.some(source =>
    relation.triggers.some(trigger => containsPhrase(source, normalize(trigger)))));
  const addedTerms = [];
  const boundedLimit = Math.max(0, Math.min(SEMANTIC_EXPANSION_LIMIT, Number(limit) || 0));

  // Round-robin prevents one concept from consuming the whole bounded budget.
  const depth = Math.max(0, ...matched.map(relation => relation.terms.length));
  for (let index = 0; index < depth && addedTerms.length < boundedLimit; index += 1) {
    for (const relation of matched) {
      const term = normalize(relation.terms[index]);
      if (term && !sourceSet.has(term) && !addedTerms.includes(term)) addedTerms.push(term);
      if (addedTerms.length >= boundedLimit) break;
    }
  }
  return Object.freeze({ sourceTerms: Object.freeze(sourceTerms),
    addedTerms: Object.freeze(addedTerms), applied: addedTerms.length > 0 });
}
