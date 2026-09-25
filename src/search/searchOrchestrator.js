import {
  createCanonicalIntentFromLegacy,
  generateCanonicalIntentShadow
} from './canonicalIntentShadow.js';
import { createResolvedIntentContext } from './resolvedIntentContext.js';
import { detectRequestedTitles } from './requestedWork.js';
import { hybridRetrieve, isHybridRetrievalEnabled } from './hybridRetriever.js';
import { filterStrictCandidates } from './strictConstraintFilter.js';
import { rankSearchCandidates } from './searchRanker.js';
import { diversifyRankedCandidates } from './resultDiversifier.js';
import { applyResultBudget } from './resultBudget.js';
import { FALLBACK_REASONS, recordFallback } from './fallbackPolicy.js';
import { summarizeEvaluationCandidates } from './searchEvaluation.js';

export const CANONICAL_SEARCH_ENGINE_FLAG = 'CANONICAL_SEARCH_ENGINE_ENABLED';

export function isCanonicalSearchEngineEnabled(env = process.env) {
  // Canonical is the safe default after Phase 3 parity verification. An
  // explicit false keeps the legacy path as an immediate operational switch.
  return String(env?.[CANONICAL_SEARCH_ENGINE_FLAG] ?? 'true').toLowerCase() !== 'false';
}

function updateTelemetry(telemetry, values) {
  if (!telemetry) return;
  Object.assign(telemetry, values);
}

/**
 * CanonicalIntent is the sole intent contract consumed after this boundary.
 * Provider recommendations remain candidate hints, deliberately separate from
 * intent constraints, so this migration does not alter historical retrieval.
 */
export async function orchestrateSearch({
  interpreted,
  cleanQuery,
  requestedMediaType,
  telemetry,
  env = process.env,
  createIntent = createCanonicalIntentFromLegacy,
  enforceRequestedMediaType = false,
  recoverFallbackSignals = true,
  resolveEntities = null
}) {
  const legacy = (error = null) => {
    updateTelemetry(telemetry, {
      ...(error ? {
        canonicalIntentGenerated: false,
        canonicalIntentValid: false,
        canonicalIntentNormalizationApplied: null,
        canonicalIntentError: 'CANONICAL_ORCHESTRATION_FAILED'
      } : {}),
      searchEnginePath: 'legacy',
      orchestrationSucceeded: null,
      orchestrationFallbackToLegacy: error !== null,
      orchestrationError: error
    });
    return { path: 'legacy', interpreted, canonicalIntent: null,
      resolvedIntentContext: createResolvedIntentContext(),
      // The wording of the request is carried for the ranking only: the temporal
      // preference reads it, the retrieval never does.
      userQuery: typeof cleanQuery === 'string' ? cleanQuery : '' };
  };

  if (!isCanonicalSearchEngineEnabled(env)) {
    // Preserve Phase 2 observability while the legacy engine remains visible.
    generateCanonicalIntentShadow(interpreted, { userQuery: cleanQuery }, telemetry);
    return legacy();
  }

  try {
    const requestedType = requestedMediaType === 'Séries TV' ? 'tv' : requestedMediaType === 'Films' ? 'movie' : null;
    const canonicalIntent = createIntent(enforceRequestedMediaType && requestedType
      ? { ...interpreted, media_type: requestedType } : interpreted,
    { userQuery: cleanQuery, recoverFallbackSignals });
    const canonicalMediaType = canonicalIntent.mediaType;
    const projectedInterpretation = {
      ...interpreted,
      // These are the existing retrieval constraints, now projected solely from
      // CanonicalIntent. Candidate hints (recommendations/matches) are retained.
      media_type: canonicalMediaType || 'all',
      primary_genres: canonicalIntent.genres,
      canonicalGenres: canonicalIntent.genres,
      mood_tags: canonicalIntent.moods,
      // The legacy engine used themes as a mood alias; preserve its old surface
      // when no independently extracted canonical theme exists.
      themes: canonicalIntent.themes.length ? canonicalIntent.themes : interpreted.themes,
      canonicalIntent
    };
    let resolvedIntentContext = createResolvedIntentContext();
    if (typeof resolveEntities === 'function') {
      // Entity failures are isolated per reference by the resolver. A provider
      // adapter failure still leaves the already validated intent usable.
      resolvedIntentContext = { requestedTitles: [],
        ...(await resolveEntities(canonicalIntent) || {}) };
      // Telling apart the work the query names ("Inception") from a work it only
      // compares to ("comme Inception") is pure query/title string logic over the
      // titles the resolver already confirmed: no extra provider call and no LLM
      // call per candidate. A named work becomes the answer it describes, a
      // comparison keeps its seed role.
      const requestedTitles = detectRequestedTitles(cleanQuery, resolvedIntentContext.resolvedTitles);
      if (requestedTitles.length > 0) {
        resolvedIntentContext = { ...resolvedIntentContext, requestedTitles,
          metrics: { ...(resolvedIntentContext.metrics || {}), requestedWorkDetected: true,
            requestedWorkCount: requestedTitles.length } };
      }
      updateTelemetry(telemetry, resolvedIntentContext.metrics || {});
    }
    projectedInterpretation.resolvedIntentContext = resolvedIntentContext;
    updateTelemetry(telemetry, {
      canonicalIntentGenerated: true,
      canonicalIntentValid: true,
      searchEnginePath: 'canonical',
      orchestrationSucceeded: true,
      orchestrationFallbackToLegacy: false,
      orchestrationError: null
    });
    return {
      path: 'canonical',
      interpreted: projectedInterpretation,
      canonicalIntent,
      resolvedIntentContext,
      userQuery: typeof cleanQuery === 'string' ? cleanQuery : ''
    };
  } catch {
    // Fixed code only: exception text can include provider output.
    return legacy('CANONICAL_ORCHESTRATION_FAILED');
  }
}

