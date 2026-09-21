import assert from 'node:assert/strict';
import test from 'node:test';
import { hybridRetrieve, RETRIEVAL_LIMITS } from '../../src/search/hybridRetriever.js';
import { createSupabaseLexicalSource } from '../../src/search/retrievalServices.js';
import { expandSemanticTerms, SEMANTIC_EXPANSION_LIMIT } from '../../src/search/semanticExpansion.js';
import { discoverParams, exclusionKeywordTerms, keywordTerms, reliableKeywordId }
  from '../../src/search/tmdbRetrievalParams.js';
import {
  buildMediaIndexText, buildVectorQueryText, VECTOR_EMBEDDING_DIMENSION, VECTOR_EMBEDDING_MODEL
} from '../../src/search/vectorRetrieval.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';

const intent = input => createCanonicalIntent(input);
const row = (id, title, type, extra = {}) => ({
  id, media_type: type, title, name: type === 'tv' ? title : undefined,
  overview: '', genre_ids: type === 'tv' ? [10768] : [878], vote_average: 7,
  vote_count: 1000, release_date: type === 'movie' ? '2020-01-01' : undefined,
  first_air_date: type === 'tv' ? '2020-01-01' : undefined, ...extra
});

test('modern-war aviation expansion is deterministic, one-hop and bounded to eight additions', () => {
  const canonical = intent({ mediaType: 'tv', genres: ['War'],
    themes: ['guerre moderne', 'aviation militaire', 'avions de combat'] });
  const expansion = expandSemanticTerms(canonical);
  assert.deepEqual(expansion.addedTerms, ['modern warfare', 'military aviation', 'fighter aircraft',
    'military', 'air force', 'aerial combat', 'special forces', 'fighter pilots']);
  assert.equal(expansion.addedTerms.length, SEMANTIC_EXPANSION_LIMIT);
  assert.equal(expansion.applied, true);
  assert.equal(expandSemanticTerms(canonical).addedTerms.join('|'), expansion.addedTerms.join('|'));
});

test('expanded terms become bounded exact TMDB keyword lookups and unreliable matches are ignored', () => {
  const canonical = intent({ themes: ['guerre moderne', 'aviation militaire', 'avions de combat'] });
  const terms = keywordTerms(canonical, RETRIEVAL_LIMITS.terms);
  assert.deepEqual(terms.slice(0, 3), ['modern warfare', 'military aviation', 'fighter aircraft']);
  assert.equal(terms.length, 8);
  assert.equal(reliableKeywordId('fighter aircraft', [{ id: 10, name: 'Fighter Aircraft' }]), 10);
  assert.equal(reliableKeywordId('fighter aircraft', [{ id: 10, name: 'fighter' }]), null);
  assert.equal(reliableKeywordId('military', [{ id: 1, name: 'military' }, { id: 2, name: 'military' }]), null);
});

test('modern-war fighter-aircraft TV pool promotes semantic fixtures above unrelated popular series', async () => {
  const canonical = intent({ mediaType: 'tv', genres: ['War'],
    moods: ['guerre moderne', 'aviation militaire', 'avions de combat'] });
  const concepts = ['military', 'modern warfare', 'special forces', 'military aviation', 'fighter aircraft'];
  const relevant = [
    row(1, 'SEAL Team', 'tv', { keywords: ['military', 'special forces'] }),
    row(2, 'Strike Back', 'tv', { keywords: ['modern warfare', 'special forces'] }),
    row(3, 'Six', 'tv', { keywords: ['military', 'special forces'] }),
    row(4, 'The Brave', 'tv', { keywords: ['military aviation', 'fighter aircraft'] }),
    row(5, 'Valor', 'tv', { keywords: ['military aviation', 'fighter aircraft'] })
  ];
  const unrelated = [
    row(11, 'The Mentalist', 'tv', { genre_ids: [80], popularity: 900 }),
    row(12, 'The Simpsons', 'tv', { genre_ids: [16, 35], popularity: 900 }),
    row(13, 'American Dad', 'tv', { genre_ids: [16, 35], popularity: 900 }),
    row(14, 'New York Police Judiciaire', 'tv', { genre_ids: [80], popularity: 900 })
  ];
  const keywordIds = new Map([['modern warfare', 101], ['military aviation', 102], ['fighter aircraft', 103]]);
  const keywordCalls = [];
  const telemetry = {};
  const pool = await hybridRetrieve({ intent: canonical, context: { telemetry }, services: {
    keyword: async term => { keywordCalls.push(term); return keywordIds.has(term)
      ? [{ id: keywordIds.get(term), name: term }] : []; },
    discover: async (type, params) => {
      assert.equal(type, 'tv');
      assert.equal(params.with_keywords, '101|102|103');
      return [...unrelated, ...relevant];
    },
    vector: async value => {
      const text = buildVectorQueryText(value);
      for (const concept of concepts) assert.match(text, new RegExp(concept));
      return relevant.map((item, index) => ({ ...item, similarity: 0.92 - index * 0.01 }));
    },
    lexical: async () => relevant
  } });
  const relevantTitles = new Set(relevant.map(item => item.title));
  const unrelatedTitles = new Set(unrelated.map(item => item.title));
  assert.ok(pool.slice(0, 5).every(candidate => relevantTitles.has(candidate.title)));
  assert.ok(pool.slice(5).some(candidate => unrelatedTitles.has(candidate.title)));
  assert.ok(pool.every(candidate => candidate.mediaType === 'tv'));
  assert.ok(pool.slice(0, 5).every(candidate => concepts.some(concept =>
    candidate.constraintData.keywords.includes(concept))));
  assert.ok(keywordCalls.length <= RETRIEVAL_LIMITS.terms);
  assert.equal(telemetry.semanticExpansionApplied, true);
  assert.equal(telemetry.semanticExpansionTermCount, 8);
  assert.equal(telemetry.semanticKeywordResolvedCount, 3);
  for (const key of Object.keys(telemetry)) assert.doesNotMatch(key.toLowerCase(), /query|raw/);
});

