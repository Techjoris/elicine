export const FALLBACK_REASONS = Object.freeze({
  PROVIDER_ERROR: 'provider_error',
  TIMEOUT: 'timeout',
  NO_CANDIDATES: 'no_candidates',
  NO_RELEVANT_RESULTS: 'no_relevant_results',
  RANKING_ERROR: 'ranking_error',
  FALLBACK_USED: 'fallback_used'
});

export function createFallbackTelemetry() {
  return {
    fallbackAttempted: false,
    fallbackUsed: false,
    fallbackReason: null,
    fallbackSource: null,
    fallbackRelaxationApplied: false
  };
}

/**
 * Records only fixed operational labels. Queries, vectors and provider output
 * must never be passed to this boundary.
 */
export function recordFallback(telemetry, {
  attempted = true,
  used = false,
  reason,
  source,
  relaxationApplied = false
} = {}) {
  if (!telemetry) return;
  Object.assign(telemetry, {
    fallbackAttempted: Boolean(attempted),
    fallbackUsed: Boolean(used),
    fallbackReason: Object.values(FALLBACK_REASONS).includes(reason) ? reason : FALLBACK_REASONS.PROVIDER_ERROR,
    fallbackSource: typeof source === 'string' && source ? source : null,
    fallbackRelaxationApplied: Boolean(relaxationApplied)
  });
}

export function failedSourceLabel(errors = []) {
  const sources = [...new Set(errors.map(error => error?.source).filter(Boolean))];
  return sources.length === 1 ? sources[0] : (sources.length > 1 ? 'multiple_sources' : null);
}
