import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INTERPRETER_FALLBACK_REASONS,
  SEMANTIC_INTERPRETER_PATHS,
  buildLegacyInterpretation,
  interpretSearchQuery,
  parseSemanticInterpretation
} from '../../src/search/semanticInterpreter.js';
import { createSemanticIntentContext } from '../../src/search/semanticIntentContext.js';
import { adaptLegacySearchIntent } from '../../src/search/legacyIntentAdapter.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { normalizeSearchIntent } from '../../src/search/normalizeSearchIntent.js';
import { orchestrateSearch } from '../../src/search/searchOrchestrator.js';
import { buildVectorQueryText } from '../../src/search/vectorRetrieval.js';
import { rankSearchCandidates } from '../../src/search/searchRanker.js';
import { buildHeuristicInterpretation } from '../../api/search.js';

const ANSWER = content => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
const json = payload => ANSWER(JSON.stringify(payload));
const singleProvider = {
  id: 'deepseek', label: 'DeepSeek (deepseek-chat)', primary: true,
  endpoints: ['https://api.deepseek.com/chat/completions'],
  model: 'deepseek-chat', envModel: 'DEEPSEEK_MODEL',
  envKeys: ['DEEPSEEK_API_KEY'], requestKey: 'deepseekApiKey',
  jsonFormat: true, timeoutMs: 10
};
const interpret = (query, { fetchImpl, mediaType = 'Tous', keys = {}, providers } = {}) =>
  interpretSearchQuery({ query, targetMediaType: mediaType, keys, env: {}, fetchImpl,
    heuristicInterpretation: buildHeuristicInterpretation,
    ...(providers ? { providers } : {}) });

const canonicalOf = (interpreted, userQuery, recoverFallbackSignals = false) =>
  normalizeSearchIntent(adaptLegacySearchIntent(interpreted, { userQuery, recoverFallbackSignals }));

test('DeepSeek is the primary interpreter and one call per search is enough', async () => {
  const calls = [];
  const result = await interpret('un thriller récent', {
    keys: { deepseekApiKey: 'fixture', groqApiKey: 'fixture' },
    fetchImpl: async url => {
      calls.push(String(url));
      return json({ media_type: 'movie', intent_type: 'mood_search', genres: ['Thriller'], moods: ['dark'] });
    }
  });
  assert.equal(result.path, SEMANTIC_INTERPRETER_PATHS.DEEPSEEK);
  assert.equal(result.providerId, 'deepseek');
  assert.equal(result.partial, false);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('https://api.deepseek.com/'));
  assert.deepEqual(result.attempts, []);
});

test('case A: the person stays a person and "voyage" never becomes the dominant concept', async () => {
  const query = 'film de leonardo dicaprio ou il voyage dans les rêves des autres';
  const result = await interpret(query, {
    keys: { deepseekApiKey: 'fixture' },
    fetchImpl: async () => json({
      media_type: 'movie',
      intent_type: 'specific_title_description',
      genres: ['Science Fiction', 'Thriller'],
      moods: ['mind-bending'],
      semantic_concepts: ['dreams', 'shared dreams', 'subconscious'],
      narrative_motifs: ['layered reality'],
      people: ['Leonardo DiCaprio'],
      clean_query: 'film Leonardo DiCaprio rêves partagés'
    })
  });
  assert.equal(result.semanticContext.intentType, 'specific_title_description');
  assert.deepEqual(result.semanticContext.people, ['Leonardo DiCaprio']);
  assert.deepEqual(result.interpreted.people, ['Leonardo DiCaprio']);

  const canonical = canonicalOf(result.interpreted, query);
  assert.equal(canonical.mediaType, 'movie');
  for (const concept of ['dreams', 'shared dreams', 'subconscious', 'layered reality']) {
    assert.ok(canonical.themes.includes(concept), concept + ' must reach CanonicalIntent.themes');
  }
  assert.equal(canonical.themes.includes('voyage'), false);
  // The no-LLM signals are deliberately unused on a valid interpretation.
  assert.equal(canonical.keywords.includes('rêve'), false);
  assert.equal(canonical.keywords.includes('reves'), false);
});

