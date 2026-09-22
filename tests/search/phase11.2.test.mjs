import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntentFromLegacy } from '../../src/search/canonicalIntentShadow.js';
import { resolveKnownTitles } from '../../src/search/entityResolver.js';
import { extractPersonQueries, extractReferenceTitleQueries } from '../../src/search/fallbackIntentSignals.js';
import { createRetrievalTelemetry } from '../../src/search/hybridRetriever.js';
import { mergeCandidates, toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import { createSearchEvaluationTrace } from '../../src/search/searchEvaluation.js';
import { expandSemanticTerms } from '../../src/search/semanticExpansion.js';

const enabled = {
  HYBRID_RETRIEVAL_ENABLED: 'true', STRICT_CONSTRAINT_FILTER_ENABLED: 'true',
  ELICINE_RANKING_ENABLED: 'true', DIVERSIFIED_RANKING_ENABLED: 'true'
};

function row(id, type, title, overview, extra = {}) {
  return {
    id, media_type: type, title: type === 'movie' ? title : undefined,
    name: type === 'tv' ? title : undefined,
    original_title: type === 'movie' ? title : undefined,
    original_name: type === 'tv' ? title : undefined,
    release_date: type === 'movie' ? '2020-01-01' : undefined,
    first_air_date: type === 'tv' ? '2020-01-01' : undefined,
    overview, genre_ids: type === 'tv' ? [10768, 18] : [53, 9648],
    original_language: 'en', vote_average: 7.5, vote_count: 5000, popularity: 40,
    ...extra
  };
}

function partialInterpretation(overrides = {}) {
  return {
    provider: 'Groq (Llama fixture)', media_type: 'all', primary_genres: [], mood_tags: [],
    explicit_themes: [], keywords: [], reference_titles: [], ...overrides
  };
}

test('fallback grammars reject descriptive people and ambiguous comparison pronouns', () => {
  assert.deepEqual(extractPersonQueries('série de guerre moderne avec des avions de combats'), []);
  assert.deepEqual(extractPersonQueries('film de science-fiction mélancolique sur la mémoire'), []);
  assert.deepEqual(extractPersonQueries('séries comme Dexter avec un tueur en série intelligent'), []);
  assert.deepEqual(extractPersonQueries('films comme Parasite avec critique sociale'), []);
  assert.deepEqual(extractPersonQueries("film d'Alfred Hitchcock"), ['alfred hitchcock']);
  assert.deepEqual(extractPersonQueries('film de guerre avec Tom Hanks'), ['Tom Hanks']);
  assert.deepEqual(extractReferenceTitleQueries('un film comme ça'), []);
  assert.deepEqual(extractReferenceTitleQueries('film du même style que shutter island s’il te plaît'), ['shutter island']);
  assert.deepEqual(extractReferenceTitleQueries('un film comme Un jour sans fin'), ['Un jour sans fin']);
  assert.deepEqual(extractReferenceTitleQueries('un film comme Meurtre sur le Nil'), ['Meurtre sur le Nil']);
  assert.deepEqual(extractReferenceTitleQueries("un film comme Il était une fois dans l'Ouest"),
    ["Il était une fois dans l'Ouest"]);
  assert.deepEqual(extractReferenceTitleQueries('un film comme Bonnie et Clyde'), ['Bonnie et Clyde']);
  assert.deepEqual(extractReferenceTitleQueries('un film comme Top Gun et Dunkirk'), ['Top Gun et Dunkirk']);
});

test('literal LLM references suppress longer grammar duplicates and keep provider budgets bounded', () => {
  const intent = createCanonicalIntentFromLegacy(partialInterpretation({
    media_type: 'tv', reference_titles: ['Dexter']
  }), { userQuery: 'Je cherche des séries comme Dexter avec un tueur en série intelligent mais sans surnaturel.' });
  assert.deepEqual(intent.knownTitles, ['Dexter']);
});

test('reference resolution handles trailing preferences and compound seeds without breaking real conjunction titles', async () => {
  const modifierIntent = createCanonicalIntentFromLegacy(partialInterpretation({ media_type: 'movie' }), {
    userQuery: "film comme Shutter Island avec davantage d'action"
  });
  const modifierContext = await resolveKnownTitles(modifierIntent, {
    searchCandidates: async () => [row(11324, 'movie', 'Shutter Island', 'A psychological mystery.', {
      release_date: '2010-01-01' })]
  });
  assert.equal(modifierContext.resolvedTitles[0].tmdbId, 11324);

  const compoundIntent = createCanonicalIntentFromLegacy(partialInterpretation({ media_type: 'movie' }), {
    userQuery: 'un film comme Top Gun et Dunkirk'
  });
  const compoundCalls = [];
  const compoundContext = await resolveKnownTitles(compoundIntent, {
    searchCandidates: async title => {
      compoundCalls.push(title);
      if (title === 'Top Gun') return [row(744, 'movie', 'Top Gun', 'Fighter pilots.')];
      if (title === 'Dunkirk') return [row(374720, 'movie', 'Dunkirk', 'A wartime evacuation.')];
      return [];
    }
  });
  assert.deepEqual(compoundContext.resolvedTitles.map(title => title.tmdbId), [744, 374720]);
  assert.deepEqual(compoundCalls, ['Top Gun et Dunkirk', 'Top Gun', 'Dunkirk']);

  const conjunctionIntent = createCanonicalIntentFromLegacy(partialInterpretation({ media_type: 'movie' }), {
    userQuery: 'un film comme Bonnie et Clyde'
  });
  const conjunctionCalls = [];
  const conjunctionContext = await resolveKnownTitles(conjunctionIntent, {
    searchCandidates: async title => {
      conjunctionCalls.push(title);
      return [row(475, 'movie', 'Bonnie and Clyde', 'Two outlaws.', { original_title: 'Bonnie et Clyde' })];
    }
  });
  assert.equal(conjunctionContext.resolvedTitles[0].tmdbId, 475);
  assert.deepEqual(conjunctionCalls, ['Bonnie et Clyde']);
});

async function runPipeline(intent, resolvedIntentContext, services) {
  const telemetry = createRetrievalTelemetry();
  const evaluationTrace = createSearchEvaluationTrace();
  const results = await orchestrateCandidateRetrieval({
    orchestration: { canonicalIntent: intent, resolvedIntentContext },
    services, context: { telemetry, evaluationTrace }, env: enabled
  });
  return { results, telemetry, trace: evaluationTrace };
}

test('exact person plus dream semantics makes Inception clearly outrank dream-only candidates', async () => {
  const query = 'film de leonardo dicaprio ou il voyage dans les rêves des autres';
  const intent = createCanonicalIntentFromLegacy(partialInterpretation({
    media_type: 'movie', primary_genres: ['Science Fiction']
  }), { userQuery: query });
  assert.ok(intent.themes.includes('shared dreams'));
  assert.deepEqual(extractPersonQueries(query), ['leonardo dicaprio']);

  const resolvedIntentContext = {
    resolvedTitles: [], unresolvedTitles: [], unresolvedPeople: [],
    resolvedPeople: [{ inputName: 'leonardo dicaprio', name: 'Leonardo DiCaprio', tmdbId: 6193,
      resolutionConfidence: 1 }], metrics: {}
  };
  const inception = row(27205, 'movie', 'Inception',
    'A thief enters shared dreams and the subconscious of other people.',
    { genre_ids: [878, 53], vote_average: 8.4, vote_count: 39000, popularity: 75 });
  const yourName = row(372058, 'movie', 'Your Name.',
    'Two teenagers discover that their dreams connect their lives.',
    { genre_ids: [16, 18, 10749], vote_average: 8.5, vote_count: 12000, popularity: 110 });
  const gatsby = row(64682, 'movie', 'The Great Gatsby',
    'A wealthy man pursues a lost romance in New York.',
    { genre_ids: [18, 10749], vote_average: 7.4, vote_count: 13000, popularity: 90 });
  const { results, trace } = await runPipeline(intent, resolvedIntentContext, {
    personCredits: async () => [gatsby, inception],
    vector: async () => [{ ...yourName, similarity: 0.76 }, { ...inception, similarity: 0.92 }],
    legacy: async () => [yourName]
  });

  assert.equal(results[0].tmdbId, 27205);
  // The described work is the answer: the ranking layer measures the margin on
  // the ranked pool, and the grid is allowed to stop there when the identified
  // work is unambiguous and the dream-only candidate falls under the relevance
  // floor (the budget never pads an identification).
  const ranked = trace.scoresPhase8;
  const inceptionScore = ranked.find(entry => entry.tmdbId === 27205).scores;
  const yourNameEntry = ranked.find(entry => entry.tmdbId === 372058);
  const yourNameScore = yourNameEntry.scores;
  assert.ok(inceptionScore.entityScore > 0.7);
  assert.equal(yourNameScore.entityScore, 0);
  assert.ok(inceptionScore.finalScore - yourNameScore.finalScore >= 0.08);
  assert.ok(inceptionScore.matchScore > yourNameScore.matchScore);
  const gridIndex = results.findIndex(candidate => candidate.tmdbId === 372058);
  if (gridIndex >= 0) assert.ok(gridIndex > 0);
  assert.ok(trace.sources.tmdb_person_credits.topIds.includes(27205));
  assert.equal(trace.canonicalIntent.mediaType, 'movie');
  assert.equal(trace.resolvedIntentContext.resolvedPeople[0].tmdbId, 6193);
  assert.equal(trace.finalResults[0].tmdbId, 27205);
});

test('semantic-collapse recovery keeps modern-war and military-aviation concepts through ranking', async () => {
  const query = 'série de guerre moderne avec des avions de combats';
  const intent = createCanonicalIntentFromLegacy(partialInterpretation({
    media_type: 'tv', primary_genres: ['War'], mood_tags: ['intense'],
    keywords: ['war'],
    // Legacy parsing synthesizes these from recommendations; since neither is
    // literal in the query, they must not hide collapsed semantic fields.
    reference_titles: ['SEAL Team', 'Strike Back']
  }), { userQuery: query });
  const expansion = expandSemanticTerms(intent);
  for (const concept of ['modern warfare', 'military', 'special forces', 'military aviation',
    'fighter aircraft', 'fighter pilots', 'air force', 'aerial combat']) {
    assert.ok([...intent.themes, ...intent.keywords, ...expansion.addedTerms].includes(concept), concept);
  }

  const relevant = [
    row(71789, 'tv', 'SEAL Team', 'Modern warfare special forces conduct military operations.'),
    row(32573, 'tv', 'Strike Back', 'Special operations soldiers fight in modern warfare.'),
    row(66871, 'tv', 'Six', 'Special forces carry out dangerous military missions.'),
    row(71714, 'tv', 'The Brave', 'Military special operations and aerial combat missions.'),
    row(71806, 'tv', 'Valor', 'Fighter pilots and military aviation crews serve the air force.')
  ];
  const generic = [
    row(1001, 'tv', 'The Mentalist', 'A consultant helps solve crimes.', { genre_ids: [80, 18], popularity: 500 }),
    row(1002, 'tv', 'The Simpsons', 'An animated family comedy.', { genre_ids: [16, 35], popularity: 900 }),
    row(1003, 'tv', 'American Dad!', 'An animated family comedy.', { genre_ids: [16, 35], popularity: 800 }),
    row(1004, 'tv', 'New York Police Judiciaire', 'Police investigate crimes in New York.', { genre_ids: [80, 18], popularity: 700 })
  ];
  const { results, trace } = await runPipeline(intent,
    { resolvedTitles: [], resolvedPeople: [], metrics: {} }, {
      keyword: async term => [{ id: 5000 + term.length, name: term }],
      discover: async () => relevant,
      vector: async () => relevant.map((candidate, index) => ({ ...candidate, similarity: 0.92 - index * 0.02 })),
      lexical: async () => relevant,
      legacy: async () => generic
    });
  const relevantIds = new Set(relevant.map(candidate => candidate.id));
  assert.ok(results.slice(0, 5).every(candidate => relevantIds.has(candidate.tmdbId)));
  assert.ok(results.every(candidate => candidate.mediaType === 'tv'));
  assert.ok(results[0].ranking.semanticScore > results.at(-1).ranking.semanticScore);
  assert.equal(trace.semanticExpansion.applied, true);
  assert.ok(trace.semanticExpansion.resolvedKeywordIds.length > 0);
  for (const source of ['tmdb_discover', 'supabase_vector', 'supabase_lexical']) {
    assert.ok(trace.sources[source].candidateCount > 0);
  }
  assert.ok(trace.poolAfterDeduplication.every(candidate => candidate.mediaType === 'tv'));
});

test('person-credit breadth cannot evict targeted semantic sources before ranking', () => {
  const personCredits = Array.from({ length: 80 }, (_, index) =>
    toRetrievalCandidate(row(3000 + index, 'movie', `Person credit ${index}`, 'Unrelated credit.'),
      'tmdb_person_credits', { personTmdbId: index < 30 ? 1 : 2, sourceRank: index + 1 }));
  const vector = Array.from({ length: 5 }, (_, index) =>
    toRetrievalCandidate(row(4000 + index, 'movie', `Vector ${index}`, 'Highly relevant semantics.'),
      'supabase_vector', { sourceScore: 0.9, sourceRank: index + 1 }));
  const discover = Array.from({ length: 5 }, (_, index) =>
    toRetrievalCandidate(row(5000 + index, 'movie', `Discover ${index}`, 'Targeted discovery.'),
      'tmdb_discover', { sourceRank: index + 1 }));
  const pool = mergeCandidates([...personCredits, ...vector, ...discover]).candidates;
  assert.equal(pool.length, 50);
  assert.equal(pool.filter(candidate => candidate.sources.includes('supabase_vector')).length, 5);
  assert.equal(pool.filter(candidate => candidate.sources.includes('tmdb_discover')).length, 5);
  const lexical = Array.from({ length: 5 }, (_, index) =>
    toRetrievalCandidate(row(6000 + index, 'movie', `Lexical ${index}`, 'Relevant lexical hit.'),
      'supabase_lexical', { sourceRank: index + 1 }));
  const lexicalFallbackPool = mergeCandidates([...personCredits, ...lexical]).candidates;
  assert.equal(lexicalFallbackPool.filter(candidate => candidate.sources.includes('supabase_lexical')).length, 5);
});

test('comparison grammar resolves Shutter Island and prioritizes reference-near sources without seed monopoly', async () => {
  const query = 'film du même style que shutter island';
  assert.deepEqual(extractReferenceTitleQueries(query), ['shutter island']);
  const intent = createCanonicalIntentFromLegacy(partialInterpretation({ media_type: 'movie' }), { userQuery: query });
  assert.deepEqual(intent.knownTitles, ['shutter island']);
  const resolvedIntentContext = await resolveKnownTitles(intent, {
    searchCandidates: async () => [row(11324, 'movie', 'Shutter Island', 'A psychological mystery.', {
      release_date: '2010-01-01', genre_ids: [53, 9648] })]
  });
  assert.equal(resolvedIntentContext.resolvedTitles[0].tmdbId, 11324);

  const closeSimilar = row(2001, 'movie', 'Psychological Mystery',
    'A dark psychological mystery about memory and identity.');
  const closeRecommended = row(2002, 'movie', 'Island Conspiracy',
    'A tense investigation questions reality and identity.');
  const closeVector = row(2003, 'movie', 'Fractured Memory',
    'A psychological thriller about unreliable memory.', { similarity: 0.88 });
  const seed = row(11324, 'movie', 'Shutter Island', 'A psychological mystery.', {
    release_date: '2010-01-01', vote_average: 9, vote_count: 100000, popularity: 1000
  });
  const offTopic = [
    row(862, 'movie', 'Toy Story', 'Animated toys go on an adventure.', { genre_ids: [16, 35], popularity: 900 }),
    row(329, 'movie', 'Jurassic Park', 'Dinosaurs escape in a theme park.', { genre_ids: [12, 878], popularity: 900 }),
    row(10191, 'movie', 'How to Train Your Dragon', 'A boy befriends a dragon.', { genre_ids: [16, 14], popularity: 900 })
  ];
  const { results, trace } = await runPipeline(intent, resolvedIntentContext, {
    similar: async () => [closeSimilar], recommendations: async () => [closeRecommended],
    vector: async () => [closeVector], legacy: async () => [seed, ...offTopic]
  });
  const nearIds = new Set([2001, 2002, 2003]);
  assert.ok(results.slice(0, 3).every(candidate => nearIds.has(candidate.tmdbId)));
  const topIds = results.slice(0, 3).map(candidate => candidate.tmdbId);
  // The result budget (Phase 14) drops the relevance tail instead of padding
  // the grid, so neither the reference seed nor the off-topic popular titles
  // are kept at the bottom any more. What still matters is the original
  // contract: none of them may ever climb into the top three.
  assert.ok(!topIds.includes(11324));
  assert.ok(offTopic.every(item => !topIds.includes(item.id)));
  assert.ok(results.every(candidate => nearIds.has(candidate.tmdbId)));
  assert.ok(trace.sources.tmdb_similar.topIds.includes(2001));
  assert.ok(trace.sources.tmdb_recommendations.topIds.includes(2002));
  assert.ok(trace.sources.supabase_vector.topIds.includes(2003));
  const scoresById = new Map(trace.scoresPhase8.map(candidate => [candidate.tmdbId, candidate.scores]));
  assert.equal(scoresById.get(2002).referenceScore, 1);
  assert.equal(scoresById.get(2001).referenceScore, 0.92);
  assert.ok(scoresById.get(2003).referenceScore >= 0.74);
  assert.equal(trace.finalResults[0].tmdbId, results[0].tmdbId);
});
