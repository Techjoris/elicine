import { adaptLegacySearchIntent } from './legacyIntentAdapter.js';
import { normalizeSearchIntent } from './normalizeSearchIntent.js';

/**
 * Best-effort synchronous shadow; never influences retrieval. Only fixed codes
 * and booleans reach Phase 0 telemetry, never input or Zod messages.
 * The intent lives only in this request.
 */
export function generateCanonicalIntentShadow(interpreted, context, telemetry) {
  const signals = {
    canonicalIntentGenerated: false,
    canonicalIntentValid: false,
    canonicalIntentNormalizationApplied: null,
    canonicalIntentError: null
  };
  let intent = null;
  let stage = 'adapter';
  try {
    const adapted = adaptLegacySearchIntent(interpreted, context);
    stage = 'normalizer';
    intent = normalizeSearchIntent(adapted);
    signals.canonicalIntentGenerated = true;
    signals.canonicalIntentValid = true;
    // Default insertion counts as normalization; key order does not.
    signals.canonicalIntentNormalizationApplied = Object.keys(intent).some(key =>
      JSON.stringify(adapted[key]) !== JSON.stringify(intent[key]));
  } catch {
    signals.canonicalIntentError = stage === 'adapter'
      ? 'LEGACY_INTENT_ADAPTER_FAILED' : 'CANONICAL_INTENT_VALIDATION_FAILED';
  }
  try {
    if (telemetry) Object.assign(telemetry, signals);
  } catch {
    console.warn('[CanonicalIntent shadow] TELEMETRY_WRITE_FAILED');
  }
  return intent;
}
