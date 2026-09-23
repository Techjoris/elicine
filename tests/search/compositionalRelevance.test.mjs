/**
 * Compositional relevance: the score must reward the *intersection* of the
 * criteria a rich request states, not merely the presence of one of them.
 *
 * Live symptom this suite locks down: "film de guerre moderne avec des scènes
 * de dog fight" let a candidate that only answered "aviation" rival a candidate
 * answering film + war + modern + military aviation + dogfight. Every case here
 * is built from generic metadata only - no title, year or identifier is ever
 * special-cased by the engine.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { mergeCandidates, toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { rankSearchCandidates, scoreSearchCandidate } from '../../src/search/searchRanker.js';
import { evaluateStrictConstraints } from '../../src/search/strictConstraintFilter.js';
import { buildSignalLedger, isStyleConcept } from '../../src/search/signalLedger.js';

const WAR = 10752;
const ACTION = 28;
const DRAMA = 18;
const THRILLER = 53;
const CRIME = 80;
const COMEDY = 35;
const ROMANCE = 10749;
const ADVENTURE = 12;

const candidate = (id, {
  title = `Fixture ${id}`, overview = '', genreIds = [DRAMA], release = '2019-06-01',
  language = 'en', countries = ['US'], voteAverage = 7.4, voteCount = 2500, popularity = 25,
  keywords = [], themes = [], moods = [], sources = ['tmdb_discover']
} = {}) => {
  const row = {
    id, media_type: 'movie', title, original_title: title, overview, release_date: release,
    original_language: language, genre_ids: genreIds, vote_average: voteAverage,
    vote_count: voteCount, popularity, keywords, themes, moods,
    production_countries: countries.map(code => ({ iso_3166_1: code }))
  };
  const built = toRetrievalCandidate(row, sources[0]);
  assert.ok(built, `fixture ${id} is not a valid candidate`);
  return sources.length === 1 ? built : {
    ...built,
    sources: [...new Set(sources)],
    retrievalSignals: sources.map(source => ({ source }))
  };
};

const intent = input => createCanonicalIntent(input);
const rank = (pool, canonical, queryText) => rankSearchCandidates(pool, canonical, {}, { queryText, enabled: true });
const byId = (ranked, id) => ranked.find(entry => entry.tmdbId === id);
const total = id => Number(id);

test('the candidate answering every stated criterion beats the one answering a single one', () => {
  const canonical = intent({
    mediaType: 'movie', genres: ['War'],
    themes: ['modern warfare', 'military aviation'], keywords: ['dogfight', 'fighter pilots']
  });
  const query = 'film de guerre moderne avec des scènes de dog fight';
  const complete = candidate(1, {
    title: 'Complete', genreIds: [WAR, ACTION], release: '2019-09-01',
    overview: "En 2019, des pilotes de chasse livrent un combat aérien de haute intensité : chaque dogfight engage des avions de combat modernes, en pleine guerre moderne.",
    themes: ['modern warfare', 'military aviation'], keywords: ['dogfight', 'fighter pilots'],
    voteAverage: 7.6, voteCount: 4200, popularity: 40
  });
  const aviationOnly = candidate(2, {
    title: 'Aviation Only', genreIds: [DRAMA], release: '1996-04-01',
    overview: "Un film sur l'aviation civile et les pilotes de ligne.",
    keywords: ['aviation', 'pilots'], voteAverage: 7.1, voteCount: 1800, popularity: 30
  });
  const warOnly = candidate(3, {
    title: 'War Only', genreIds: [WAR], release: '1962-01-01',
    overview: 'Un bataillon dans les tranchées pendant la grande guerre.',
    keywords: ['war'], voteAverage: 7.8, voteCount: 3000, popularity: 22
  });
  const keywordOnly = candidate(4, {
    title: 'Keyword Only', genreIds: [ADVENTURE], release: '2018-01-01',
    overview: 'Une course-poursuite entre deux bandes rivales.',
    keywords: ['dogfight'], voteAverage: 7.9, voteCount: 5000, popularity: 60
  });

  const ranked = rank([aviationOnly, warOnly, keywordOnly, complete], canonical, query);
  assert.equal(ranked[0].tmdbId, 1, 'the complete answer leads the grid');
  for (const id of [2, 3, 4]) {
    const partial = byId(ranked, id);
    assert.ok(partial.ranking.partialPenalty > 0, `partial candidate ${id} is penalised`);
    assert.ok(ranked[0].ranking.finalScore - partial.ranking.finalScore >= 0.15,
      `complete vs partial ${id}: ${ranked[0].ranking.finalScore} vs ${partial.ranking.finalScore}`);
  }
  assert.ok(byId(ranked, 1).ranking.compositionScore > byId(ranked, 2).ranking.compositionScore);
  assert.ok(byId(ranked, 1).ranking.compositionSatisfiedShare > byId(ranked, 2).ranking.compositionSatisfiedShare);
});

test('an intersection of moderate matches outranks one excellent single concept', () => {
  const canonical = intent({
    mediaType: 'movie', genres: ['War'], yearMin: 2010,
    themes: ['military aviation'], keywords: ['dogfight'], languages: ['en']
  });
  const wellSpread = candidate(11, {
    title: 'Well Spread', genreIds: [WAR], release: '2016-01-01', language: 'en',
    overview: "Des avions de combat s'affrontent au-dessus du desert pendant une guerre moderne.",
    themes: ['military aviation'], keywords: ['dogfight'], voteAverage: 6.9, voteCount: 900, popularity: 15
  });
  const oneDimension = candidate(12, {
    title: 'One Dimension', genreIds: [WAR], release: '2020-01-01', language: 'fr',
    overview: 'Un peloton de soldats traverse la jungle.',
    voteAverage: 8.6, voteCount: 60000, popularity: 400
  });
  const ranked = rank([oneDimension, wellSpread], canonical,
    'un film de guerre moderne avec des dogfights');
  assert.equal(ranked[0].tmdbId, 11, 'the multi-signal answer wins despite being far less popular');
  assert.ok(byId(ranked, 12).ranking.compositionSatisfiedShare < 0.5);
});

test('a stated exclusion removes the off-topic candidate before the ranking', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['War'],
    keywords: ['dogfight'], semanticExclusions: ['romance'] });
  const war = candidate(21, { title: 'War', genreIds: [WAR], overview: 'Un combat aérien.', keywords: ['dogfight'] });
  const romance = candidate(22, { title: 'Romance', genreIds: [ROMANCE, COMEDY],
    overview: "Une histoire d'amour pendant la guerre, avec des avions.", keywords: ['dogfight'] });
  assert.equal(evaluateStrictConstraints(romance, canonical).eligible, false);
  assert.equal(evaluateStrictConstraints(war, canonical).eligible, true);
  const ranked = rank([romance, war].filter(item => evaluateStrictConstraints(item, canonical).eligible), canonical, 'film de guerre avec dogfight sans romance');
  assert.deepEqual(ranked.map(entry => entry.tmdbId), [21]);
});

test('a comparative stays relative to the requested direction, in both directions', () => {
  const reference = { tmdbId: 900, mediaType: 'movie', canonicalTitle: 'Seed', genreIds: [THRILLER] };
  const resolved = { resolvedTitles: [reference] };
  const dark = candidate(31, { title: 'Dark One', genreIds: [THRILLER],
    overview: 'Un thriller sombre, oppressant et glacial, dans une ville sinistre.' });
  const light = candidate(32, { title: 'Light One', genreIds: [THRILLER],
    overview: 'Un thriller lumineux et joyeux, plein de bonne humeur.' });
  const canonical = intent({ mediaType: 'movie', genres: ['Thriller'], moods: ['dark'] });
  const darker = rankSearchCandidates([light, dark], canonical, resolved,
    { queryText: 'un thriller plus sombre', enabled: true });
  assert.equal(darker[0].tmdbId, 31);
  const gentler = rankSearchCandidates([light, dark], canonical, resolved,
    { queryText: 'un film moins violent', enabled: true });
  assert.ok(gentler[0].ranking.preferenceScore >= gentler[1].ranking.preferenceScore);
});

test('period words work in both directions without a hard cut', () => {
  const old = candidate(41, { title: 'Old War', genreIds: [WAR], release: '1968-01-01',
    overview: 'Une escadrille pendant la seconde guerre mondiale.' });
  const modern = candidate(42, { title: 'Modern War', genreIds: [WAR], release: '2021-01-01',
    overview: 'Une escadrille pendant une guerre moderne.' });
  const canonical = intent({ mediaType: 'movie', genres: ['War'] });
  const recentFirst = rank([old, modern], canonical, 'un film de guerre moderne');
  assert.equal(recentFirst[0].tmdbId, 42);
  const classicFirst = rank([old, modern], canonical, 'un film de guerre ancien');
  assert.equal(classicFirst[0].tmdbId, 41, 'an older wording pulls the other way');
  assert.equal(classicFirst.length, 2, 'nothing is filtered by a period preference');
});

test('at equal concept coverage, the stated period is the signal that decides', () => {
  const build = (id, title, year) => candidate(id, {
    title, genreIds: [WAR], release: `${year}-05-01`,
    overview: "Des avions de combat livrent un combat aerien de haute intensite pendant la guerre.",
    themes: ['military aviation'], keywords: ['aerial combat']
  });
  const canonical = intent({ mediaType: 'movie', genres: ['War'],
    themes: ['military aviation'], keywords: ['aerial combat'] });
  const older = build(43, 'Older Aviation', 2009);
  const recent = build(44, 'Recent Aviation', 2022);
  const modernRequest = rank([older, recent], canonical, 'film de guerre moderne avec des avions de combat');
  assert.equal(modernRequest[0].tmdbId, 44);
  const vintageRequest = rank([older, recent], canonical, 'film de guerre ancien avec des avions de combat');
  assert.equal(vintageRequest[0].tmdbId, 43);
  // Both directions stay bounded: the same two works, never a filtered pool.
  assert.equal(modernRequest.length, 2);
  assert.equal(vintageRequest.length, 2);
});

test('mood and narrative elements are measured as separate families', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['Thriller'],
    moods: ['dark'], keywords: ['heist'] });
  const hedge = candidate(51, { title: 'Hedge', genreIds: [THRILLER, CRIME],
    overview: 'Un braquage prepare dans les moindres details.', keywords: ['heist'],
    moods: ['dark'] });
  const heistOnly = candidate(52, { title: 'Heist Only', genreIds: [THRILLER, CRIME],
    overview: 'Un braquage prepare dans les moindres details.', keywords: ['heist'] });
  const generic = candidate(53, { title: 'Generic', genreIds: [THRILLER],
    overview: 'Une enquete comme les autres.' });
  const ranked = rank([generic, heistOnly, hedge], canonical, 'un thriller sombre sur un braquage');
  assert.equal(ranked[0].tmdbId, 51);
  assert.ok(ranked[0].ranking.moodScore > ranked[1].ranking.moodScore);
});

test('a reference title seeds similarity without becoming the answer', () => {
  const seed = candidate(61, { title: 'Seed Work', genreIds: [ACTION, THRILLER],
    overview: 'Un voleur penetre dans les reves pour y derober des secrets.' });
  const similar = candidate(62, { title: 'Similar Work', genreIds: [ACTION, THRILLER],
    overview: 'Une equipe penetre dans les reves partages pour y implanter une idee.' });
  const unrelated = candidate(63, { title: 'Unrelated', genreIds: [COMEDY],
    overview: 'Une comedie familiale sans enjeu.' });
  const canonical = intent({ mediaType: 'movie', genres: ['Action'],
    themes: ['shared dreams'], keywords: ['subconscious'] });
  const resolved = { resolvedTitles: [{ tmdbId: 61, mediaType: 'movie', canonicalTitle: 'Seed Work', genreIds: [ACTION, THRILLER] }] };
  const ranked = rankSearchCandidates([unrelated, seed, similar], canonical, resolved,
    { queryText: 'un film comme Seed Work sur les reves partages', enabled: true });
  assert.equal(ranked[0].tmdbId, 62, 'the work that answers the concepts leads');
  assert.equal(byId(ranked, 61).ranking.identifiedWorkScore, 0, 'a style seed is not the answer');
});

test('a person adds independent evidence instead of replacing the described work', () => {
  const personSignal = { source: 'tmdb_person_credits', personTmdbId: 31, resolutionConfidence: 1 };
  const described = candidate(71, { title: 'Described', genreIds: [WAR], keywords: ['dogfight'],
    overview: 'Un pilote de chasse pendant la guerre moderne.', sources: ['tmdb_discover'] });
  described.retrievalSignals = [...described.retrievalSignals, personSignal];
  const filmographyOnly = candidate(72, { title: 'Filmography Only', genreIds: [COMEDY],
    overview: 'Une comedie legere.', sources: ['tmdb_person_credits'] });
  filmographyOnly.retrievalSignals = [personSignal];
  const canonical = intent({ mediaType: 'movie', genres: ['War'], keywords: ['dogfight'] });
  const resolved = { resolvedPeople: [{ tmdbId: 31, name: 'Person', resolutionConfidence: 1 }] };
  const ranked = rankSearchCandidates([filmographyOnly, described], canonical, resolved,
    { queryText: 'un film de guerre avec des dogfights', enabled: true });
  assert.equal(ranked[0].tmdbId, 71);
  assert.ok(ranked[0].ranking.entityScore > 0);
  assert.ok(ranked[0].ranking.finalScore > ranked[1].ranking.finalScore);
});

test('stylistic requests are read as their own family, generically', () => {
  assert.equal(isStyleConcept('neo noir'), true);
  assert.equal(isStyleConcept('réaliste'), true);
  assert.equal(isStyleConcept('heist'), false);
  const canonical = intent({ mediaType: 'movie', genres: ['Thriller'],
    themes: ['realistic'], keywords: ['procedural'] });
  const anchored = candidate(81, { title: 'Anchored', genreIds: [THRILLER],
    overview: "Un thriller realiste, inspire de faits reels, filme comme un documentaire." });
  const stylised = candidate(82, { title: 'Stylised', genreIds: [THRILLER],
    overview: 'Un thriller surrealiste et onirique, au style tres stylise.' });
  const ranked = rank([stylised, anchored], canonical, 'un thriller réaliste et clinique');
  assert.equal(ranked[0].tmdbId, 81);
  const ledger = buildSignalLedger({ intent: canonical, candidate: anchored,
    components: ranked[0].ranking, text: 'thriller realiste inspire de faits reels documentaire',
    structured: ['realistic', 'procedural'] });
  assert.ok(ledger.families.some(family => family.id === 'style'));
});

test('a bare category keeps exactly its historical behaviour', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['Horror'] });
  const strong = candidate(91, { title: 'Strong', genreIds: [27],
    overview: "Un classique de l'horreur.", voteAverage: 8.2, voteCount: 19395, popularity: 33 });
  const result = scoreSearchCandidate(strong, canonical, {}, { queryText: "un film d'horreur" });
  assert.equal(result.compositionBreadth <= 0.5, true, 'one described family: no intersection effect');
  assert.equal(result.partialPenalty, 0);
  assert.equal(result.partialFactor, 1);
  assert.equal(result.composedIntentScore, result.intentScore);
});

test('a concept-specific but less popular title still enters the bounded pool', () => {
  // Same source and same source strength: only the retrieval evidence differs.
  // Before, the popularity-ordered entry (sourceRank 3) won the last seat; the
  // keyword-restricted title, ranked 40 in its own list, is the one the request
  // actually described.
  const popular = toRetrievalCandidate({
    id: 101, media_type: 'movie', title: 'Popular', overview: 'Un film tres regarde.',
    genre_ids: [DRAMA], release_date: '2021-01-01', vote_average: 7, vote_count: 9000, popularity: 500
  }, 'tmdb_discover', { sourceRank: 3 });
  const described = toRetrievalCandidate({
    id: 102, media_type: 'movie', title: 'Described', overview: 'Une escadrille en guerre.',
    genre_ids: [WAR], release_date: '1988-01-01', vote_average: 7.2, vote_count: 300, popularity: 4
  }, 'tmdb_discover', { sourceRank: 40, keywordIds: [1234, 5678], keywordConjunctionSize: 2 });
  const { candidates } = mergeCandidates([popular, described], 1);
  assert.deepEqual(candidates.map(item => item.tmdbId), [102],
    'concept evidence wins the last admission seat, not popularity order');
  // Without any specific evidence the historical order is untouched.
  const plain = toRetrievalCandidate({
    id: 103, media_type: 'movie', title: 'Plain', overview: 'Un film.',
    genre_ids: [DRAMA], release_date: '2021-01-01', vote_average: 7, vote_count: 100, popularity: 3
  }, 'tmdb_discover', { sourceRank: 40 });
  assert.deepEqual(mergeCandidates([popular, plain], 1).candidates.map(item => item.tmdbId), [101]);
});
