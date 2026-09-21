import crypto from 'crypto';
import { createRetrievalTelemetry } from '../src/search/hybridRetriever.js';

export const SEARCH_ENGINE_MODES = Object.freeze({
  CURRENT_ENGINE: 'CURRENT_ENGINE',
  SHADOW_NEW_ENGINE: 'SHADOW_NEW_ENGINE',
  NEW_ENGINE: 'NEW_ENGINE'
});

const DEFAULT_MODE = SEARCH_ENGINE_MODES.CURRENT_ENGINE;
const BUFFER_KEY = '__elicineSearchPhase0Events';
const MAX_BUFFERED_EVENTS = 200;

export function getSearchEngineMode(env = process.env) {
  const requested = String(env.SEARCH_ENGINE_MODE || DEFAULT_MODE).toUpperCase();
  // Phase 0 deliberately never makes a future engine visible.
  return requested === SEARCH_ENGINE_MODES.CURRENT_ENGINE ? requested : DEFAULT_MODE;
}

export function isShadowModePrepared(env = process.env) {
  return String(env.SEARCH_ENGINE_MODE || '').toUpperCase() === SEARCH_ENGINE_MODES.SHADOW_NEW_ENGINE &&
    String(env.SEARCH_SHADOW_ENABLED || '').toLowerCase() === 'true';
}

export function createSearchTelemetry({ rawQuery = '', locale, executionSurface = 'server' } = {}) {
  const startedAt = Date.now();
  return {
    queryId: crypto.randomUUID(),
    startedAt,
    timestamp: new Date(startedAt).toISOString(),
    queryHash: rawQuery ? crypto.createHash('sha256').update(rawQuery).digest('hex') : null,
    queryLength: String(rawQuery || '').length,
    locale: locale || null,
    executionSurface,
    engineMode: getSearchEngineMode(),
    shadowPrepared: isShadowModePrepared(),
    path: [],
    llmCalls: 0,
    tmdbCalls: 0,
    ...createRetrievalTelemetry(),
    retrievalTmdbCacheHits: 0,
    candidateCounts: {},
    errors: []
  };
}

export function addSearchTelemetryPath(telemetry, step, details = {}) {
  if (!telemetry) return;
  telemetry.path.push({ step, atMs: Date.now() - telemetry.startedAt, ...details });
}

export function recordSearchLlmAttempt(telemetry, provider, model) {
  if (!telemetry) return;
  telemetry.llmCalls += 1;
  telemetry.llmAttempts = telemetry.llmAttempts || [];
  telemetry.llmAttempts.push({ provider, model, atMs: Date.now() - telemetry.startedAt });
}

export function recordSearchCandidateCount(telemetry, source, count) {
  if (!telemetry || !Number.isFinite(Number(count))) return;
  telemetry.candidateCounts[source] = Number(count);
}

export function finalizeSearchTelemetry(telemetry, payload, statusCode = 200) {
  if (!telemetry) return;

  const results = Array.isArray(payload?.results) ? payload.results :
    (Array.isArray(payload?.movies) ? payload.movies : []);

  telemetry.completedAt = new Date().toISOString();
  telemetry.totalLatencyMs = Date.now() - telemetry.startedAt;
  telemetry.statusCode = statusCode;
  telemetry.provider = payload?.providerUsed || null;
  telemetry.fallbackTriggered = Boolean(payload?.fallback_triggered ?? payload?.isFallbackMode);
  telemetry.finalResultCount = results.length;
  telemetry.candidateCounts.final = results.length;
  telemetry.results = results.map((item, index) => ({
    id: item?.id ?? item?.tmdb_id ?? null,
    mediaType: item?.media_type ?? null,
    rank: index + 1,
    score: Number.isFinite(Number(item?.match_rate)) ? Number(item.match_rate) : null,
    provenance: item?.badge || item?.ai_badge || null
  }));
  telemetry.mediaTypeCounts = telemetry.results.reduce((counts, item) => {
    const key = item.mediaType || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  // In-memory, bounded telemetry only. No Supabase write or extra network call is
  // introduced on the critical path. Raw queries are intentionally never logged.
  const buffer = globalThis[BUFFER_KEY] || (globalThis[BUFFER_KEY] = []);
  buffer.push(telemetry);
  if (buffer.length > MAX_BUFFERED_EVENTS) buffer.splice(0, buffer.length - MAX_BUFFERED_EVENTS);

  if (String(process.env.SEARCH_OBSERVABILITY_LOGS || '').toLowerCase() === 'true') {
    console.info('[Éliciné SearchTelemetry]', JSON.stringify(telemetry));
  }
}

/** Future shadow/new-engine comparisons must use this stable, non-PII shape. */
export function createSearchComparisonContract({ queryId, oldResult, newResult = null } = {}) {
  return {
    queryId: queryId || null,
    oldEngine: oldResult || null,
    newEngine: newResult,
    comparisonStatus: newResult ? 'pending_evaluation' : 'not_run'
  };
}

export function getBufferedSearchTelemetry() {
  return [...(globalThis[BUFFER_KEY] || [])];
}
