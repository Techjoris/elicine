#!/usr/bin/env node

try { process.loadEnvFile?.('.env.local'); } catch {}
try { process.loadEnvFile?.('.env'); } catch {}

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Usage: npm run search:diagnose -- "votre recherche"');
  process.exitCode = 1;
} else {
  const [
    { supabaseServer },
    { createSearchTelemetry },
    { createTmdbRetrievalClient, createSupabaseLexicalSource },
    { createEmbeddingClient, createQueryEmbeddingService, createSupabaseVectorSource, isVectorRetrievalEnabled },
    { resolveKnownTitles },
    { orchestrateCandidateRetrieval },
    { createSearchEvaluationTrace, inferDiagnosticIntent, recordEvaluationSource }
  ] = await Promise.all([
    import('../api/_security.js'),
    import('../api/searchPhase0.js'),
    import('../src/search/retrievalServices.js'),
    import('../src/search/vectorRetrieval.js'),
    import('../src/search/entityResolver.js'),
    import('../src/search/searchOrchestrator.js'),
    import('../src/search/searchEvaluation.js')
  ]);

  const telemetry = createSearchTelemetry({ executionSurface: 'manual_diagnostic' });
  const trace = createSearchEvaluationTrace();
  const intent = inferDiagnosticIntent(query);
  const tmdbApiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || '';
  const tmdb = createTmdbRetrievalClient({ apiKey: tmdbApiKey, telemetry });
  const resolvedIntentContext = await resolveKnownTitles(intent, { searchCandidates: tmdb.search });
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
  const expectedSources = ['tmdb_search', 'tmdb_discover', 'tmdb_similar', 'tmdb_recommendations',
    'supabase_vector', 'supabase_lexical', 'legacy'];

  const results = await orchestrateCandidateRetrieval({
    orchestration: { canonicalIntent: intent, resolvedIntentContext },
    services,
    context: { telemetry, evaluationTrace: trace }
  });
  for (const source of expectedSources) {
    if (!trace.sources[source]) recordEvaluationSource(trace, source, {
      error: services[source.replace(/^tmdb_/, '')] ? null : 'UNAVAILABLE', expectedMediaType: intent.mediaType
    });
  }
  trace.finalResults = trace.finalResults.length ? trace.finalResults : [];
  const output = {
    mode: 'manual_live_diagnostic',
    evaluationSourceCount: Object.keys(trace.sources).length,
    evaluationEmptyPool: results.length === 0,
    trace
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
