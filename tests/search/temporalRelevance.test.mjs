/**
 * Temporal relevance and public score calibration (Mission 2, live-reported).
 *
 * Two reported phenomena are covered here, on the real ranking module:
 *  - "film de guerre moderne avec des avions de combat" led with a 1927 and a
 *    1930 work while a 2022 one was second: the temporal wording of the request
 *    only existed as a narrative concept, so it ranked the period as content;
 *  - the displayed percentages were compressed between 48 and 69 on a strong
 *    grid, so an excellent match did not stand out from an average one.
 *
 * The fixture pool mirrors the works the live engine actually returns for the
 * three reported queries. Nothing here retrieves: every assertion is about the
 * ranking layer and its public calibration.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import {
  ELICINE_RANKING_CONFIG, contemporaryAffinity, publicMatchScore, recencyFit,
  rankSearchCandidates, scoreSearchCandidate
} from '../../src/search/searchRanker.js';

const row = (id, { title, year, overview, genreIds = [10752], popularity = 20,
  voteAverage = 7.5, voteCount = 2000, keywords = [], themes = [] }) => ({
  id, media_type: 'movie', title, original_title: title, overview,
  release_date: `${year}-06-01`, original_language: 'en', genre_ids: genreIds,
  vote_average: voteAverage, vote_count: voteCount, popularity,
  keywords, themes
});

function candidate(id, options, source = 'tmdb_discover', signals = {}) {
  const built = toRetrievalCandidate(row(id, options), source, signals);
  assert.ok(built, `fixture ${id} is not a valid retrieval candidate`);
  return built;
}

/** Works the live grid returns for "film de guerre moderne avec des avions de combat". */
const modernWarAviationPool = () => [
  candidate(361743, { title: 'Top Gun : Maverick', year: 2022, popularity: 46, voteAverage: 8.2,
    voteCount: 11580, genreIds: [28, 18],
    overview: "Un pilote de chasse legendaire forme une nouvelle generation de pilotes pour une mission "
      + "aérienne impossible : aviation militaire, avions de combat et guerre moderne.",
    themes: ['modern warfare', 'military aviation', 'fighter aircraft'],
    keywords: ['fighter aircraft', 'air force'] }),
  candidate(10798, { title: 'Les Chevaliers du ciel', year: 2005, popularity: 4, voteAverage: 6.1,
    voteCount: 226, genreIds: [28, 12],
    overview: "Deux pilotes de Mirage 2000 poursuivent un avion de chasse détourné au-dessus de Paris.",
    themes: ['military aviation', 'fighter aircraft'], keywords: ['fighter aircraft'] }),
  candidate(10385, { title: "Aigle de fer", year: 1986, popularity: 8, voteAverage: 6.5,
    voteCount: 1200, genreIds: [28, 10752],
    overview: "Des pilotes de chasse americains affrontent des avions de combat ennemis.",
    themes: ['military aviation', 'fighter aircraft'], keywords: ['fighter aircraft', 'air force'] }),
  candidate(2466, { title: 'Les Ailes', year: 1927, popularity: 5, voteAverage: 7.5,
    voteCount: 900, genreIds: [10752, 18],
    overview: "Deux aviateurs americains s'engagent dans l'aviation militaire pendant la guerre.",
    themes: ['military aviation'], keywords: ['air force'] }),
  candidate(2467, { title: "La Patrouille de l'aube", year: 1930, popularity: 3, voteAverage: 7,
    voteCount: 400, genreIds: [10752, 18],
    overview: "Escadrille de la Premiere Guerre mondiale : aviateurs et combats aériens.",
    themes: ['military aviation'], keywords: ['air force'] })
];

/** Works an era request must keep: the 1940s aviation war films of the catalogue. */
const fortiesAviationPool = () => [
  candidate(43362, { title: 'Air Force', year: 1943, popularity: 6, voteAverage: 6.4,
    voteCount: 200, genreIds: [10752, 18],
    overview: "L'equipage d'un bombardier de l'aviation militaire americaine en 1941.",
    themes: ['military aviation'], keywords: ['air force'] }),
  candidate(20012, { title: 'Trente secondes sur Tokyo', year: 1944, popularity: 5, voteAverage: 7,
    voteCount: 300, genreIds: [10752, 18],
    overview: "Le raid aerien de Tokyo par les aviateurs de l'aviation militaire americaine.",
    themes: ['military aviation'], keywords: ['air force'] }),
  candidate(361743, { title: 'Top Gun : Maverick', year: 2022, popularity: 46, voteAverage: 8.2,
    voteCount: 11580, genreIds: [28, 18],
    overview: "Aviation militaire contemporaine et avions de combat survolant la mer.",
    themes: ['military aviation', 'fighter aircraft'], keywords: ['fighter aircraft'] })
];

