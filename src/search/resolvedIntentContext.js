/**
 * TMDB data kept outside CanonicalIntent. The context is request-scoped and is
 * never exposed as part of the public search response.
 */
export function createResolvedIntentContext({
  resolvedTitles = [],
  unresolvedTitles = [],
  metrics = {}
} = {}) {
  return {
    resolvedTitles: [...resolvedTitles],
    unresolvedTitles: [...unresolvedTitles],
    metrics: {
      entityResolutionAttempted: Boolean(metrics.entityResolutionAttempted),
      entityResolutionInputCount: Number(metrics.entityResolutionInputCount || 0),
      entityResolutionResolvedCount: Number(metrics.entityResolutionResolvedCount || 0),
      entityResolutionUnresolvedCount: Number(metrics.entityResolutionUnresolvedCount || 0),
      entityResolutionAmbiguousCount: Number(metrics.entityResolutionAmbiguousCount || 0),
      entityResolutionErrorCount: Number(metrics.entityResolutionErrorCount || 0),
      entityResolutionDurationMs: Number(metrics.entityResolutionDurationMs || 0)
    }
  };
}