test('case B: a style reference is a title seed and survives a repaired spelling', async () => {
  const query = 'film du même style que shutter island';
  const result = await interpret(query, {
    keys: { deepseekApiKey: 'fixture' },
    fetchImpl: async () => json({
      media_type: 'movie', intent_type: 'similar_to_title',
      known_titles: ['Shutter Island'], style_references: ['Shutter Island'],
      genres: ['Thriller', 'Mystery'], moods: ['dark', 'unsettling'],
      themes: ['psychological thriller'], keywords: ['island', 'asylum']
    })
  });
  assert.equal(result.semanticContext.intentType, 'similar_to_title');
  assert.deepEqual(result.semanticContext.styleReferences, ['Shutter Island']);
  assert.deepEqual(canonicalOf(result.interpreted, query).knownTitles, ['Shutter Island']);
  // The interpreter may normalize a reference the user misspelled.
  assert.deepEqual(normalizeSearchIntent(adaptLegacySearchIntent(
    { media_type: 'movie', known_titles: ['Shutter Island'] },
    { userQuery: 'un film comme shuter island' })).knownTitles, ['Shutter Island']);
  // The legacy parser keeps its guarantee: no title is promoted from a recommendation.
  assert.deepEqual(normalizeSearchIntent(adaptLegacySearchIntent(
    { reference_titles: ['Interstellar'] }, { userQuery: 'interstllar' })).knownTitles, []);
});

test('cases C and D: modern-war aviation keeps its concepts, per media type', async () => {
  const query = 'une série de guerre moderne avec des avions de combat';
  const payload = {
    intent_type: 'thematic_search', genres: ['War'], moods: ['tense'],
    themes: ['modern warfare', 'military'],
    semantic_concepts: ['military aviation', 'fighter aircraft', 'air force', 'aerial combat'],
    keywords: ['special forces']
  };
  const series = await interpret(query, { mediaType: 'Séries TV', keys: { deepseekApiKey: 'k' },
    fetchImpl: async () => json({ ...payload, media_type: 'tv' }) });
  const films = await interpret('film de guerre moderne avec des avions de combat', { mediaType: 'Films',
    keys: { deepseekApiKey: 'k' }, fetchImpl: async () => json({ ...payload, media_type: 'movie' }) });

  const seriesIntent = canonicalOf(series.interpreted, query);
  const filmIntent = canonicalOf(films.interpreted, 'film de guerre moderne avec des avions de combat');
  assert.equal(seriesIntent.mediaType, 'tv');
  assert.equal(filmIntent.mediaType, 'movie');
  for (const concept of ['modern warfare', 'military aviation', 'fighter aircraft', 'air force', 'aerial combat']) {
    assert.ok(seriesIntent.themes.includes(concept), concept + ' must reach CanonicalIntent.themes');
  }
  assert.ok(seriesIntent.keywords.includes('special forces'));
  // Signals actually reach retrieval: the vector document is neither empty nor generic.
  const vectorText = buildVectorQueryText(seriesIntent);
  assert.match(vectorText, /media_type: tv/);
  assert.match(vectorText, /fighter aircraft/);
  assert.match(vectorText, /modern warfare/);
  assert.notEqual(vectorText, buildVectorQueryText(filmIntent));
});

test('case E: negative concepts stay exclusions and never become positive signals', async () => {
  const query = 'un thriller psychologique sombre sans meurtre ni enquête policière';
  const result = await interpret(query, {
    keys: { deepseekApiKey: 'fixture' },
    fetchImpl: async () => json({
      media_type: 'movie', intent_type: 'constraint_search', genres: ['Thriller'],
      moods: ['dark'], themes: ['psychological thriller'],
      negative_concepts: ['murder', 'police investigation']
    })
  });
  assert.deepEqual(result.semanticContext.negativeConcepts, ['murder', 'police_investigation']);
  const canonical = canonicalOf(result.interpreted, query);
  assert.deepEqual(canonical.semanticExclusions, ['murder', 'police_investigation']);
  assert.equal(canonical.themes.includes('murder'), false);
  assert.equal(canonical.keywords.includes('murder'), false);
});