const modernIntent = extra => createCanonicalIntent({ mediaType: 'movie', genres: ['War'],
  themes: ['modern warfare', 'military aviation', 'fighter aircraft'],
  keywords: ['air force', 'aerial combat'], ...extra });

/** The interpretation of "film de guerre des années 1940 avec des avions". */
const fortiesIntent = extra => createCanonicalIntent({ mediaType: 'movie', genres: ['War', 'History'],
  themes: ['world war ii', 'military aviation'], keywords: ['air force'],
  yearMin: 1940, yearMax: 1949, ...extra });

const queryOne = 'film de guerre moderne avec des avions de combat';
const queryTwo = 'film de guerre des années 1940 avec des avions';
const queryThree = 'film récent d’aviation militaire';

const rank = (pool, intent, queryText) => rankSearchCandidates(pool, intent, {}, { telemetry: {}, queryText });
const byId = (ranked, id) => ranked.find(entry => entry.tmdbId === id);
const position = (ranked, id) => ranked.findIndex(entry => entry.tmdbId === id);

test('the three reported requests are read as temporal intent on the wording alone', () => {
  assert.equal(contemporaryAffinity(modernIntent(), queryOne), 1);
  assert.equal(contemporaryAffinity(modernIntent(), queryThree), 1);
  // The concept channel carries it too, for a request the interpreter translated.
  assert.equal(contemporaryAffinity(modernIntent(), ''), 1);
  // An era request states its own period: the derived preference stays inert.
  assert.equal(contemporaryAffinity(fortiesIntent(), queryTwo), 0);
  assert.equal(contemporaryAffinity(createCanonicalIntent({ mediaType: 'movie', genres: ['War'],
    themes: ['military aviation'] }), 'film de guerre avec des avions'), 0);
});

test('a modern request ranks a contemporary work above very old ones without dropping them', () => {
  const ranked = rank(modernWarAviationPool(), modernIntent(), queryOne);
  assert.equal(ranked[0].title, 'Top Gun : Maverick');
  assert.ok(position(ranked, 361743) < position(ranked, 2466));
  assert.ok(position(ranked, 361743) < position(ranked, 2467));
  // Gradued, never hard: the 1927 work is still admissible, only ranked lower.
  assert.equal(ranked.length, 5);
  assert.ok(byId(ranked, 361743).ranking.finalScore > byId(ranked, 2466).ranking.finalScore);
  assert.ok(byId(ranked, 361743).ranking.temporalScore > byId(ranked, 2466).ranking.temporalScore);
  // The 1927 and 1930 works lose their lead, not their relevance record.
  assert.ok(byId(ranked, 2466).ranking.matchScore >= 35, `${byId(ranked, 2466).ranking.matchScore}`);
});

test('the same request without a temporal word leaves every score untouched', () => {
  const pool = modernWarAviationPool();
  const intent = createCanonicalIntent({ mediaType: 'movie', genres: ['War'],
    themes: ['military aviation', 'fighter aircraft'], keywords: ['air force'] });
  const neutral = rank(pool, intent, 'film de guerre avec des avions');
  const empty = rank(pool, intent, '');
  for (const entry of neutral) {
    assert.equal(entry.ranking.temporalScore, 0);
    assert.equal(entry.ranking.finalScore, byId(empty, entry.tmdbId).ranking.finalScore);
  }
});

test('an era request keeps its own works in front of contemporary ones', () => {
  const ranked = rank(fortiesAviationPool(), fortiesIntent(), queryTwo);
  assert.ok(String(ranked[0].releaseDate).startsWith('194'));
  assert.ok(position(ranked, 43362) < position(ranked, 361743));
  assert.ok(position(ranked, 20012) < position(ranked, 361743));
  const forties = byId(ranked, 43362).ranking;
  const contemporary = byId(ranked, 361743).ranking;
  assert.equal(forties.temporalScore, 0);
  assert.ok(forties.yearScore > contemporary.yearScore);
  assert.ok(forties.matchScore > contemporary.matchScore);
});

