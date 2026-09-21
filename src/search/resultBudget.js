/**
 * Result budget: how many works a search should return, and how far the tail
 * may extend. Éliciné answers with the best matches instead of filling a grid.
 *
 * The intent shape decides everything:
 *  - identification: the user describes ONE precise work (1 result when the
 *    convergence is strong, 2-3 only when a real ambiguity remains);
 *  - selection: the user wants several works (category, style, mood, theme,
 *    similar-to-title, discovery) and gets a short, relevance-bounded list.
 *
 * Each bucket declares a window: `target` is the grid size it may never
 * exceed, `minKeep` the smallest answer it aims at. Relevance decides inside
 * that window, so a range is only reached when the ranked pool supports it:
 * the grid is never padded with candidates under the relative floor. The rule
 * is identical for films and for series: it reads the shape of the request and
 * the scores the ranking already produced, never a title, a media type or a
 * catalogue.
 *
 * This module never retrieves, ranks or scores: it only trims an already
 * ranked pool, using the ranking scores it is given.
 */

export const RESULT_BUDGET_FLAG = 'RESULT_BUDGET_ENABLED';

export const SEARCH_INTENT_SHAPES = Object.freeze({
  IDENTIFICATION: 'identification',
  SELECTION: 'selection'
});

export const RESULT_BUDGET_BUCKETS = Object.freeze({
  IDENTIFICATION_CONFIDENT: 'identification_confident',
  IDENTIFICATION_AMBIGUOUS: 'identification_ambiguous',
  PRECISE_RECOMMENDATION: 'precise_recommendation',
  SIMILAR_TO_TITLE: 'similar_to_title',
  NORMAL_RECOMMENDATION: 'normal_recommendation',
  BROAD_DISCOVERY: 'broad_discovery'
});

/**
 * Documented mission windows. `target` is the largest grid the bucket may
 * return, `minKeep` the smallest answer it aims at, and `minScoreRatio` the
 * relative floor under the best score: everything below it is tail, and the
 * tail is dropped rather than padded.
 */
export const RESULT_BUDGETS = Object.freeze({
  [RESULT_BUDGET_BUCKETS.IDENTIFICATION_CONFIDENT]: Object.freeze({ target: 1, minKeep: 1, minScoreRatio: 0 }),
  [RESULT_BUDGET_BUCKETS.IDENTIFICATION_AMBIGUOUS]: Object.freeze({ target: 3, minKeep: 2, minScoreRatio: 0.45 }),
  [RESULT_BUDGET_BUCKETS.PRECISE_RECOMMENDATION]: Object.freeze({ target: 10, minKeep: 6, minScoreRatio: 0.4 }),
  [RESULT_BUDGET_BUCKETS.SIMILAR_TO_TITLE]: Object.freeze({ target: 12, minKeep: 8, minScoreRatio: 0.35 }),
  [RESULT_BUDGET_BUCKETS.NORMAL_RECOMMENDATION]: Object.freeze({ target: 12, minKeep: 10, minScoreRatio: 0.3 }),
  [RESULT_BUDGET_BUCKETS.BROAD_DISCOVERY]: Object.freeze({ target: 20, minKeep: 12, minScoreRatio: 0.25 })
});

/** A single work is only returned alone when the evidence is unambiguous. */
export const IDENTIFICATION_CONFIDENCE = Object.freeze({
  minTopConvergence: 0.55,
  minScoreMargin: 1.35,
  maxRunnerUpConvergence: 0.45,
  minRichness: 1
});

export const INTENT_TYPES = Object.freeze({
  SPECIFIC_TITLE_DESCRIPTION: 'specific_title_description',
  SIMILAR_TO_TITLE: 'similar_to_title',
  PERSON_SEARCH: 'person_search',
  THEMATIC_SEARCH: 'thematic_search',
  MOOD_SEARCH: 'mood_search',
  CONSTRAINT_SEARCH: 'constraint_search',
  MIXED: 'mixed'
});

/** Richness at which a selection is specific enough to deserve a short grid. */
export const PRECISE_RECOMMENDATION_RICHNESS = 3;
export const NORMAL_RECOMMENDATION_RICHNESS = 2;

export function isResultBudgetEnabled(env = process.env) {
  return String(env?.[RESULT_BUDGET_FLAG] ?? 'true').toLowerCase() !== 'false';
}

const size = value => (Array.isArray(value) ? value.length : 0);
const array = value => (Array.isArray(value) ? value : value == null ? [] : [value]);
const scoreOf = candidate => {
  const value = Number(candidate?.ranking?.finalScore);
  return Number.isFinite(value) ? value : null;
};

/**
 * Number of independent intent dimensions the search actually constrains.
 * A query rich in genres, moods, concepts, keywords, titles, people and hard
 * constraints deserves a short precise grid; a vague one stays broad.
 */
export function intentSignalRichness(intent = {}, semanticIntentContext = {}, resolvedContext = {}) {
  const context = semanticIntentContext && typeof semanticIntentContext === 'object' ? semanticIntentContext : {};
  const resolved = resolvedContext && typeof resolvedContext === 'object' ? resolvedContext : {};
  const dimensions = [
    size(intent.genres) > 0,
    size(intent.moods) > 0,
    size(intent.themes) + size(context.semanticConcepts) + size(context.narrativeMotifs) > 0,
    size(intent.keywords) > 0,
    size(intent.knownTitles) + size(context.styleReferences) > 0,
    size(context.people) + size(context.actors) + size(context.directors) + size(resolved.resolvedPeople) > 0,
    intent.yearMin != null || intent.yearMax != null || intent.runtimeMin != null ||
      intent.runtimeMax != null || intent.minRating != null || intent.adult != null ||
      size(intent.languages) > 0 || size(intent.countries) > 0
  ];
  return dimensions.filter(Boolean).length;
}

