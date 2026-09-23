/**
 * Compositional signal ledger.
 *
 * The ranker already measures every dimension of an intent (genre, theme, mood,
 * keyword, year, origin, person, reference, relation, comparative). What it did
 * not measure is the *intersection* of those dimensions: a weighted average of
 * per-dimension coverage rewards a candidate that answers one dimension
 * perfectly exactly like one that answers four dimensions well, which is how a
 * single-concept candidate used to rival the work that satisfies the whole
 * sentence.
 *
 * This module groups the already computed evidence into independent *families*
 * of signals and derives, from those families only:
 *
 *   coverage       weighted mean of the family scores - how much of the request
 *                  is answered (the historical behaviour);
 *   intersection   weighted geometric mean - satisfying every described family,
 *                  which grows much faster with each additional family;
 *   satisfiedShare weighted share of families actually answered, used to
 *                  penalise partial matches without ever filtering anyone;
 *   composition    blend of coverage and intersection, active only when the
 *                  request really describes several independent families.
 *
 * No title, no identifier, no year and no genre is ever hardcoded here: every
 * score is read from the evidence the ranker already computed.
 */

import { conceptMatch, conceptSpecificity } from './semanticLexicon.js';

export const COMPOSITION_CONFIG = Object.freeze({
  /** Relative independence of each family: how much a family counts in the intersection. */
  familyWeights: Object.freeze({
    format: 0.85, genre: 0.55, era: 0.6, origin: 0.5, people: 1,
    reference: 0.85, themes: 1, mood: 0.8, narrative: 1, style: 0.9,
    relation: 0.95, preference: 0.7
  }),
  /** A family is "answered" from this score upwards. */
  satisfiedThreshold: 0.35,
  /** Keeps the geometric mean comparable to a mean when one family is missing. */
  geometricFloor: 0.08,
  /** Share of the intent score given to the intersection when several families are described. */
  compositionWeight: 0.38,
  /** Bounded penalty applied to a candidate that only answers part of the request. */
  partialPenaltyWeight: 0.24,
  /** Below this many described families nothing changes: a bare category keeps its ranking. */
  partialPenaltyMinFamilies: 3,
  partialPenaltyExponent: 1.2
});

/**
 * Generic vocabulary of *style* descriptors, as opposed to narrative elements.
 * A concept carrying one of these words is a direction of staging, so it is
 * measured in its own family instead of being forgiven by the narrative ones.
 */
/** Whole formulations that describe a staging rather than a plot. */
const STYLE_PHRASES = new Set([
  'slow burn', 'slowburn', 'mise en scene', 'neo noir', 'neonoir', 'film noir', 'plan sequence',
  'longs plans', 'true story', 'faits reels', 'histoire vraie', 'based on a true story'
]);

/** Single words that describe a staging, a look or a tone of direction. */
const STYLE_WORDS = new Set([
  'style', 'stylee', 'stylise', 'stylisee', 'stylized', 'stylised', 'esthetic', 'esthetique', 'aesthetic',
  'aesthetique', 'visual', 'visuel', 'visuelle', 'photography', 'photographie', 'cinematography',
  'cinematographie', 'palette', 'grain', 'contrast', 'contraste', 'staging', 'realistic', 'realiste',
  'realism', 'realisme', 'hyperrealiste', 'hyperrealistic', 'naturaliste', 'naturalistic', 'naturalism',
  'minimaliste', 'minimalist', 'epure', 'epuree', 'atmospheric', 'atmospherique', 'immersive', 'immersif',
  'onirique', 'dreamlike', 'surreal', 'surrealiste', 'contemplative', 'contemplatif', 'slow', 'lent',
  'lente', 'noir', 'gritty', 'cru', 'crue', 'brut', 'brute', 'documentary', 'documentaire', 'handheld',
  'symmetry', 'symetrie', 'clinical', 'clinique', 'sobre', 'sober', 'neonoir'
]);

const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/** True when a concept word belongs to the stylistic vocabulary above. */
export function isStyleConcept(term) {
  const key = normalize(term);
  if (!key) return false;
  if (STYLE_PHRASES.has(key)) return true;
  const words = key.split(' ');
  return words.some(word => STYLE_WORDS.has(word));
}

/**
 * Style coverage of one candidate: how much of the stylistic vocabulary the
 * request carries is really visible in its metadata. Returns null when the
 * request states no stylistic direction at all.
 */
export function styleFamilyScore({ styleConcepts = [], text = '', structured = [] } = {}) {
  if (!styleConcepts.length) return null;
  const structuredText = structured.map(value => normalize(typeof value === 'object' ? value?.name ?? value?.id : value))
    .filter(Boolean).join(' ');
  const scores = styleConcepts.map(concept => Math.max(conceptMatch(text, concept), conceptMatch(structuredText, concept)));
  return mean(scores);
}

/**
 * Builds the ledger of independent families the request describes, from the
 * evidence the ranker already computed. Families that the request does not
 * describe are absent: a bare category therefore keeps exactly one family and
 * the composition stays neutral for it.
 */
