/**
 * Multi-concept retrieval recall.
 *
 * Reported live: the engine understood a multi-concept request, but candidates
 * that answer several of its dimensions never reached the pool. Example:
 * "film de guerre moderne avec des scènes de dog fight" returned the aviation
 * landmarks but not a contemporary stealth-fighter war film that answers the
 * intersection.
 *
 * What this suite locks down, in several genres and never with a hardcoded
 * title (the fixtures are generic rows produced by the stubs):
 *
 *  - a work reachable only through the *intersection* of two concepts enters
 *    the pool even when a broad popularity-ordered angle never lists it;
 *  - a precise contemporary work reachable only through the release-date angle
 *    of a modern request enters the pool as well;
 *  - the popular members of the family are still retrieved: nothing is
 *    replaced, the complementary angles are additive;
 *  - the request stays inside the provider budget with no source error.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { createRetrievalTelemetry, hybridRetrieve, RETRIEVAL_LIMITS } from '../../src/search/hybridRetriever.js';

const row = (id, type, { title = `Work ${id}`, overview = '', genres = [18], year = 2015, popularity = 50 } = {}) => ({
  id, media_type: type, title, name: title, overview, genre_ids: genres,
  release_date: `${year}-05-01`, first_air_date: `${year}-05-01`,
  vote_average: 7.2, vote_count: 800, popularity
});

/**
 * Provider stub with the shape of the real one: a broad popularity-ordered
 * angle, the precise keyword intersections, and the release-date ordering.
 */
function provider({ keywordIds, popular, intersections = {}, recent = [], types = ['movie', 'tv'] }) {
  const calls = [];
  return {
    calls,
    services: {
      keyword: async term => keywordIds[term] ? [{ id: keywordIds[term], name: term }] : [{ id: 0, name: 'autre' }],
      discover: async (type, params) => {
        calls.push({ type, params });
        if (!types.includes(type)) return [];
        const key = params.with_keywords || '';
        if (params.sort_by && params.sort_by.endsWith('.desc') && params.sort_by !== 'popularity.desc') {
          return recent.filter(item => item.type === type).map(item => row(item.id, type, item));
        }
        if (key.includes(',')) {
          const match = intersections[key] || intersections[key.split(',').sort().join(',')] || [];
          return match.filter(item => item.type === type).map(item => row(item.id, type, item));
        }
        return popular.filter(item => item.type === type).map(item => row(item.id, type, item));
      }
    }
  };
}

const run = (intent, services) => hybridRetrieve({
  intent, resolvedContext: {}, services,
  context: { telemetry: createRetrievalTelemetry(),
    semanticIntentContext: { intentType: 'specific_title_description',
      semanticConcepts: intent.themes, narrativeMotifs: intent.keywords, people: [] } }
});

const ids = pool => pool.map(candidate => candidate.tmdbId);

test('war / modern / aerial combat: the intersection work enters the pool', async () => {
  const intent = createCanonicalIntent({ mediaType: 'movie', genres: ['War'],
    themes: ['modern warfare', 'military aviation'], keywords: ['dogfight', 'aerial combat'] });
  const { calls, services } = provider({
    keywordIds: { 'modern warfare': 101, 'military aviation': 202, dogfight: 303, 'aerial combat': 404 },
    popular: [{ id: 1, type: 'movie', genres: [10752], popularity: 900 },
      { id: 2, type: 'movie', genres: [10752, 28], popularity: 800 }],
    intersections: {
      '101,202': [{ id: 41, type: 'movie', genres: [10752, 28], popularity: 40 }],
      '101,303': [{ id: 42, type: 'movie', genres: [10752, 28], popularity: 25 }],
      '202,303': [{ id: 43, type: 'movie', genres: [10752], popularity: 12 }]
    }
  });
  const pool = await run(intent, services);
  // The intersection works are in the pool before any ranking, even though the
  // broad angle only lists the two popular genre entries.
  for (const id of [41, 42]) assert.ok(ids(pool).includes(id), `intersection work ${id} missing from the pool`);
  for (const id of [1, 2]) assert.ok(ids(pool).includes(id), `popular entry ${id} must stay retrieved`);
  // A third, complementary concept pair is also queried: the intersection is
  // explored beyond the two historical anchors.
  const conjunctionCalls = calls.filter(call => String(call.params.with_keywords || '').includes(','));
  assert.ok(conjunctionCalls.length >= 3, `paires interrogées : ${conjunctionCalls.length}`);
  // The request states a modern period ("modern warfare"), so the historical
  // angles are joined by the complementary pair and the release-date angle.
  assert.ok(calls.length >= 2 && calls.length <= 10, `angles=${calls.length}`);
  assert.ok(calls.some(call => call.params.sort_by === 'primary_release_date.desc'),
    'a modern request schedules the release-date angle');
});

