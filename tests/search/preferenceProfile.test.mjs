/**
 * User preference profile: what a member keeps asking for and saving, and how
 * much it is allowed to move the proposals of the next searches.
 *
 * The contract is deliberately narrow. With no evidence the engine must behave
 * exactly as before; with evidence, personalisation stays bounded and can never
 * outrank relevance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import { scoreSearchCandidate } from '../../src/search/searchRanker.js';
import {
  emptyPreferenceProfile, genreIdForLabel, mergePreferenceSignal, personalizationBonus,
  personalizationScore, preferenceSignalFromIntent, preferenceSignalFromWork,
  profileStrength, readPreferenceProfile, suggestionsFor, MAX_SIGNALS, PERSONALIZATION_WEIGHT
} from '../../src/search/preferenceProfile.js';

const row = (id, extra = {}) => ({
  id, media_type: 'movie', title: `Work ${id}`, original_title: `Work ${id}`,
  overview: 'A story.', release_date: '2020-01-01', original_language: 'en',
  genre_ids: [28], vote_average: 7, vote_count: 1000, popularity: 20, ...extra
});
const candidate = (id, extra = {}) => toRetrievalCandidate(row(id, extra), 'tmdb_discover');
const intent = input => createCanonicalIntent(input);

test('genre labels of both languages resolve to the same TMDB identifier', () => {
  assert.equal(genreIdForLabel('War'), 10752);
  assert.equal(genreIdForLabel('Guerre'), 10752);
  assert.equal(genreIdForLabel('science-fiction'), 878);
  assert.equal(genreIdForLabel('Science-Fiction'), 878);
  assert.equal(genreIdForLabel('Thriller'), 53);
  assert.equal(genreIdForLabel('inconnu'), null);
});

test('a signal feeds the profile without mutating the previous one', () => {
  const start = emptyPreferenceProfile();
  const after = mergePreferenceSignal(start, { kind: 'search', genres: ['28', '53'], moods: ['dark'], mediaType: 'movie' });
  assert.deepEqual(start, emptyPreferenceProfile(), 'le profil de départ ne doit pas être modifié');
  assert.equal(after.signals, 1);
  assert.equal(after.searches, 1);
  assert.equal(after.genres['28'], 1);
  assert.equal(after.mediaTypes.movie, 0.5);
});

test('saving a work weighs more than searching for it', () => {
  const searched = mergePreferenceSignal(emptyPreferenceProfile(), { kind: 'search', genres: ['28'] });
  const saved = mergePreferenceSignal(emptyPreferenceProfile(), { kind: 'watchlist', genres: ['28'] });
  const alerted = mergePreferenceSignal(emptyPreferenceProfile(), { kind: 'alert', genres: ['28'] });
  assert.ok(saved.genres['28'] > alerted.genres['28']);
  assert.ok(alerted.genres['28'] > searched.genres['28']);
  // A save is never counted as a search.
  assert.equal(saved.searches, 0);
});

test('repeating a taste strengthens it, and older tastes fade', () => {
  let profile = emptyPreferenceProfile();
  for (let index = 0; index < 5; index += 1) profile = mergePreferenceSignal(profile, { kind: 'search', genres: ['28'] });
  const actionWeight = profile.genres['28'];
  profile = mergePreferenceSignal(profile, { kind: 'search', genres: ['35'] });
  assert.ok(profile.genres['35'] > profile.genres['28'] * 0.2, 'la nouvelle préférence doit compter');
  assert.ok(profile.genres['28'] < actionWeight, "l'ancienne préférence doit reculer");
});

test('the profile strength saturates instead of growing without end', () => {
  assert.equal(profileStrength(emptyPreferenceProfile()), 0);
  let profile = emptyPreferenceProfile();
  for (let index = 0; index < MAX_SIGNALS; index += 1) profile = mergePreferenceSignal(profile, { kind: 'search', genres: ['28'] });
  assert.equal(profileStrength(profile), 1);
  const beyond = mergePreferenceSignal(profile, { kind: 'search', genres: ['28'] });
  assert.equal(profileStrength(beyond), 1);
});

test('an empty or malformed profile never personalises anything', () => {
  const work = candidate(1, { genre_ids: [28], original_language: 'en' });
  assert.equal(personalizationScore(work, null), 0);
  assert.equal(personalizationScore(work, emptyPreferenceProfile()), 0);
  assert.equal(personalizationBonus(work, undefined), 0);
  assert.deepEqual(readPreferenceProfile('pas du json'), emptyPreferenceProfile());
  assert.deepEqual(readPreferenceProfile({ genres: 'texte', signals: -3 }), emptyPreferenceProfile());
});

test('a work matching the recorded tastes scores higher than one that ignores them', () => {
  let profile = emptyPreferenceProfile();
  for (let index = 0; index < 12; index += 1) profile = mergePreferenceSignal(profile, { kind: 'watchlist', genres: ['10752'], mediaType: 'movie' });

  const matching = candidate(2, { genre_ids: [10752], original_language: 'en' });
  const unrelated = candidate(3, { genre_ids: [35], original_language: 'en' });
  assert.ok(personalizationScore(matching, profile) > personalizationScore(unrelated, profile));
  assert.ok(personalizationBonus(matching, profile) > 0);
  assert.ok(personalizationBonus(matching, profile) <= 0.05, 'la personnalisation reste bornée');
});

test('without a profile the ranking is exactly the historical one', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['War'], themes: ['military aviation'] });
  const work = candidate(4, { genre_ids: [10752], overview: "Des pilotes de chasse et leur aviation militaire." });
  const withoutOption = scoreSearchCandidate(work, canonical, {});
  const withNull = scoreSearchCandidate(work, canonical, {}, { userProfile: null });
  const withEmpty = scoreSearchCandidate(work, canonical, {}, { userProfile: emptyPreferenceProfile() });
  assert.deepEqual(withNull, withoutOption);
  assert.deepEqual(withEmpty, withoutOption);
});

test('with a profile, the ranking moves only within its bounded share', () => {
  const canonical = intent({ mediaType: 'movie', genres: ['War'], themes: ['military aviation'] });
  const work = candidate(5, { genre_ids: [10752], overview: "Des pilotes de chasse et leur aviation militaire." });
  const plain = scoreSearchCandidate(work, canonical, {});
  let profile = emptyPreferenceProfile();
  for (let index = 0; index < MAX_SIGNALS; index += 1) profile = mergePreferenceSignal(profile, { kind: 'watchlist', genres: ['10752'] });
  const personalised = scoreSearchCandidate(work, canonical, {}, { userProfile: profile });
  assert.ok(personalised.finalScore >= plain.finalScore);
  assert.ok(personalised.personalizationBonus <= PERSONALIZATION_WEIGHT, `${personalised.personalizationBonus}`);
  assert.ok(personalised.finalScore - plain.finalScore <= PERSONALIZATION_WEIGHT + 1e-9,
    `${personalised.finalScore} vs ${plain.finalScore}`);
  assert.ok(personalised.matchScore >= plain.matchScore, "l'ordre affiché ne doit jamais contredire le classement");
});

test('the search signal carries the intent in a storable shape', () => {
  const signal = preferenceSignalFromIntent(intent({
    mediaType: 'movie', genres: ['Guerre', 'Action'], moods: ['sombre'], languages: ['fr']
  }), { mediaType: 'movie' });
  assert.deepEqual(signal.genres, ['10752', '28']);
  assert.deepEqual(signal.moods, ['sombre']);
  assert.deepEqual(signal.languages, ['fr']);
  assert.equal(signal.kind, 'search');
});

test('a saved work carries its own identifiers, never a title', () => {
  const signal = preferenceSignalFromWork({
    genreIds: [53, 80], mediaType: 'tv', originalLanguage: 'en',
    constraintData: { themes: ['enquête'], moods: ['sombre'] }
  }, { kind: 'alert' });
  assert.deepEqual(signal.genres, ['53', '80']);
  assert.equal(signal.mediaType, 'tv');
  assert.equal(signal.kind, 'alert');
  assert.equal(JSON.stringify(signal).includes('Work'), false);
});

test('inspirations follow the recorded tastes, and stay generic when there are none', () => {
  const fallback = ['Un thriller psychologique avec un twist final'];
  assert.deepEqual(suggestionsFor(emptyPreferenceProfile(), fallback), fallback);
  assert.deepEqual(suggestionsFor(null, fallback), fallback);

  let profile = emptyPreferenceProfile();
  for (let index = 0; index < MAX_SIGNALS; index += 1) profile = mergePreferenceSignal(profile, { kind: 'search', genres: ['53', '80'] });
  const suggestions = suggestionsFor(profile, fallback);
  assert.ok(suggestions.length > 0 && suggestions.length <= 3);
  assert.notDeepEqual(suggestions, fallback);
  assert.ok(suggestions.every(item => typeof item === 'string' && item.length > 10));
  assert.ok(suggestions.some(item => /polar|thriller|polici/i.test(item)), suggestions.join(' | '));
});

test('a member who watches series is offered series wording', () => {
  let profile = emptyPreferenceProfile();
  for (let index = 0; index < MAX_SIGNALS; index += 1) profile = mergePreferenceSignal(profile, { kind: 'search', genres: ['53'], mediaType: 'tv' });
  const suggestions = suggestionsFor(profile, []);
  assert.ok(suggestions.some(item => /série/i.test(item)), suggestions.join(' | '));
});