export function buildSignalLedger({
  intent = {}, resolvedContext = {}, candidate = {}, components = {},
  text = '', structured = [], temporalActive = false,
  relationRequired = false, preferenceApplied = false
} = {}) {
  const families = [];
  const push = (id, score, { active = true, weight } = {}) => {
    if (!active || score == null) return;
    const numeric = clamp(score);
    families.push({
      id,
      weight: weight ?? COMPOSITION_CONFIG.familyWeights[id] ?? 1,
      score: Number(numeric.toFixed(6)),
      satisfied: numeric >= COMPOSITION_CONFIG.satisfiedThreshold
    });
  };

  // Format: the family the user asked about (film / série). Enforced upstream by
  // the strict filter; measured here so the ranker stays honest on its own.
  if (intent.mediaType) {
    push('format', candidate.mediaType === intent.mediaType ? 1 : 0);
  }

  push('genre', components.genreScore, { active: array(intent.genres).length > 0 });
  push('themes', components.themeScore, { active: array(intent.themes).length > 0 });
  push('mood', components.moodScore, { active: array(intent.moods).length > 0 });
  push('narrative', components.keywordScore, { active: array(intent.keywords).length > 0 });

  // Period: an explicit range, or the graded preference a temporal word carries.
  const statesPeriod = intent.yearMin != null || intent.yearMax != null;
  push('era', statesPeriod ? components.yearScore : (temporalActive ? components.temporalScore : null),
    { active: statesPeriod || temporalActive });

  // Origin: language and country are one dimension of the request.
  const originScores = [
    array(intent.languages).length ? components.languageScore : null,
    array(intent.countries).length ? components.countryScore : null
  ].filter(value => value != null);
  push('origin', originScores.length ? mean(originScores) : null);

  push('people', components.entityScore, { active: array(resolvedContext?.resolvedPeople).length > 0 });
  push('reference', components.referenceScore, { active: array(resolvedContext?.resolvedTitles).length > 0 });

  // Style: only the concepts the request states as a direction of staging.
  const styleConcepts = [...array(intent.themes), ...array(intent.moods), ...array(intent.keywords)]
    .map(normalize).filter(term => term && isStyleConcept(term));
  push('style', styleFamilyScore({ styleConcepts, text, structured }), { active: styleConcepts.length > 0 });

  push('relation', components.relationScore, { active: relationRequired === true });
  push('preference', components.preferenceScore, { active: preferenceApplied === true });

  return summarizeLedger(families);
}

/** Derives coverage, intersection, satisfied share and the bounded penalty from a ledger. */
export function summarizeLedger(families = []) {
  const weightSum = families.reduce((sum, family) => sum + family.weight, 0);
  if (!families.length || weightSum <= 0) {
    return {
      families: [], familyCount: 0, coverage: 0, intersection: 0, satisfiedShare: 0,
      partialPenalty: 0, compositionScore: 0, compositionWeight: 0, weakest: 0
    };
  }
  const coverage = families.reduce((sum, family) => sum + family.weight * family.score, 0) / weightSum;
  const { geometricFloor } = COMPOSITION_CONFIG;
  // Geometric mean over the described families: the score grows with each
  // additional family answered, and a family left unanswered weighs far more
  // than it would in an average.
  const intersection = Math.exp(families.reduce((sum, family) =>
    sum + family.weight * Math.log(geometricFloor + (1 - geometricFloor) * family.score), 0) / weightSum);
  const satisfiedShare = families.reduce((sum, family) =>
    sum + family.weight * (family.satisfied ? 1 : 0), 0) / weightSum;

  const multiFamily = families.length >= 2;
  const compositionScore = multiFamily
    ? clamp(coverage * (1 - COMPOSITION_CONFIG.compositionWeight) + intersection * COMPOSITION_CONFIG.compositionWeight)
    : coverage;
  const penalizable = families.length >= COMPOSITION_CONFIG.partialPenaltyMinFamilies;
  const partialPenalty = penalizable
    ? clamp(COMPOSITION_CONFIG.partialPenaltyWeight *
        Math.pow(1 - satisfiedShare, COMPOSITION_CONFIG.partialPenaltyExponent))
    : 0;

  return {
    families,
    familyCount: families.length,
    coverage: Number(coverage.toFixed(6)),
    intersection: Number(intersection.toFixed(6)),
    satisfiedShare: Number(satisfiedShare.toFixed(6)),
    partialPenalty: Number(partialPenalty.toFixed(6)),
    compositionScore: Number(compositionScore.toFixed(6)),
    compositionWeight: multiFamily ? COMPOSITION_CONFIG.compositionWeight : 0,
    weakest: Number(Math.min(...families.map(family => family.score)).toFixed(6))
  };
}

/**
 * Concepts the request states that are distinctive enough to be measured on
 * their own. Used by the tests and by callers that need the same granularity
 * as the ranker without duplicating its thresholds.
 */
export function distinctiveConcepts(intent = {}, { genres = [], threshold = 0.6 } = {}) {
  return [...array(intent.themes), ...array(intent.moods), ...array(intent.keywords)]
    .map(normalize).filter(term => term && conceptSpecificity(term, { genres }) >= threshold);
}