test('without a stated period the historical angles are unchanged', async () => {
  const intent = createCanonicalIntent({ mediaType: 'movie', genres: ['War'],
    themes: ['military aviation', 'aerial combat'], keywords: ['dogfight'] });
  const { calls, services } = provider({
    keywordIds: { 'military aviation': 201, 'aerial combat': 202, dogfight: 203 },
    popular: [{ id: 1, type: 'movie', genres: [10752], popularity: 900 }],
    intersections: { '201,202': [{ id: 41, type: 'movie', popularity: 20 }] }
  });
  await run(intent, services);
  // Two anchored intersections, the broad backoff, and the genre-free angle on
  // its three pages: the historical set plus one additive, deeper angle, with
  // no recency angle since the request states no period.
  assert.equal(calls.length, 6, 'the historical angle set plus the genre-free angle');
  assert.ok(!calls.some(call => String(call.params.sort_by).includes('release_date')));
  assert.ok(!calls.some(call => call.params['primary_release_date.gte']));
  assert.ok(calls.some(call => call.params.with_genres === undefined), 'one angle drops the genre');
});

test('a modern request adds the release-date angle and its precise work', async () => {
  const intent = createCanonicalIntent({ mediaType: 'movie', genres: ['War'],
    themes: ['modern warfare', 'military aviation'], keywords: ['dogfight'] });
  const { calls, services } = provider({
    keywordIds: { 'modern warfare': 101, 'military aviation': 202, dogfight: 303 },
    popular: [{ id: 1, type: 'movie', genres: [10752], popularity: 900 }],
    intersections: { '101,202': [{ id: 41, type: 'movie', genres: [10752], popularity: 30 }] },
    recent: [{ id: 55, type: 'movie', genres: [10752, 28], popularity: 6, year: 2024 }]
  });
  const pool = await run(intent, services);
  const recentCall = calls.find(call => call.params.sort_by === 'primary_release_date.desc');
  assert.ok(recentCall, 'a modern request schedules the release-date angle');
  assert.ok(Number(recentCall.params['primary_release_date.gte']?.slice(0, 4)) > 1990,
    'the release-date angle is bounded to the recent period');
  assert.ok(ids(pool).includes(55), 'the precise contemporary work enters the pool');
  assert.ok(ids(pool).includes(1), 'the popular entries are still retrieved');
});

const DOMAINS = [
  { name: 'horror / possession', genres: ['Horror'], themes: ['demonic possession'], keywords: ['exorcism', 'priest'],
    keywordIds: { 'demonic possession': 11, exorcism: 12, priest: 13 }, precise: 6101 },
  { name: 'sci-fi / artificial intelligence', genres: ['Science Fiction'], themes: ['artificial intelligence'], keywords: ['android', 'dystopia'],
    keywordIds: { 'artificial intelligence': 21, android: 22, dystopia: 23 }, precise: 6202 },
  { name: 'comedy / road trip', genres: ['Comedy'], themes: ['friendship'], keywords: ['road trip', 'wedding'],
    keywordIds: { friendship: 31, 'road trip': 32, wedding: 33 }, precise: 6303 },
  { name: 'crime tv / cold case', genres: ['Crime', 'Drama'], themes: ['cold case'], keywords: ['detective', 'unsolved crime'],
    keywordIds: { 'cold case': 41, detective: 42, 'unsolved crime': 43 }, precise: 6404 },
  { name: 'romance / memory', genres: ['Romance'], themes: ['memory'], keywords: ['amnesia', 'second chance'],
    keywordIds: { memory: 51, amnesia: 52, 'second chance': 53 }, precise: 6505 }
];

