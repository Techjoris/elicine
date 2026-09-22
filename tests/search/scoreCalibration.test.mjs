/**
 * Public score calibration (reported live: "the match percentages still do not
 * correspond to the real match level of the films").
 *
 * The displayed percentage combines the two things a user actually reads it as:
 * how much of the request the work answers (the intent coverage) and how strong
 * a choice it is (rating, how many people vouch for it, visibility, provenance).
 * The two multiply, so neither a bare genre tag nor a famous title can produce a
 * high number on its own, and the share the strength is allowed to move depends
 * on how much the request describes - never on a title, a year or a genre.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import {
  ELICINE_RANKING_CONFIG, publicMatchScore, rankSearchCandidates, scoreSearchCandidate
} from '../../src/search/searchRanker.js';

const row = (id, { title, overview, genreIds = [27], voteAverage = 7, voteCount = 1000,
  popularity = 20, keywords = [], themes = [] }) => ({
  id, media_type: 'movie', title, original_title: title, overview, release_date: '2020-01-01',
  original_language: 'en', genre_ids: genreIds, vote_average: voteAverage, vote_count: voteCount,
  popularity, keywords, themes
});
const candidate = (id, options, source = 'tmdb_discover') => {
  const built = toRetrievalCandidate(row(id, options), source);
  assert.ok(built, `fixture ${id} is not a valid candidate`);
  return built;
};
const intent = input => createCanonicalIntent(input);
const score = (name, candidateRow, canonical) => {
  const result = scoreSearchCandidate(candidateRow, canonical, {});
  return { name, ...result };
};

const horror = intent({ mediaType: 'movie', genres: ['Horror'] });
const warAviation = intent({ mediaType: 'movie', genres: ['War'],
  themes: ['military aviation', 'fighter aircraft'], keywords: ['air force'] });

test('a bare category is answered by the strength of the work, not by its genre alone', () => {
  const acclaimed = candidate(1, { title: 'Acclaimed', overview: "Un classique de l'horreur.",
    voteAverage: 8.2, voteCount: 19395, popularity: 33 });
  const unseen = candidate(2, { title: 'Unseen', overview: "Un film d'horreur recent.",
    voteAverage: 6.4, voteCount: 12, popularity: 74 });
  const strong = score('acclaimed', acclaimed, horror);
  const weak = score('unseen', unseen, horror);
  assert.equal(strong.intentScore, 1);
  assert.equal(weak.intentScore, 1);
  // A bare category is answered by the work itself, never by the exceptional
  // band reserved for a described request whose independent signals converge.
  assert.ok(strong.matchScore >= 75 && strong.matchScore < 85, `${strong.matchScore}`);
  assert.ok(weak.matchScore < 65, `${weak.matchScore}`);
  assert.ok(strong.matchScore - weak.matchScore >= 15, `${strong.matchScore} vs ${weak.matchScore}`);
  assert.equal(strong.matchScore, publicMatchScore(strong.finalScore));
});

test('strength never substitutes for the request a work does not answer', () => {
  const famousOffIntent = candidate(3, { title: 'Famous Comedy', genreIds: [35],
    overview: 'Une comedie familiale ou tout le monde est heureux.',
    voteAverage: 8.9, voteCount: 120000, popularity: 900 });
  const modestOnIntent = candidate(4, { title: 'Modest Aviation', genreIds: [10752],
    overview: "Des pilotes de chasse et leur aviation militaire pendant le conflit.",
    keywords: ['air force'], voteAverage: 6.2, voteCount: 80, popularity: 2 });
  const famous = score('famous', famousOffIntent, warAviation);
  const modest = score('modest', modestOnIntent, warAviation);
  assert.ok(modest.matchScore >= 45, `${modest.matchScore}`);
  assert.ok(famous.matchScore < 20, `${famous.matchScore}`);
  assert.ok(modest.matchScore > famous.matchScore);
  // Strength cannot lift a work that answers nothing, and coverage alone does not
  // lift a work nobody vouches for: the two factors are both required.
  assert.ok(famous.answerStrengthScore > modest.answerStrengthScore);
});

test('a described request keeps its own works in front of the famous catalogue', () => {
  const famousOffIntent = candidate(5, { title: 'Generic War Blockbuster', genreIds: [10752],
    overview: 'Une fresque de guerre spectaculaire.',
    voteAverage: 8.4, voteCount: 60000, popularity: 700 });
  const onIntent = candidate(6, { title: 'Fighter Squadron', genreIds: [10752],
    overview: "Une escadrille d'avions de combat et son aviation militaire.",
    keywords: ['air force'], voteAverage: 6.8, voteCount: 900, popularity: 8 });
  const ranked = rankSearchCandidates([famousOffIntent, onIntent], warAviation, {}, { telemetry: {}, enabled: true });
  assert.equal(ranked[0].tmdbId, 6);
  assert.ok(ranked[0].ranking.matchScore > ranked[1].ranking.matchScore);
});

test('the strength share follows how much the request describes, never a title', () => {
  const { floor, weights } = ELICINE_RANKING_CONFIG.answerStrength;
  assert.ok(floor.bare < floor.described);
  assert.equal(Number(Object.values(weights).reduce((sum, value) => sum + value, 0).toFixed(6)), 1);
  const bare = scoreSearchCandidate(candidate(7, { title: 'Any', overview: 'Un film.' }), horror, {});
  const described = scoreSearchCandidate(candidate(7, { title: 'Any', overview: 'Un film.' }), warAviation, {});
  // Same candidate, same strength: the bare category keeps less of it than the
  // request that describes its content.
  assert.equal(bare.answerStrengthScore, described.answerStrengthScore);
  assert.ok(bare.finalScore > described.finalScore);
  for (const [name, value] of Object.entries(bare)) {
    if (name === 'matchScore') continue;
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${name}=${value}`);
  }
});

test('the public curve stays monotone, bounded and derived from the computed score', () => {
  const values = Array.from({ length: 101 }, (_, index) => publicMatchScore(index / 100));
  assert.equal(values[0], 0);
  assert.equal(values[100], 99);
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] >= values[index - 1], `not monotone at ${index}`);
  }
  const weak = candidate(8, { title: 'Weak', genreIds: [35], overview: 'Une comedie.',
    voteAverage: 5, voteCount: 3, popularity: 1 });
  const weakScore = scoreSearchCandidate(weak, warAviation, {});
  assert.equal(weakScore.matchScore, publicMatchScore(weakScore.finalScore));
  assert.ok(weakScore.matchScore < 20, `${weakScore.matchScore}`);
});

test('a near-perfect, multi-signal answer reaches the exceptional band', () => {
  const described = intent({ mediaType: 'movie', genres: ['Action', 'Thriller'],
    themes: ['cia', 'russian spy', 'fugitive'], keywords: ['cia', 'spy', 'double agent'],
    moods: ['tense'] });
  const row = {
    id: 27576, media_type: 'movie', title: 'Salt', original_title: 'Salt',
    overview: '', release_date: '2024-01-01', original_language: 'en', genre_ids: [28, 53],
    vote_average: 7.6, vote_count: 9000, popularity: 60
  };
  const proposed = toRetrievalCandidate(row, 'llm_candidates', { sourceRank: 1,
    narrativeCandidateRank: 1,
    narrativeCandidateReason: 'A CIA agent accused of being a Russian spy must flee as a fugitive.' });
  proposed.sources.push('tmdb_person_credits');
  proposed.retrievalSignals.push({ source: 'tmdb_person_credits', personTmdbId: 11701 });
  const resolved = { resolvedPeople: [{ tmdbId: 11701, name: 'Angelina Jolie',
    inputName: 'angelina jolie', resolutionConfidence: 1 }] };
  const scored = scoreSearchCandidate(proposed, described, resolved, {
    queryText: 'un film récent avec Angelina Jolie où une agente de la CIA accusée '
      + 'd’être une espionne russe doit fuir'
  });
  assert.ok(scored.matchScore >= 95 && scored.matchScore <= 99, `${scored.matchScore}`);
  assert.ok(scored.convergenceScore >= 0.8, `${scored.convergenceScore}`);
  assert.ok(scored.entityScore >= 0.8, `${scored.entityScore}`);
  assert.ok(scored.relationScore >= 0.8, `${scored.relationScore}`);
});

test('multiple independent signals clearly beat one signal of comparable strength', () => {
  const described = intent({ mediaType: 'movie', genres: ['Action', 'Thriller'],
    themes: ['cia', 'russian spy', 'fugitive'], keywords: ['cia', 'spy', 'double agent'],
    moods: ['tense'] });
  const strongRow = {
    id: 27576, media_type: 'movie', title: 'Salt', original_title: 'Salt',
    overview: '', release_date: '2024-01-01', original_language: 'en', genre_ids: [28, 53],
    vote_average: 7.6, vote_count: 9000, popularity: 60
  };
  const singleRow = { ...strongRow, id: 2, title: 'Generic Action', original_title: 'Generic Action' };
  const multi = toRetrievalCandidate(strongRow, 'llm_candidates', { sourceRank: 1,
    narrativeCandidateRank: 1,
    narrativeCandidateReason: 'A CIA agent accused of being a Russian spy must flee as a fugitive.' });
  multi.sources.push('tmdb_person_credits');
  multi.retrievalSignals.push({ source: 'tmdb_person_credits', personTmdbId: 11701 });
  const single = toRetrievalCandidate(singleRow, 'tmdb_discover');
  const resolved = { resolvedPeople: [{ tmdbId: 11701, name: 'Angelina Jolie',
    inputName: 'angelina jolie', resolutionConfidence: 1 }] };
  const queryText = 'un film récent avec Angelina Jolie où une agente de la CIA accusée '
    + 'd’être une espionne russe doit fuir';
  const multiScore = scoreSearchCandidate(multi, described, resolved, { queryText });
  const singleScore = scoreSearchCandidate(single, described, resolved, { queryText });
  assert.ok(multiScore.finalScore - singleScore.finalScore >= 0.35,
    `${multiScore.finalScore} vs ${singleScore.finalScore}`);
  assert.ok(multiScore.matchScore - singleScore.matchScore >= 30,
    `${multiScore.matchScore} vs ${singleScore.matchScore}`);
});
