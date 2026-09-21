/**
 * TMDB data kept outside CanonicalIntent. The context is request-scoped and is
 * never exposed as part of the public search response.
 */
export function createResolvedIntentContext({
  resolvedTitles = [],
  requestedTitles = [],
  unresolvedTitles = [],
  resolvedPeople = [],
  unresolvedPeople = [],
  metrics = {}
} = {}) {
  return {
    resolvedTitles: [...resolvedTitles],
    // Resolved works the raw query names as the answer itself (not a style
    // seed). Empty by default: only the orchestrator fills it, after comparing
    // the user query with the titles the resolver confirmed.
    requestedTitles: [...requestedTitles],
    unresolvedTitles: [...unresolvedTitles],
    resolvedPeople: [...resolvedPeople],
    unresolvedPeople: [...unresolvedPeople],
    metrics: {
      entityResolutionAttempted: Boolean(metrics.entityResolutionAttempted),
      requestedWorkDetected: Boolean(metrics.requestedWorkDetected),
      requestedWorkCount: Number(metrics.requestedWorkCount || 0),
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
