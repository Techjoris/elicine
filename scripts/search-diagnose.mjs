#!/usr/bin/env node

try { process.loadEnvFile?.('.env.local'); } catch {}
try { process.loadEnvFile?.('.env'); } catch {}

const args = process.argv.slice(2);
const expectedIndex = args.indexOf('--expected');
const expectedIdentity = expectedIndex >= 0 ? args.splice(expectedIndex, 2)[1] : null;
const query = args.join(' ').trim();
if (!query) {
  console.error('Usage: npm run search:diagnose -- "votre recherche"');
  process.exitCode = 1;
} else {
  const [
    { supabaseServer },
    { createSearchTelemetry },
    { createTmdbRetrievalClient, createSupabaseLexicalSource },
    { createEmbeddingClient, createQueryEmbeddingService, createSupabaseVectorSource, isVectorRetrievalEnabled },
    { resolveKnownPeople, resolveKnownTitles },
    { interpretSearchQuery },
    { buildHeuristicInterpretation },
    { createCanonicalIntentFromLegacy },
    { orchestrateCandidateRetrieval },
    { createSearchEvaluationTrace, recordEvaluationSource, evaluateCandidateRecall }
  ] = await Promise.all([
    import('../api/_security.js'),
    import('../api/searchPhase0.js'),
    import('../src/search/retrievalServices.js'),
    import('../src/search/vectorRetrieval.js'),
    import('../src/search/entityResolver.js'),
    import('../src/search/semanticInterpreter.js'),
    import('../api/search.js'),
    import('../src/search/canonicalIntentShadow.js'),
    import('../src/search/searchOrchestrator.js'),
    import('../src/search/searchEvaluation.js')
  ]);

  const telemetry = createSearchTelemetry({ executionSurface: 'manual_diagnostic' });
  const trace = createSearchEvaluationTrace();

  // Step 1 — LLM-first semantic interpretation (DeepSeek primary, explicit fallback).
  const interpretation = await interpretSearchQuery({
    query,
    targetMediaType: 'Tous',
    telemetry,
    heuristicInterpretation: buildHeuristicInterpretation
  });
  const recoverFallbackSignals = interpretation.path === 'heuristic_fallback';

  // Step 2 — CanonicalIntent plus entity resolution.
  const intent = createCanonicalIntentFromLegacy(interpretation.interpreted, { userQuery: query, recoverFallbackSignals });
  const tmdbApiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || '';
  const tmdb = createTmdbRetrievalClient({ apiKey: tmdbApiKey, telemetry });
  const titleContext = await resolveKnownTitles(intent, { searchCandidates: tmdb.search });
  const personContext = await resolveKnownPeople(interpretation.people, { searchPeople: name => tmdb.person(name) });
  const resolvedIntentContext = {
    ...titleContext,
    resolvedPeople: personContext.resolvedPeople,
    unresolvedPeople: personContext.unresolvedPeople,
    metrics: { ...titleContext.metrics, ...personContext.metrics }
  };

  // Step 3 — Hybrid retrieval, strict filter, ranking, diversification.
  const queryEmbedding = createQueryEmbeddingService({ client: createEmbeddingClient(), telemetry });
  const vector = isVectorRetrievalEnabled() ? createSupabaseVectorSource({
    client: supabaseServer, queryEmbedding, telemetry
  }) : null;
  const services = {
    ...tmdb,
    lexical: createSupabaseLexicalSource(supabaseServer),
    vector,
    legacy: async () => []
  };
  const expectedSources = ['tmdb_person_credits', 'tmdb_search', 'tmdb_discover', 'tmdb_similar', 'tmdb_recommendations',
    'supabase_vector', 'supabase_lexical', 'legacy'];
  const results = await orchestrateCandidateRetrieval({
    orchestration: { canonicalIntent: intent, resolvedIntentContext },
    services,
    context: { telemetry, evaluationTrace: trace, semanticIntentContext: interpretation.semanticContext }
  });
  for (const source of expectedSources) {
    if (!trace.sources[source]) recordEvaluationSource(trace, source, {
      error: services[source.replace(/^tmdb_/, '')] ? null : 'UNAVAILABLE', expectedMediaType: intent.mediaType
    });
  }

  const describe = candidate => ({
    rank: null,
    tmdbId: candidate?.tmdbId ?? null,
    mediaType: candidate?.mediaType ?? null,
    title: candidate?.title ?? candidate?.originalTitle ?? null,
    finalScore: candidate?.ranking?.finalScore ?? null,
    matchScore: candidate?.ranking?.matchScore ?? null,
    sources: [...(candidate?.sources || [])],
    components: candidate?.ranking ? {
      semanticScore: candidate.ranking.semanticScore,
      entityScore: candidate.ranking.entityScore,
      referenceScore: candidate.ranking.referenceScore,
      themeScore: candidate.ranking.themeScore,
      keywordScore: candidate.ranking.keywordScore
    } : null
  });

  const output = {
    mode: 'manual_live_diagnostic',
    query,
    semanticInterpreterPath: interpretation.path,
    provider: interpretation.provider,
    providerId: interpretation.providerId,
    model: interpretation.model,
    interpreterReason: interpretation.reason,
    interpreterPartial: interpretation.partial,
    interpreterAttempts: interpretation.attempts,
    semanticIntentContext: interpretation.semanticContext,
    canonicalIntent: intent,
    recoverFallbackSignals,
    resolvedTitles: (titleContext.resolvedTitles || []).map(seed => ({
      inputTitle: seed.inputTitle, canonicalTitle: seed.canonicalTitle, mediaType: seed.mediaType, tmdbId: seed.tmdbId
    })),
    unresolvedTitles: titleContext.unresolvedTitles || [],
    resolvedPeople: (personContext.resolvedPeople || []).map(person => ({
      inputName: person.inputName, name: person.name, tmdbId: person.tmdbId, confidence: person.resolutionConfidence
    })),
    unresolvedPeople: personContext.unresolvedPeople || [],
    evaluationSourceCount: Object.keys(trace.sources).length,
    evaluationEmptyPool: results.length === 0,
    ...(expectedIdentity && /^(movie|tv):\d+$/.test(expectedIdentity) ? {
      candidateRecall: evaluateCandidateRecall(trace.candidatePool, [{ mediaType: expectedIdentity.split(':')[0],
        tmdbId: Number(expectedIdentity.split(':')[1]) }])
    } : {}),
    topResults: results.slice(0, 10).map((candidate, index) => ({ ...describe(candidate), rank: index + 1 })),
    trace
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
