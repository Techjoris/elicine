import {
  createCanonicalIntentFromLegacy,
  generateCanonicalIntentShadow
} from './canonicalIntentShadow.js';

export const CANONICAL_SEARCH_ENGINE_FLAG = 'CANONICAL_SEARCH_ENGINE_ENABLED';

export function isCanonicalSearchEngineEnabled(env = process.env) {
  return String(env?.[CANONICAL_SEARCH_ENGINE_FLAG] || '').toLowerCase() === 'true';
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
export function orchestrateSearch({
  interpreted,
  cleanQuery,
  requestedMediaType,
  telemetry,
  env = process.env,
  createIntent = createCanonicalIntentFromLegacy
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
    return { path: 'legacy', interpreted, canonicalIntent: null };
  };

  if (!isCanonicalSearchEngineEnabled(env)) {
    // Preserve Phase 2 observability while the legacy engine remains visible.
    generateCanonicalIntentShadow(interpreted, { userQuery: cleanQuery }, telemetry);
    return legacy();
  }

  try {
    const canonicalIntent = createIntent(interpreted, { userQuery: cleanQuery });
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
      canonicalIntent
    };
  } catch {
    // Fixed code only: exception text can include provider output.
    return legacy('CANONICAL_ORCHESTRATION_FAILED');
  }
}