test('case F: Mindhunter is a reference, "plus récente" and "davantage d action" become constraints', async () => {
  const query = "une série comme Mindhunter mais plus récente et avec davantage d'action";
  const result = await interpret(query, {
    mediaType: 'Séries TV', keys: { deepseekApiKey: 'fixture' },
    fetchImpl: async () => json({
      media_type: 'tv', intent_type: 'similar_to_title',
      known_titles: ['Mindhunter'], style_references: ['Mindhunter'],
      genres: ['Crime', 'Drama', 'Action'], moods: ['tense', 'fast-paced'],
      themes: ['criminal profiling'], keywords: ['serial offenders'],
      year_min: 2020
    })
  });
  const canonical = canonicalOf(result.interpreted, query);
  assert.deepEqual(canonical.knownTitles, ['Mindhunter']);
  assert.equal(canonical.yearMin, 2020);
  assert.ok(canonical.genres.includes('Action'));
  assert.ok(canonical.keywords.includes('serial offenders'));
});

test('timeout, provider error, invalid response and missing provider fall back with a fixed reason', async () => {
  const hanging = (url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const cases = [
    ['timeout', hanging, { providers: [singleProvider], keys: { deepseekApiKey: 'k' } }],
    ['provider_error', async () => ({ ok: false, status: 503, json: async () => ({}) }),
      { providers: [singleProvider], keys: { deepseekApiKey: 'k' } }],
    ['invalid_response', async () => ANSWER('aucun objet json ici'),
      { providers: [singleProvider], keys: { deepseekApiKey: 'k' } }],
    ['unavailable', async () => { throw new Error('no provider must be called'); }, { keys: {} }]
  ];
  for (const [reason, fetchImpl, options] of cases) {
    const result = await interpret('une requête quelconque', { fetchImpl, ...options });
    assert.equal(result.path, SEMANTIC_INTERPRETER_PATHS.HEURISTIC_FALLBACK, reason);
    assert.equal(result.reason, reason);
    assert.equal(result.providerId, null);
    assert.equal(result.provider, 'Algorithme Éliciné');
    assert.equal(result.interpreted.provider, 'Algorithme Éliciné');
    assert.ok(result.attempts.some(attempt => attempt.reason === reason));
    assert.equal(INTERPRETER_FALLBACK_REASONS.UNAVAILABLE, 'unavailable');
  }
});

test('a real provider failure is preferred over a provider without a configured key', async () => {
  const result = await interpret('peu importe', {
    keys: { groqApiKey: 'k' },
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) })
  });
  assert.equal(result.path, SEMANTIC_INTERPRETER_PATHS.HEURISTIC_FALLBACK);
  assert.equal(result.reason, 'provider_error');
  assert.deepEqual(result.attempts, [
    { provider: 'deepseek', reason: 'unavailable' },
    { provider: 'groq', reason: 'provider_error' },
    { provider: 'qwen', reason: 'unavailable' },
    { provider: 'gemini', reason: 'unavailable' },
    { provider: 'openai', reason: 'unavailable' }
  ]);
});

test('unusable or unreliable provider fields are dropped while reliable ones are kept', () => {
  const partial = parseSemanticInterpretation(JSON.stringify({
    media_type: 'movie', genres: ['Thriller'], year_min: 9999,
    semantic_concepts: 'dreams', runtime_max: 'n/a', people: ['', 'Ava DuVernay']
  }));
  assert.equal(partial.valid, true);
  assert.equal(partial.legacy.year_min, null);
  assert.equal(partial.legacy.runtime_max, null);
  assert.deepEqual(partial.legacy.explicit_themes, ['dreams']);
  assert.deepEqual(partial.legacy.people, ['Ava DuVernay']);
  assert.equal(parseSemanticInterpretation('rien').reason, 'invalid_response');
  assert.equal(parseSemanticInterpretation('').valid, false);
});

