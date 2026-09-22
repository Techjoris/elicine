/**
 * Ranking preferences (relations, comparatives, soft constraints).
 *
 * These behaviours live in the scoring layer only: no provider call, no
 * retrieval change and no per-title rule. A relation is a joint narrative
 * connection, a comparative is read relative to the work the query cites, and a
 * soft preference reorders without ever removing a candidate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { rankSearchCandidates, scoreSearchCandidate } from '../../src/search/searchRanker.js';

const mediaRow = (id, type, { title, year = 2020, overview = '', genreIds = [],
  themes = [], moods = [], keywords = [], voteAverage = 7.4, voteCount = 5000, popularity = 50 }) => ({
  id, media_type: type, title, original_title: title, overview,
  release_date: type === 'movie' ? `${year}-01-01` : undefined,
  first_air_date: type === 'tv' ? `${year}-01-01` : undefined,
  original_language: 'en', genre_ids: genreIds, themes, moods, keywords,
  vote_average: voteAverage, vote_count: voteCount, popularity
});

const candidate = (id, type, options, source = 'tmdb_discover', signal = null) => {
  const built = toRetrievalCandidate(mediaRow(id, type, options), source,
    signal ? { sourceRank: 1, ...signal } : { sourceRank: 1 });
  assert.ok(built, `fixture ${id} is not a valid candidate`);
  return built;
};

const intent = input => createCanonicalIntent(input);

test('narrative relations reward a candidate that connects the requested concepts', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['Science Fiction', 'Thriller'],
    themes: ['shared dreams', 'subconscious'], keywords: ['dream'] });
  const connected = candidate(1, 'movie', {
    title: 'Connected Dream',
    overview: 'A thief enters shared dreams and builds a subconscious world to steal secrets.',
    genreIds: [878, 53]
  });
  const listed = candidate(2, 'movie', {
    title: 'Dream Lecture',
    overview: 'A documentary about dreams. It also studies the subconscious.',
    genreIds: [878, 53]
  });
  const queryText = 'un film où un voleur entre dans les rêves partagés et le subconscient';
  const connectedScore = scoreSearchCandidate(connected, canonical, {}, { queryText });
  const listedScore = scoreSearchCandidate(listed, canonical, {}, { queryText });
  assert.equal(connectedScore.relationScore, 1);
  assert.ok(listedScore.relationScore < connectedScore.relationScore,
    `${listedScore.relationScore} vs ${connectedScore.relationScore}`);
  assert.ok(connectedScore.finalScore > listedScore.finalScore);
  const ranked = rankSearchCandidates([listed, connected], canonical, {}, { telemetry: {}, queryText });
  assert.equal(ranked[0].tmdbId, 1);
});

test('a comparative "more action, more recent" is read relative to the cited work', () => {
  const seed = { tmdbId: 67744, mediaType: 'tv', canonicalTitle: 'Mindhunter',
    originalTitle: 'Mindhunter', genreIds: [80], releaseYear: 2017 };
  const canonical = intent({ mediaType: 'tv', genres: ['Crime'], themes: ['action'],
    knownTitles: ['Mindhunter'] });
  const resolved = { resolvedTitles: [seed], requestedTitles: [], resolvedPeople: [] };
  const recentAction = candidate(1, 'tv', {
    title: 'Recent Action Case', year: 2023, genreIds: [10759, 80],
    overview: 'An action-packed criminal hunt in a modern city.',
    themes: ['action']
  }, 'tmdb_recommendations', { seedTmdbId: 67744 });
  const olderSlow = candidate(2, 'tv', {
    title: 'Slow Case Files', year: 2019, genreIds: [80],
    overview: 'A slow procedural drama about interviews.'
  }, 'tmdb_similar', { seedTmdbId: 67744 });
  const queryText = "une série comme Mindhunter mais plus récente et avec davantage d'action";
  const relevant = scoreSearchCandidate(recentAction, canonical, resolved, { queryText });
  const slow = scoreSearchCandidate(olderSlow, canonical, resolved, { queryText });
  assert.ok(relevant.preferenceScore > slow.preferenceScore,
    `${relevant.preferenceScore} vs ${slow.preferenceScore}`);
  assert.ok(relevant.temporalScore > slow.temporalScore);
  const ranked = rankSearchCandidates([olderSlow, recentAction], canonical, resolved, {
    telemetry: {}, queryText
  });
  assert.equal(ranked[0].tmdbId, 1);
  assert.ok(ranked[0].ranking.matchScore > ranked[1].ranking.matchScore);
});

test('darker and less violent comparatives remain soft and bounded', () => {
  const seed = { tmdbId: 807, mediaType: 'movie', canonicalTitle: 'Se7en',
    originalTitle: 'Se7en', genreIds: [80, 53], releaseYear: 1995 };
  const canonical = intent({ mediaType: 'movie', genres: ['Thriller'], moods: ['dark'],
    knownTitles: ['Se7en'] });
  const resolved = { resolvedTitles: [seed], requestedTitles: [], resolvedPeople: [] };
  const dark = candidate(1, 'movie', {
    title: 'Dark Investigation', overview: 'A dark, grim and oppressive investigation.',
    genreIds: [53], moods: ['dark']
  }, 'tmdb_recommendations', { seedTmdbId: 807 });
  const light = candidate(2, 'movie', {
    title: 'Light Mystery', overview: 'A lighthearted and joyful mystery.',
    genreIds: [53]
  }, 'tmdb_similar', { seedTmdbId: 807 });
  const queryText = 'un thriller comme Se7en mais plus sombre';
  const darkScore = scoreSearchCandidate(dark, canonical, resolved, { queryText });
  const lightScore = scoreSearchCandidate(light, canonical, resolved, { queryText });
  assert.ok(darkScore.preferenceScore > lightScore.preferenceScore,
    `${darkScore.preferenceScore} vs ${lightScore.preferenceScore}`);

  const revengeSeed = { tmdbId: 245891, mediaType: 'movie', canonicalTitle: 'John Wick',
    originalTitle: 'John Wick', genreIds: [28, 80], releaseYear: 2014 };
  const softerIntent = intent({ mediaType: 'movie', genres: ['Action'], knownTitles: ['John Wick'] });
  const softerResolved = { resolvedTitles: [revengeSeed], requestedTitles: [], resolvedPeople: [] };
  const gentle = candidate(3, 'movie', {
    title: 'Gentle Chase', overview: 'An action-packed chase with a family friendly tone.',
    genreIds: [28]
  }, 'tmdb_recommendations', { seedTmdbId: 245891 });
  const brutal = candidate(4, 'movie', {
    title: 'Brutal Chase', overview: 'An action-packed chase with graphic violence and torture.',
    genreIds: [28]
  }, 'tmdb_similar', { seedTmdbId: 245891 });
  const softerQuery = 'un film d’action comme John Wick mais moins violent';
  const gentleScore = scoreSearchCandidate(gentle, softerIntent, softerResolved, { queryText: softerQuery });
  const brutalScore = scoreSearchCandidate(brutal, softerIntent, softerResolved, { queryText: softerQuery });
  assert.ok(gentleScore.preferenceScore > brutalScore.preferenceScore,
    `${gentleScore.preferenceScore} vs ${brutalScore.preferenceScore}`);
  const ranked = rankSearchCandidates([brutal, gentle], softerIntent, softerResolved, {
    telemetry: {}, queryText: softerQuery
  });
  assert.equal(ranked.length, 2, 'a soft preference never filters the pool');
  assert.equal(ranked[0].tmdbId, 3);
});