for (const domain of DOMAINS) test(`${domain.name}: a work answering two concepts enters the pool`, async () => {
  const intent = createCanonicalIntent({ mediaType: 'movie', genres: domain.genres,
    themes: domain.themes, keywords: domain.keywords });
  const [first, second] = Object.values(domain.keywordIds);
  const { services } = provider({
    keywordIds: domain.keywordIds,
    popular: [{ id: 900, type: 'movie', genres: [], popularity: 700 },
      { id: 901, type: 'movie', genres: [], popularity: 650 }],
    // The precise work is tagged with the two most discriminating concepts only,
    // so it is reachable through the pair intersection and nowhere else.
    intersections: { [`${first},${second}`]: [{ id: domain.precise, type: 'movie', popularity: 5 }],
      [`${second},${first}`]: [{ id: domain.precise, type: 'movie', popularity: 5 }] }
  });
  const pool = await run(intent, services);
  assert.ok(ids(pool).includes(domain.precise), `${domain.name}: precise work missing from the pool`);
  assert.ok(ids(pool).includes(900), `${domain.name}: the broad angle is still retrieved`);
  assert.ok(pool.length <= RETRIEVAL_LIMITS.pool);
});

test('the request stays inside the provider budget without a source error', async () => {
  const intent = createCanonicalIntent({ mediaType: 'movie', genres: ['War'],
    themes: ['modern warfare', 'military aviation', 'technological warfare'],
    keywords: ['dogfight', 'aerial combat', 'stealth aircraft'] });
  const telemetry = {};
  const { services } = provider({
    keywordIds: { 'modern warfare': 1, 'military aviation': 2, 'technological warfare': 3,
      dogfight: 4, 'aerial combat': 5, 'stealth aircraft': 6 },
    popular: Array.from({ length: 20 }, (_, index) => ({ id: index + 1, type: 'movie', popularity: 500 - index })),
    intersections: { '1,2': [{ id: 99, type: 'movie', popularity: 3 }] }
  });
  const pool = await hybridRetrieve({ intent, resolvedContext: {}, services,
    context: { telemetry, semanticIntentContext: { intentType: 'specific_title_description',
      semanticConcepts: intent.themes, narrativeMotifs: intent.keywords } } });
  assert.equal(telemetry.retrievalSourceErrorCount, 0);
  assert.ok((telemetry.tmdbCalls || 0) <= 30, `tmdbCalls=${telemetry.tmdbCalls}`);
  assert.ok(ids(pool).includes(99));
});

test('the complementary angles are derived from the intent, never from a title', async () => {
  const build = async keywords => {
    const intent = createCanonicalIntent({ mediaType: 'movie', genres: ['War'], themes: [], keywords });
    const { services } = provider({
      keywordIds: Object.fromEntries(keywords.map((term, index) => [term, index + 1])),
      popular: [{ id: 1, type: 'movie', popularity: 100 }]
    });
    const terms = [];
    const original = services.keyword;
    services.keyword = async term => { terms.push(term); return original(term); };
    await run(intent, services);
    return terms.join('|');
  };
  const first = await build(['dogfight', 'aerial combat']);
  const second = await build(['submarine', 'sonar operator']);
  assert.match(first, /dogfight/);
  assert.match(second, /submarine/);
  assert.notEqual(first, second, 'the angles follow the concepts the request states');
});