test('the no-LLM catalogue still yields a usable fallback intent with a media type', () => {
  const heuristic = buildHeuristicInterpretation('un film de braquage dans l espace');
  assert.equal(heuristic.provider, 'Algorithme Éliciné');
  assert.equal(heuristic.media_type, 'movie');
  assert.ok(heuristic.primary_genres.length > 0);
  const interpretation = buildLegacyInterpretation({ media_type: 'tv', genres: ['War'] });
  assert.equal(interpretation.semantic_intent_context.intentType, null);
  assert.deepEqual(interpretation.semantic_exclusions, []);
  assert.equal(createSemanticIntentContext({ intentType: 'not_a_real_type' }).intentType, 'mixed');
});

test('recoverFallbackSignals gates the heuristic enrichment, so a valid intent is never completed', async () => {
  const query = 'film de leonardo dicaprio ou il voyage dans les rêves des autres';
  const providerLike = { media_type: 'movie', primary_genres: ['Thriller'], mood_tags: [],
    reference_titles: [], explicit_themes: [], keywords: [], provider: 'Algorithme Éliciné', people: [] };
  const gated = await orchestrateSearch({ interpreted: providerLike, cleanQuery: query,
    requestedMediaType: 'Tous', recoverFallbackSignals: false, telemetry: {} });
  const recovered = await orchestrateSearch({ interpreted: providerLike, cleanQuery: query,
    requestedMediaType: 'Tous', recoverFallbackSignals: true, telemetry: {} });
  assert.deepEqual(gated.canonicalIntent.keywords, []);
  assert.deepEqual(gated.canonicalIntent.themes, []);
  assert.ok(recovered.canonicalIntent.keywords.includes('rêve'));
  assert.ok(recovered.canonicalIntent.themes.length > 0);

  const llmLike = { ...providerLike, provider: 'DeepSeek (deepseek-chat)',
    explicit_themes: ['shared dreams'], people: ['Leonardo DiCaprio'] };
  const llmIntent = await orchestrateSearch({ interpreted: llmLike, cleanQuery: query,
    requestedMediaType: 'Tous', recoverFallbackSignals: false, telemetry: {} });
  assert.deepEqual(llmIntent.canonicalIntent.keywords, []);
  assert.deepEqual(llmIntent.canonicalIntent.themes, ['shared dreams']);
});

test('converging precise signals outweigh a generic theme-only candidate', () => {
  const intent = createCanonicalIntent({ mediaType: 'movie', themes: ['shared dreams', 'subconscious'],
    keywords: ['dreams'] });
  const base = { mediaType: 'movie', genreIds: [], sources: ['tmdb_person_credits'],
    metadata: { vote_average: 8.2, vote_count: 30000, popularity: 60 },
    retrievalSignals: [{ source: 'tmdb_person_credits', personTmdbId: 6193 }] };
  const precise = { ...base, tmdbId: 27205, title: 'Inception', releaseDate: '2010-07-16',
    constraintData: { overview: 'A thief who steals secrets through dream-sharing technology.',
      themes: ['shared dreams', 'subconscious'], keywords: ['dreams'] } };
  const generic = { ...base, tmdbId: 900, title: 'Travels', releaseDate: '2010-07-16',
    constraintData: { overview: 'A quiet documentary about sleep.', themes: [], keywords: [] } };
  const resolvedContext = { resolvedPeople: [{ tmdbId: 6193, resolutionConfidence: 1 }] };
  const ranked = rankSearchCandidates([generic, precise], intent, resolvedContext, { telemetry: {} });
  assert.equal(ranked[0].tmdbId, 27205);
  assert.ok(ranked[0].ranking.finalScore > ranked[1].ranking.finalScore);
});