test('vector query preserves full canonical intent and expansion without changing model or dimension', () => {
  const canonical = intent({ mediaType: 'tv', genres: ['War'], moods: ['tense'],
    themes: ['guerre moderne', 'avions de combat'], keywords: ['forces spéciales'] });
  const text = buildVectorQueryText(canonical);
  for (const value of ['media_type: tv', 'genres: War', 'moods: tense', 'guerre moderne',
    'avions de combat', 'forces spéciales', 'modern warfare', 'fighter aircraft', 'special forces']) {
    assert.match(text, new RegExp(value));
  }
  assert.equal(VECTOR_EMBEDDING_MODEL, 'text-embedding-3-small');
  assert.equal(VECTOR_EMBEDDING_DIMENSION, 1024);
  const profile = buildMediaIndexText({ id: 1, media_type: 'tv', name: 'Fixture',
    overview: 'Modern special-forces pilots.', keywords: ['special forces', 'fighter aircraft'],
    themes: ['military aviation'] });
  assert.match(profile, /Modern special-forces pilots/);
  assert.match(profile, /special forces, fighter aircraft/);
  assert.match(profile, /military aviation/);
});

test('Supabase lexical source receives bounded expanded terms', async () => {
  let filter = '';
  const builder = {
    select() { return this; }, or(value) { filter = value; return this; },
    order() { return this; }, limit() { return this; }, abortSignal() { return Promise.resolve({ data: [], error: null }); },
    then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); }
  };
  const client = { from() { return builder; } };
  await createSupabaseLexicalSource(client)(intent({ themes: ['guerre moderne', 'avions de combat'] }));
  assert.match(filter, /modern warfare/);
  assert.match(filter, /fighter aircraft/);
  assert.ok(filter.startsWith('and(or('));
  assert.ok(filter.length < 16000);
});

async function assertQualityCase(canonical, expectedTerms) {
  const relevant = row(100, 'Relevant fixture', canonical.mediaType || 'movie',
    { keywords: expectedTerms, themes: expectedTerms, overview: expectedTerms.join(' ') });
  const distractor = row(200, 'Popular unrelated fixture', canonical.mediaType || 'movie',
    { genre_ids: [35], popularity: 1000, overview: 'Unrelated broad comedy.' });
  const pool = await hybridRetrieve({ intent: canonical, services: {
    keyword: async term => expectedTerms.includes(term) ? [{ id: expectedTerms.indexOf(term) + 1, name: term }] : [],
    discover: async () => [distractor, relevant], vector: async () => [{ ...relevant, similarity: 0.9 }],
    lexical: async () => [relevant]
  } });
  assert.equal(pool[0].title, 'Relevant fixture');
  assert.ok(expectedTerms.every(term => buildVectorQueryText(canonical).includes(term)));
}

test('quality: military special-forces series expands locally', async () => {
  await assertQualityCase(intent({ mediaType: 'tv', themes: ['forces spéciales'], keywords: ['militaire'] }),
    ['special forces', 'special operations', 'military', 'armed forces']);
});

