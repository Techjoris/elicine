/**
 * TMDB data kept outside CanonicalIntent. The context is request-scoped and is
 * never exposed as part of the public search response.
 */
export function createResolvedIntentContext({
  resolvedTitles = [],
  unresolvedTitles = [],
  resolvedPeople = [],
  unresolvedPeople = [],
  metrics = {}
} = {}) {
  return {
    resolvedTitles: [...resolvedTitles],
    unresolvedTitles: [...unresolvedTitles],
    resolvedPeople: [...resolvedPeople],
    unresolvedPeople: [...unresolvedPeople],
    metrics: {
      entityResolutionAttempted: Boolean(metrics.entityResolutionAttempted),
      entityResolutionInputCount: Number(metrics.entityResolutionInputCount || 0),
      entityResolutionResolvedCount: Number(metrics.entityResolutionResolvedCount || 0),
      entityResolutionUnresolvedCount: Number(metrics.entityResolutionUnresolvedCount || 0),
      entityResolutionAmbiguousCount: Number(metrics.entityResolutionAmbiguousCount || 0),
      entityResolutionErrorCount: Number(metrics.entityResolutionErrorCount || 0),
      entityResolutionDurationMs: Number(metrics.entityResolutionDurationMs || 0),
      personResolutionAttempted: Boolean(metrics.personResolutionAttempted),
      personResolutionInputCount: Number(metrics.personResolutionInputCount || 0),
      personResolutionResolvedCount: Number(metrics.personResolutionResolvedCount || 0),
      personResolutionUnresolvedCount: Number(metrics.personResolutionUnresolvedCount || 0),
      personResolutionAmbiguousCount: Number(metrics.personResolutionAmbiguousCount || 0),
      personResolutionErrorCount: Number(metrics.personResolutionErrorCount || 0),
      personResolutionDurationMs: Number(metrics.personResolutionDurationMs || 0)
    }
  };
}
