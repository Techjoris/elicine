import crypto from 'crypto';

const MAX_POOL_OBSERVATIONS = 128;
const PERSISTENCE_TIMEOUT_MS = 750;
const VALID_FALLBACK_REASONS = new Set([
  'provider_error', 'timeout', 'no_candidates', 'no_relevant_results',
  'ranking_error', 'fallback_used'
]);

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(finiteNumber(value, fallback)));
}

function clampScore(value) {
  if (!Number.isFinite(Number(value))) return null;
  const numeric = Number(value);
  // Ranking telemetry is 0..1; legacy response match_rate is 0..100.
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

function normalizeMediaType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'movie' || normalized === 'movies' || normalized === 'film' || normalized === 'films') return 'movie';
  if (normalized === 'tv' || normalized === 'serie' || normalized === 'series' || normalized.includes('série') || normalized.includes('tv')) return 'tv';
  if (normalized === 'all' || normalized === 'tous' || normalized === 'both') return 'all';
  return null;
}

function getResults(telemetry, payload) {
  if (Array.isArray(telemetry?.results)) return telemetry.results;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.movies)) return payload.movies;
  return [];
}

function resultIdentity(item) {
  const id = item?.id ?? item?.tmdb_id ?? item?.tmdbId;
  if (id === undefined || id === null || id === '') return null;
  const mediaType = normalizeMediaType(item?.mediaType ?? item?.media_type) || 'unknown';
  return `${mediaType}:${String(id).trim()}`;
}

/** A one-way technical fingerprint used to spot repeated generic pools. */
export function fingerprintResultSet(results = []) {
  const identities = [...new Set(results.map(resultIdentity).filter(Boolean))].sort();
  if (identities.length === 0) return null;
  return crypto.createHash('sha256').update(identities.join('|')).digest('hex');
}

function detectRepeatedPool(telemetry, fingerprint) {
  if (!fingerprint) return false;
  const observations = globalThis.__elicineTelemetryPoolObservations ||
    (globalThis.__elicineTelemetryPoolObservations = new Map());
  const previous = observations.get(fingerprint);
  const queryHash = typeof telemetry?.queryHash === 'string' ? telemetry.queryHash : null;
  observations.set(fingerprint, { queryHash, at: Date.now() });
  while (observations.size > MAX_POOL_OBSERVATIONS) observations.delete(observations.keys().next().value);
  return Boolean(previous && previous.queryHash && queryHash && previous.queryHash !== queryHash);
}

export function resetTelemetryPoolObservations() {
  globalThis.__elicineTelemetryPoolObservations?.clear();
}

function getMediaType(telemetry) {
  return normalizeMediaType(
    telemetry?.mediaType || telemetry?.detectedConstraints?.requestedMediaType ||
    telemetry?.canonicalIntent?.mediaType
  );
}

function getFallbackReason(telemetry, payload) {
  const reason = telemetry?.fallbackReason || payload?.fallbackReason;
  return VALID_FALLBACK_REASONS.has(reason) ? reason : null;
}

/**
 * Converts the in-memory request trace into the strict database allow-list.
 * This function deliberately never reads rawQuery, CanonicalIntent text,
 * titles, provider payloads or vectors.
 */