/**
 * The interpreter's intent type is the primary signal. A person search only
 * becomes an identification when the query also describes the work itself
 * (narrative concepts), otherwise it is an open filmography selection.
 */
export function resolveSearchIntentShape(intentType, intent = {}, semanticIntentContext = {}) {
  if (intentType === INTENT_TYPES.SPECIFIC_TITLE_DESCRIPTION) return SEARCH_INTENT_SHAPES.IDENTIFICATION;
  if (intentType === INTENT_TYPES.SIMILAR_TO_TITLE) return SEARCH_INTENT_SHAPES.SELECTION;
  if (intentType === INTENT_TYPES.PERSON_SEARCH) {
    const describesWork = size(intent.themes) + size(intent.keywords) > 0 ||
      size(semanticIntentContext?.semanticConcepts) + size(semanticIntentContext?.narrativeMotifs) > 0;
    return describesWork ? SEARCH_INTENT_SHAPES.IDENTIFICATION : SEARCH_INTENT_SHAPES.SELECTION;
  }
  return SEARCH_INTENT_SHAPES.SELECTION;
}

export function resolveSelectionBucket(intentType, richness) {
  if (intentType === INTENT_TYPES.SIMILAR_TO_TITLE) return RESULT_BUDGET_BUCKETS.SIMILAR_TO_TITLE;
  if (richness >= PRECISE_RECOMMENDATION_RICHNESS) return RESULT_BUDGET_BUCKETS.PRECISE_RECOMMENDATION;
  if (richness >= NORMAL_RECOMMENDATION_RICHNESS) return RESULT_BUDGET_BUCKETS.NORMAL_RECOMMENDATION;
  return RESULT_BUDGET_BUCKETS.BROAD_DISCOVERY;
}

/**
 * Strong convergence on the best candidate, with no comparable runner-up,
 * means the described work has been identified. Otherwise the answer keeps
 * room for 2-3 plausible works. `richness` guards the degenerate case of a
 * query too thin to identify anything.
 */
export function isConfidentIdentification(candidates, richness = IDENTIFICATION_CONFIDENCE.minRichness) {
  if (Number(richness) < IDENTIFICATION_CONFIDENCE.minRichness) return false;
  const ranked = array(candidates).filter(candidate => scoreOf(candidate) != null);
  const [top, runnerUp] = ranked;
  if (!top) return false;
  if (Number(top.ranking?.convergenceScore || 0) < IDENTIFICATION_CONFIDENCE.minTopConvergence) return false;
  if (!runnerUp) return true;
  const topScore = scoreOf(top);
  const runnerUpScore = scoreOf(runnerUp);
  if (runnerUpScore <= 0) return true;
  if (topScore >= runnerUpScore * IDENTIFICATION_CONFIDENCE.minScoreMargin) return true;
  return Number(runnerUp.ranking?.convergenceScore || 0) < IDENTIFICATION_CONFIDENCE.maxRunnerUpConvergence;
}

export function resolveResultBudget(intent = {}, semanticIntentContext = null, candidates = [],
  resolvedContext = {}) {
  const context = semanticIntentContext && typeof semanticIntentContext === 'object' ? semanticIntentContext : {};
  const intentType = context.intentType || null;
  const richness = intentSignalRichness(intent, context, resolvedContext);
  const shape = resolveSearchIntentShape(intentType, intent, context);
  const bucket = shape === SEARCH_INTENT_SHAPES.IDENTIFICATION
    ? (isConfidentIdentification(candidates, richness)
        ? RESULT_BUDGET_BUCKETS.IDENTIFICATION_CONFIDENT
        : RESULT_BUDGET_BUCKETS.IDENTIFICATION_AMBIGUOUS)
    : resolveSelectionBucket(intentType, richness);
  const plan = RESULT_BUDGETS[bucket];
  return Object.freeze({
    shape, bucket, intentType, richness,
    target: plan.target, minKeep: plan.minKeep, minScoreRatio: plan.minScoreRatio
  });
}

/**
 * Trims an already ranked pool. The relative floor under the best score is the
 * relevance cut: everything below it is tail, and the tail is dropped rather
 * than used to fill the grid. An unranked pool (legacy or direct resolution)
 * is only capped.
 */
export function applyResultBudget(candidates, intent = {}, resolvedContext = {}, {
  semanticIntentContext = null, telemetry = null, env = process.env,
  enabled = isResultBudgetEnabled(env)
} = {}) {
  const input = Array.isArray(candidates) ? candidates : [];
  if (!enabled || input.length === 0) return input;
  const plan = resolveResultBudget(intent, semanticIntentContext, input, resolvedContext);
  const scores = input.map(scoreOf);
  const ranked = scores.some(score => score != null);
  const top = ranked ? Math.max(...scores.map(score => score ?? 0)) : 0;
  const floor = ranked && plan.minScoreRatio > 0 ? top * plan.minScoreRatio : null;
  const kept = input.filter((_, index) => floor == null ||
    (scores[index] != null && scores[index] >= floor)).slice(0, plan.target);
  if (telemetry) {
    Object.assign(telemetry, {
      resultBudgetApplied: true,
      resultBudgetShape: plan.shape,
      resultBudgetBucket: plan.bucket,
      resultBudgetTarget: plan.target,
      resultBudgetMinKeep: plan.minKeep,
      resultBudgetInputCount: input.length,
      resultBudgetOutputCount: kept.length
    });
  }
  return kept;
}