test('a recent request is honoured from the wording, not only from the concepts', () => {
  const intent = createCanonicalIntent({ mediaType: 'movie', genres: ['War'],
    themes: ['military aviation'], keywords: ['fighter aircraft'] });
  const ranked = rank(modernWarAviationPool(), intent, queryThree);
  assert.ok(position(ranked, 361743) < position(ranked, 2466));
  assert.ok(position(ranked, 10798) < position(ranked, 2467));
  assert.ok(byId(ranked, 361743).ranking.temporalScore > byId(ranked, 2467).ranking.temporalScore);
});

test('an explicit period wins over the derived preference', () => {
  const constrained = fortiesIntent();
  const forties = scoreSearchCandidate(candidate(1, { title: 'Air Force', year: 1943,
    overview: 'Aviation militaire et avions en 1943.', themes: ['military aviation'] }), constrained,
  {}, { queryText: 'film de guerre moderne des années 1940 avec des avions' });
  assert.equal(forties.temporalScore, 0);
  assert.equal(forties.yearScore, 1);
});

test('recency is a graded ramp, from a work released today down to the horizon', () => {
  const reference = 2026;
  const horizon = ELICINE_RANKING_CONFIG.temporalPreference.horizonYears;
  assert.equal(recencyFit(reference, { referenceYear: reference }), 1);
  const halfway = recencyFit(reference - Math.floor(horizon / 2), { referenceYear: reference });
  assert.ok(halfway > 0.4 && halfway < 0.6, `${halfway}`);
  assert.equal(recencyFit(reference - horizon, { referenceYear: reference }), 0);
  assert.equal(recencyFit(reference - horizon - 40, { referenceYear: reference }), 0);
  assert.equal(recencyFit(null, { referenceYear: reference }), null);
});

test('the public score follows the documented ladder and separates excellent from average', () => {
  assert.equal(publicMatchScore(0), 0);
  assert.equal(publicMatchScore(1), 100);
  const excellent = publicMatchScore(0.74);
  const good = publicMatchScore(0.6);
  const average = publicMatchScore(0.52);
  const medium = publicMatchScore(0.4);
  const weak = publicMatchScore(0.32);
  assert.ok(excellent >= 80 && excellent <= 95, `${excellent}`);
  assert.ok(good >= 70 && good <= 85, `${good}`);
  assert.ok(average >= 60 && average <= 75, `${average}`);
  assert.ok(medium >= 40 && medium <= 60, `${medium}`);
  assert.ok(weak < 45, `${weak}`);
  // The reported compression: a strong grid used to span 21 points.
  assert.ok(excellent - medium >= 30, `${excellent} - ${medium}`);
  assert.ok(publicMatchScore(0.7) - publicMatchScore(0.64) >= 5);
  const values = Array.from({ length: 101 }, (_, index) => publicMatchScore(index / 100));
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] >= values[index - 1], `not monotone at ${index / 100}`);
  }
});

test('through the real pipeline, the modern request leads with the contemporary work', async () => {
  const pool = modernWarAviationPool();
  const rows = pool.map(entry => row(entry.tmdbId, {
    title: entry.title, year: Number(entry.releaseDate.slice(0, 4)), overview: entry.metadata.overview,
    genreIds: entry.genreIds, popularity: entry.metadata.popularity, voteAverage: entry.metadata.vote_average,
    voteCount: entry.metadata.vote_count, keywords: entry.constraintData?.keywords,
    themes: entry.constraintData?.themes
  }));
  const services = { vector: async () => rows, discover: async () => rows };
  const orchestration = { canonicalIntent: modernIntent(), resolvedIntentContext: {}, userQuery: queryOne };
  const results = await orchestrateCandidateRetrieval({ orchestration, services,
    context: { telemetry: {} }, env: { HYBRID_RETRIEVAL_ENABLED: 'true',
      STRICT_CONSTRAINT_FILTER_ENABLED: 'true', ELICINE_RANKING_ENABLED: 'true',
      DIVERSIFIED_RANKING_ENABLED: 'true', RESULT_BUDGET_ENABLED: 'true' } });
  assert.ok(Array.isArray(results) && results.length > 0);
  assert.equal(results[0].title, 'Top Gun : Maverick');
  const displayed = results.map(entry => entry.ranking.matchScore);
  assert.ok(displayed[0] >= 75, `top ${displayed[0]}`);
  assert.ok(displayed[0] - displayed.at(-1) >= 15, displayed.join(','));
  assert.ok(results.every(entry => entry.ranking.finalScore <= 1 && entry.ranking.finalScore >= 0));
});