/** null = historical path; [] = attempted hybrid with no usable candidates. */
export async function orchestrateCandidateRetrieval({
  orchestration,
  services,
  context,
  env = process.env,
  rankCandidates = rankSearchCandidates,
  diversifyCandidates = diversifyRankedCandidates,
  budgetCandidates = applyResultBudget
}) {
  if (!isHybridRetrievalEnabled(env) || !orchestration.canonicalIntent) return null;
  const evaluationTrace = context.evaluationTrace || null;
  if (evaluationTrace) {
    evaluationTrace.canonicalIntent = structuredClone(orchestration.canonicalIntent);
    evaluationTrace.resolvedIntentContext = structuredClone(orchestration.resolvedIntentContext || {});
  }
  try {
    const candidates = await hybridRetrieve({ intent: orchestration.canonicalIntent,
      resolvedContext: orchestration.resolvedIntentContext, services, context });
    if (candidates.length === 0) {
      if (!context.telemetry.fallbackReason) {
        recordFallback(context.telemetry, { reason: FALLBACK_REASONS.NO_CANDIDATES, source: 'hybrid_retrieval' });
      }
      return [];
    }
    const admissible = filterStrictCandidates(candidates, orchestration.canonicalIntent, {
      telemetry: context.telemetry, env
    }).candidates;
    if (evaluationTrace) evaluationTrace.poolAfterStrictFilter = summarizeEvaluationCandidates(admissible);
    if (admissible.length === 0) {
      recordFallback(context.telemetry, { reason: FALLBACK_REASONS.NO_RELEVANT_RESULTS, source: 'strict_filter' });
      return [];
    }
    let ranked;
    try {
      ranked = rankCandidates(admissible, orchestration.canonicalIntent,
        orchestration.resolvedIntentContext, { telemetry: context.telemetry, env,
          queryText: orchestration.userQuery || '',
          userProfile: orchestration.userProfile || null });
    } catch {
      recordFallback(context.telemetry, { reason: FALLBACK_REASONS.RANKING_ERROR, source: 'ranking' });
      return [];
    }
    if (!Array.isArray(ranked) || ranked.length === 0) {
      recordFallback(context.telemetry, { reason: FALLBACK_REASONS.RANKING_ERROR, source: 'ranking' });
      return [];
    }
    if (evaluationTrace) evaluationTrace.scoresPhase8 = summarizeEvaluationCandidates(ranked);
    const diversified = diversifyCandidates(ranked, orchestration.canonicalIntent,
      orchestration.resolvedIntentContext, { telemetry: context.telemetry, env });
    if (evaluationTrace) evaluationTrace.orderAfterDiversification = summarizeEvaluationCandidates(diversified);
    // Quality before quantity: the grid stops where relevance stops instead of
    // filling a fixed number of slots.
    const budgeted = budgetCandidates(diversified, orchestration.canonicalIntent,
      orchestration.resolvedIntentContext, {
        semanticIntentContext: context.semanticIntentContext || null,
        telemetry: context.telemetry,
        env
      });
    if (evaluationTrace) evaluationTrace.finalResults = summarizeEvaluationCandidates(budgeted);
    return budgeted;
  } catch {
    Object.assign(context.telemetry, { hybridRetrievalAttempted: true, hybridRetrievalSucceeded: false,
      retrievalSourceErrorCount: (context.telemetry.retrievalSourceErrorCount || 0) + 1,
      retrievalSourceErrors: [{ source: 'orchestrator', code: 'RETRIEVAL_FAILED' }] });
    recordFallback(context.telemetry, { reason: FALLBACK_REASONS.PROVIDER_ERROR, source: 'orchestrator' });
    return [];
  }
}