test('quality: fighter-pilot series expands locally', async () => {
  await assertQualityCase(intent({ mediaType: 'tv', themes: ['pilotes de chasse'] }),
    ['fighter pilots', 'fighter aircraft', 'air force', 'aerial combat', 'military aviation']);
});

test('quality: melancholic memory science-fiction expands locally', async () => {
  await assertQualityCase(intent({ mediaType: 'movie', genres: ['Science Fiction'],
    themes: ['mémoire'], moods: ['mélancolique'] }), ['memory', 'melancholic', 'memories', 'melancholy']);
});

test('quality: oppressive small-town thriller expands locally', async () => {
  await assertQualityCase(intent({ mediaType: 'movie', genres: ['Thriller'],
    themes: ['petite ville'], moods: ['oppressant'] }), ['small town', 'oppressive', 'isolated community', 'claustrophobic']);
});

test('Discover keeps media type strict and combines genre with only resolved keyword IDs', () => {
  const canonical = intent({ mediaType: 'tv', genres: ['War'], themes: ['guerre moderne'] });
  const params = discoverParams(canonical, 'tv', [10, 20, 30]);
  assert.equal(params.with_genres, '10768');
  assert.equal(params.with_keywords, '10|20|30');
});

test('stated exclusions map onto TMDB keyword wordings, bounded and deduplicated', () => {
  assert.deepEqual(exclusionKeywordTerms(['murder']), ['murder', 'serial killer', 'homicide', 'killing']);
  assert.deepEqual(exclusionKeywordTerms(['police_investigation']), ['police investigation', 'detective']);
  assert.deepEqual(exclusionKeywordTerms(['time_travel', 'romance'], 3), ['time travel', 'time loop', 'romance']);
  assert.deepEqual(exclusionKeywordTerms(['science_fiction', 'robots'], 2), ['science fiction', 'robot']);
  assert.deepEqual(exclusionKeywordTerms(['murder', 'murder']), ['murder', 'serial killer', 'homicide', 'killing']);
  assert.deepEqual(exclusionKeywordTerms([], 4), []);
  assert.deepEqual(exclusionKeywordTerms(['concept sans famille']), []);
  assert.deepEqual(exclusionKeywordTerms(['murder'], 0), []);
});

test('Discover carries stated exclusions as without_keywords next to resolved positive keywords', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['Thriller'] });
  const params = discoverParams(canonical, 'movie', [10, 20], [9826, 10714]);
  assert.equal(params.with_keywords, '10|20');
  assert.equal(params.without_keywords, '9826,10714');
  // No stated exclusion means no exclusion parameter at all: the provider
  // request keeps its historical shape.
  assert.equal('without_keywords' in discoverParams(canonical, 'movie', [10, 20]), false);
});

test('hybrid retrieval resolves exclusion keywords and prunes the Discover pool at the source', async () => {
  const canonical = intent({ mediaType: 'movie', genres: ['Thriller'], semanticExclusions: ['murder'] });
  const keywordIds = new Map([['murder', 9826], ['serial killer', 10714]]);
  const lookedUp = [];
  const excluded = row(901, 'Tagged Killer', 'movie', { keywords: ['serial killer'] });
  const kept = row(902, 'Quiet Portrait', 'movie', { keywords: ['psychological'] });
  const telemetry = {};
  let discoverParamsSeen = null;
  const pool = await hybridRetrieve({ intent: canonical, context: { telemetry }, services: {
    keyword: async term => { lookedUp.push(term);
      return keywordIds.has(term) ? [{ id: keywordIds.get(term), name: term }] : []; },
    discover: async (type, params) => {
      discoverParamsSeen = params;
      // The fixture honours without_keywords the way the provider does: a work
      // carrying any excluded keyword never reaches the local pool.
      const without = new Set(String(params.without_keywords || '').split(',').filter(Boolean).map(Number));
      return [excluded, kept].filter(candidate =>
        !(candidate.keywords || []).some(name => without.has(keywordIds.get(name))));
    }
  } });
  assert.deepEqual(lookedUp, ['murder', 'serial killer', 'homicide', 'killing']);
  assert.equal(discoverParamsSeen.without_keywords, '9826,10714');
  assert.deepEqual(pool.map(candidate => candidate.title), ['Quiet Portrait']);
  assert.equal(telemetry.semanticExclusionKeywordResolvedCount, 2);
  assert.equal(telemetry.semanticKeywordResolvedCount, 0);
});
