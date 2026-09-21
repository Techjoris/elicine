/**
 * Request-scoped semantic context produced by the LLM interpretation step.
 *
 * CanonicalIntent stays the single intent contract consumed by retrieval; this
 * context carries the extra semantic layers the interpreter extracts (people,
 * concepts, motifs, style seeds, negative concepts) so they can be mapped onto
 * CanonicalIntent fields and entity resolution without widening the contract.
 *
 * Only fixed, bounded, lowercase-normalized strings are kept here. No raw
 * provider payload and no raw user query is ever stored on this structure.
 */
import { normalizeSemanticExclusions } from './strictConstraintFilter.js';

export const SEMANTIC_INTENT_TYPES = Object.freeze([
  'specific_title_description',
  'similar_to_title',
  'thematic_search',
  'mood_search',
  'person_search',
  'constraint_search',
  'mixed'
]);

export const SEMANTIC_CONTEXT_LIMITS = Object.freeze({
  people: 4,
  creators: 3,
  concepts: 10,
  motifs: 8,
  references: 5,
  negatives: 6
});

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Accepts provider strings or `{ name }` objects; drops empty and duplicate entries. */
const list = value => [...new Set((Array.isArray(value) ? value : value == null ? [] : [value])
  .map(item => clean(typeof item === 'object' ? item?.name ?? item?.title ?? item?.id : item))
  .filter(Boolean))];

const bounded = (value, limit) => list(value).slice(0, limit);

/** Unknown labels collapse to `mixed`; an absent label stays null. */
export function normalizeSemanticIntentType(value) {
  const normalized = clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  if (!normalized) return null;
  return SEMANTIC_INTENT_TYPES.includes(normalized) ? normalized : 'mixed';
}

export function createSemanticIntentContext(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const negativeTerms = bounded(source.negativeConcepts ?? source.negative_concepts, SEMANTIC_CONTEXT_LIMITS.negatives);
  return {
    people: bounded(source.people, SEMANTIC_CONTEXT_LIMITS.people),
    directors: bounded(source.directors ?? source.director, SEMANTIC_CONTEXT_LIMITS.creators),
    actors: bounded(source.actors ?? source.cast, SEMANTIC_CONTEXT_LIMITS.creators),
    semanticConcepts: bounded(source.semanticConcepts ?? source.semantic_concepts ?? source.concepts,
      SEMANTIC_CONTEXT_LIMITS.concepts),
    narrativeMotifs: bounded(source.narrativeMotifs ?? source.narrative_motifs ?? source.motifs,
      SEMANTIC_CONTEXT_LIMITS.motifs),
    styleReferences: bounded(source.styleReferences ?? source.style_references,
      SEMANTIC_CONTEXT_LIMITS.references),
    // Only allowlisted concepts are usable by the strict filter; unknown labels
    // would create silent no-op constraints, so they are dropped here.
    negativeConcepts: normalizeSemanticExclusions(negativeTerms),
    intentType: normalizeSemanticIntentType(source.intentType ?? source.intent_type ?? source.intent)
  };
}

export const EMPTY_SEMANTIC_INTENT_CONTEXT = Object.freeze(createSemanticIntentContext());

/** People signals for entity resolution: explicit people, then cast, then director. */
export function collectSemanticPeople(context, limit = SEMANTIC_CONTEXT_LIMITS.people) {
  const source = context && typeof context === 'object' ? context : {};
  return list([...(source.people || []), ...(source.actors || []), ...(source.directors || [])]).slice(0, limit);
}

/** Concepts the interpreter considers central, in provider order. */
export function collectSemanticConcepts(context) {
  const source = context && typeof context === 'object' ? context : {};
  return list([...(source.semanticConcepts || []), ...(source.narrativeMotifs || [])]);
}

/** Bounded counters only: safe for telemetry, never the values themselves. */
export function semanticContextMetrics(context) {
  const source = context && typeof context === 'object' ? context : {};
  return {
    semanticIntentType: source.intentType || null,
    semanticConceptCount: (source.semanticConcepts || []).length,
    semanticMotifCount: (source.narrativeMotifs || []).length,
    semanticPeopleCount: (source.people || []).length + (source.actors || []).length,
    semanticDirectorCount: (source.directors || []).length,
    semanticStyleReferenceCount: (source.styleReferences || []).length,
    semanticNegativeConceptCount: (source.negativeConcepts || []).length
  };
}

export function isSemanticIntentContext(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
