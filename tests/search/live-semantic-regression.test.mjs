import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFallbackIntentSignals, extractPersonQueries } from '../../src/search/fallbackIntentSignals.js';
import { resolveKnownPeople } from '../../src/search/entityResolver.js';
import { hybridRetrieve } from '../../src/search/hybridRetriever.js';
import { createTmdbRetrievalClient } from '../../src/search/retrievalServices.js';
import { buildVectorQueryText } from '../../src/search/vectorRetrieval.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';

const movie = (id, title, popularity, overview = '') => ({
  id, title, original_title: title, release_date: '2010-01-01', media_type: 'movie',
  genre_ids: [18], popularity, vote_count: 1000, poster_path: '/fixture.jpg', overview
});
const tv = (id, name, popularity) => ({
  id, name, original_name: name, first_air_date: '2020-01-01', media_type: 'tv',
  genre_ids: [10759], popularity, vote_count: 1000, poster_path: '/fixture.jpg'
});

test('no-LLM person signal resolves Leonardo DiCaprio and retrieves Inception/Titanic credits', async () => {
  const query = 'film de leonardo dicaprio ou il voyage dans les rêves des autres';
  const signals = extractFallbackIntentSignals(query);
  assert.deepEqual(signals.people, ['leonardo dicaprio']);
  assert.ok(signals.themes.includes('shared dreams'));
  assert.ok(signals.keywords.includes('rêve'));

  const calls = [];
  const client = createTmdbRetrievalClient({
    apiKey: 'fixture-key',
    fetchImpl: async url => {
      const parsed = new URL(url);
      calls.push(`${parsed.pathname}${parsed.searchParams.get('query') ? `?query=${parsed.searchParams.get('query')}` : ''}`);
      if (parsed.pathname.endsWith('/search/person')) {
        return { ok: true, json: async () => ({ results: [{ id: 6193, name: 'Leonardo DiCaprio', known_for_department: 'Acting' }] }) };
      }
      if (parsed.pathname.endsWith('/person/6193/movie_credits')) {
        return { ok: true, json: async () => ({ cast: [
          movie(900, 'Generic Credit', 1),
          movie(27205, 'Inception', 62),
          movie(597, 'Titanic', 58)
        ] }) };
      }
      throw new Error(`unexpected fixture endpoint: ${parsed.pathname}`);
    }
  });
  const people = await resolveKnownPeople(signals.people, { searchPeople: name => client.person(name) });
  assert.equal(people.resolvedPeople[0].tmdbId, 6193);
  const intent = createCanonicalIntent({ mediaType: 'movie', themes: signals.themes,
    keywords: signals.keywords });
  const telemetry = {};
  const pool = await hybridRetrieve({
    intent,
    resolvedContext: people,
    services: { personCredits: client.personCredits, lexical: async () => [], vector: async () => [], legacy: async () => [] },
    context: { telemetry }
  });
  assert.ok(pool.some(candidate => candidate.tmdbId === 27205));
  assert.ok(pool.some(candidate => candidate.tmdbId === 597));
  assert.ok(calls.some(path => path.includes('/search/person')));
  assert.ok(calls.some(path => path.includes('/person/6193/movie_credits')));
  // The request-scoped URL cache prevents a duplicate person lookup.
  await client.person('leonardo dicaprio');
  assert.equal(calls.filter(path => path.includes('/search/person')).length, 1);
});

test('semantic documents stay distinct and media type keeps war pools separate', async () => {
  const inception = createCanonicalIntent({ mediaType: 'movie', themes: ['shared dreams'],
    keywords: ['leonardo', 'dicaprio', 'voyage', 'reves'] });
  const warMovie = createCanonicalIntent({ mediaType: 'movie', genres: ['War'],
    themes: ['modern warfare', 'military aviation'], keywords: ['fighter aircraft', 'special forces'] });
  const warTv = createCanonicalIntent({ mediaType: 'tv', genres: ['War'],
    themes: ['modern warfare', 'military aviation'], keywords: ['fighter aircraft', 'special forces'] });
  const inceptionText = buildVectorQueryText(inception);
  const warText = buildVectorQueryText(warMovie);
  assert.notEqual(inceptionText, warText);
  assert.match(inceptionText, /leonardo|dicaprio|shared dreams/i);
  assert.match(inceptionText, /semantic_expansion:.*dream/i);
  assert.match(warText, /modern warfare|fighter aircraft|military aviation/i);

  const source = async intent => [movie(27205, 'Inception', 62), movie(999, 'War Film', 10), tv(998, 'War Series', 10)];
  const moviePool = await hybridRetrieve({ intent: warMovie, services: { vector: source }, context: { telemetry: {} } });
  const tvPool = await hybridRetrieve({ intent: warTv, services: { vector: source }, context: { telemetry: {} } });
  assert.ok(moviePool.every(candidate => candidate.mediaType === 'movie'));
  assert.ok(tvPool.every(candidate => candidate.mediaType === 'tv'));
  assert.notDeepEqual(moviePool.map(candidate => candidate.tmdbId), tvPool.map(candidate => candidate.tmdbId));
});