export function buildSearchTelemetryRow(telemetry, payload = {}, statusCode = 200) {
  const results = getResults(telemetry, payload);
  const finalCount = Math.max(nonNegativeInteger(telemetry?.finalResultCount), results.length);
  const rankingScore = telemetry?.rankingAttempted || finiteNumber(telemetry?.rankingTopScore) > 0
    ? telemetry?.rankingTopScore
    : null;
  const topScore = clampScore(
    rankingScore ?? telemetry?.ranking?.topScore ?? results[0]?.score ?? results[0]?.match_rate
  );
  const totalDuration = nonNegativeInteger(telemetry?.totalLatencyMs);
  const strictAttempted = Boolean(telemetry?.strictFilterAttempted);
  const strictInput = nonNegativeInteger(telemetry?.strictFilterInputCount);
  const strictOutput = nonNegativeInteger(
    telemetry?.strictFilterOutputCount,
    strictAttempted ? 0 : nonNegativeInteger(telemetry?.retrievalCandidateCountFinal)
  );
  const vectorError = String(telemetry?.vectorRetrievalError || '');
  const fingerprint = fingerprintResultSet(results);
  const genericPoolSuspected = detectRepeatedPool(telemetry, fingerprint) ||
    Boolean(telemetry?.genericPoolSuspected);

  return {
    search_id: telemetry?.searchId || telemetry?.queryId || crypto.randomUUID(),
    created_at: telemetry?.startedAt ? new Date(telemetry.startedAt).toISOString() : new Date().toISOString(),
    media_type: getMediaType(telemetry),
    engine_path: String(telemetry?.searchEnginePath || telemetry?.enginePath || telemetry?.engineMode || 'unknown').slice(0, 80),
    locale: telemetry?.locale ? String(telemetry.locale).slice(0, 32) : null,
    llm_used: Boolean(telemetry?.llmUsed || finiteNumber(telemetry?.llmCalls) > 0),
    fallback_used: Boolean(telemetry?.fallbackUsed || telemetry?.fallbackTriggered || payload?.fallback_triggered || payload?.isFallbackMode),
    fallback_reason: getFallbackReason(telemetry, payload),
    fallback_source: typeof telemetry?.fallbackSource === 'string' ? telemetry.fallbackSource.slice(0, 80) : null,
    fallback_relaxation_applied: Boolean(telemetry?.fallbackRelaxationApplied),
    candidate_count: nonNegativeInteger(telemetry?.retrievalCandidateCountBeforeDedup ?? telemetry?.candidateCounts?.hybrid),
    filtered_count: strictAttempted ? strictOutput : nonNegativeInteger(telemetry?.retrievalCandidateCountFinal),
    final_count: finalCount,
    top_score: topScore,
    retrieval_duration_ms: nonNegativeInteger(telemetry?.hybridRetrievalDurationMs),
    ranking_duration_ms: nonNegativeInteger(telemetry?.rankingDurationMs),
    total_duration_ms: totalDuration,
    provider_error_count: nonNegativeInteger(telemetry?.retrievalSourceErrorCount),
    hybrid_retrieval_succeeded: Boolean(telemetry?.hybridRetrievalSucceeded),
    vector_used: Boolean(telemetry?.vectorRetrievalAttempted || finiteNumber(telemetry?.retrievalSupabaseVectorCount) > 0),
    vector_succeeded: Boolean(telemetry?.vectorRetrievalSucceeded),
    vector_candidate_count: nonNegativeInteger(telemetry?.vectorRetrievalCandidateCount),
    embedding_duration_ms: nonNegativeInteger(telemetry?.embeddingDurationMs),
    semantic_expansion_used: Boolean(telemetry?.semanticExpansionApplied),
    semantic_expansion_term_count: nonNegativeInteger(telemetry?.semanticExpansionTermCount),
    semantic_keyword_resolved_count: nonNegativeInteger(telemetry?.semanticKeywordResolvedCount),
    strict_filter_input_count: strictInput,
    strict_filter_rejected_count: nonNegativeInteger(telemetry?.strictFilterRejectedCount),
    strict_filter_unknown_count: nonNegativeInteger(telemetry?.strictFilterUnknownCount),
    rejected_media_type: nonNegativeInteger(telemetry?.rejectedMediaType),
    rejected_year: nonNegativeInteger(telemetry?.rejectedYear),
    rejected_genre: nonNegativeInteger(telemetry?.rejectedGenre),
    rejected_title: nonNegativeInteger(telemetry?.rejectedTitle),
    rejected_semantic_exclusion: nonNegativeInteger(telemetry?.rejectedSemanticExclusion),
    ranking_candidate_count: nonNegativeInteger(telemetry?.rankingCandidateCount),
    diversification_reordered_count: nonNegativeInteger(telemetry?.diversificationReorderedCount),
    generic_pool_suspected: genericPoolSuspected,
    low_confidence_result: Boolean(finalCount > 0 && topScore !== null && topScore < 0.45),
    embedding_unusable: Boolean(vectorError && /EMBEDDING|VECTOR_RPC|UNAVAILABLE|INVALID/i.test(vectorError)),
    no_candidates_after_filter: Boolean(strictAttempted && strictInput > 0 && strictOutput === 0),
    no_relevant_results: Boolean(finalCount === 0),
    excessive_duration: Boolean(totalDuration > 5000),
    result_set_fingerprint: fingerprint,
    status_code: Number.isInteger(Number(statusCode)) ? Number(statusCode) : null,
    interpreter_path: typeof telemetry?.semanticInterpreterPath === 'string'
      ? telemetry.semanticInterpreterPath.slice(0, 40) : null,
    interpreter_reason: typeof telemetry?.semanticInterpreterReason === 'string'
      ? telemetry.semanticInterpreterReason.slice(0, 40) : null
  };
}

function timeoutResult() {
  return { timedOut: true, error: new Error('SEARCH_TELEMETRY_TIMEOUT') };
}

// Added after the initial telemetry table. A database that has not applied the
// interpreter migration must keep writing its base row instead of losing it.
const OPTIONAL_INTERPRETER_COLUMNS = ['interpreter_path', 'interpreter_reason'];
const missingInterpreterColumns = error => {
  const text = `${error?.message || ''} ${error?.code || ''}`;
  return OPTIONAL_INTERPRETER_COLUMNS.some(column => text.includes(column)) || /PGRST204/i.test(text);
};

/**
 * Persists exactly one summary row. A missing table, rejected insert or timeout
 * is converted to a fixed operational result and never breaks the search.
 */
export async function persistSearchTelemetry({ client, telemetry, payload = {}, statusCode = 200, timeoutMs = PERSISTENCE_TIMEOUT_MS } = {}) {
  if (!telemetry || telemetry.telemetryPersistenceAttempted) return { persisted: false, skipped: true };
  telemetry.telemetryPersistenceAttempted = true;
  if (!client || typeof client.from !== 'function') return { persisted: false, skipped: true };

  const row = buildSearchTelemetryRow(telemetry, payload, statusCode);
  try {
    const insertRow = async target => Promise.race([
      Promise.resolve(client.from('search_telemetry').insert(target)),
      new Promise(resolve => setTimeout(() => resolve(timeoutResult()), Math.max(1, timeoutMs)))
    ]);
    let result = await insertRow(row);
    if (result?.error && missingInterpreterColumns(result.error)) {
      const reduced = { ...row };
      for (const column of OPTIONAL_INTERPRETER_COLUMNS) delete reduced[column];
      result = await insertRow(reduced);
    }
    if (result?.timedOut || result?.error) {
      return { persisted: false, error: result?.error || new Error('SEARCH_TELEMETRY_INSERT_FAILED'), row };
    }
    telemetry.telemetryPersisted = true;
    return { persisted: true, row };
  } catch (error) {
    return { persisted: false, error, row };
  }
}

export const SEARCH_TELEMETRY_PERSISTENCE_TIMEOUT_MS = PERSISTENCE_TIMEOUT_MS;
