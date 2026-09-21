import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntentFromLegacy } from '../../src/search/canonicalIntentShadow.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import { toLegacyRankingCandidate, toRetrievalCandidate } from '../../src/search/retrievalCandidate.js';
import {
  evaluateStrictConstraints, extractReliableSemanticExclusions, filterStrictCandidates,
  isStrictConstraintFilterEnabled, STRICT_CONSTRAINT_FILTER_FLAG
} from '../../src/search/strictConstraintFilter.js';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';

const row = (id, type = 'movie', extra = {}) => ({
  id, media_type: type, title: `Title ${id}`, original_title: `Original ${id}`,
  overview: 'A grounded character study.', genre_ids: [18],
  release_date: type === 'movie' ? '2020-01-01' : undefined,
  first_air_date: type === 'tv' ? '2020-01-01' : undefined,
  original_language: 'en', ...extra
});
const candidate = (id, type = 'movie', extra = {}, source = 'legacy') =>
  toRetrievalCandidate(row(id, type, extra), source);
const intent = input => createCanonicalIntent(input);
const enabled = { [STRICT_CONSTRAINT_FILTER_FLAG]: 'true' };

test('reliable negative clauses create only allowlisted semantic exclusions', () => {
  const cases = [
    ['un thriller psychologique sombre sans meurtre ni enquête policière', ['murder', 'police_investigation']],
    ['un film comme Arrival mais sans voyage spatial', ['space_travel']],
    ['une série médiévale réaliste sans magie ni créatures fantastiques', ['magic', 'fantasy_creatures']],
    ['un film d’horreur des années 90 sans monstres, fantômes ni surnaturel', ['supernatural', 'monsters', 'ghosts']],
    ['une série politique américaine sans science-fiction ni comédie', ['science_fiction', 'comedy']],
    ['une science-fiction sans espace, robots, extraterrestres ni voyage dans le temps', ['aliens', 'space', 'robots', 'time_travel']]
  ];
  for (const [query, expected] of cases) assert.deepEqual(new Set(extractReliableSemanticExclusions(query)), new Set(expected));
  assert.deepEqual(extractReliableSemanticExclusions('une comédie légère sans prise de tête'), []);
  assert.deepEqual(extractReliableSemanticExclusions('un meurtre mystérieux'), []);
});

test('semantic exclusions survive legacy adaptation into CanonicalIntent', () => {
  const canonical = createCanonicalIntentFromLegacy({ media_type: 'movie', primary_genres: ['Thriller'], mood_tags: [] },
    { userQuery: 'un thriller psychologique sombre sans meurtre ni enquête policière' });
  assert.deepEqual(canonical.semanticExclusions, ['murder', 'police_investigation']);
});

test('an explicit exclusion survives a provider that omitted it', () => {
  const canonical = createCanonicalIntentFromLegacy({ media_type: 'movie', primary_genres: ['Thriller'],
    mood_tags: [], semantic_exclusions: [] },
  { userQuery: 'un thriller psychologique sombre sans meurtre ni enquête policière' });
  assert.deepEqual(new Set(canonical.semanticExclusions), new Set(['murder', 'police_investigation']));
  const filtered = filterStrictCandidates([candidate(1, 'movie', { overview: 'A murder investigation.' }),
    candidate(2, 'movie', { overview: 'A dark psychological story.' })], canonical, { enabled: true });
  assert.deepEqual(filtered.candidates.map(item => item.tmdbId), [2]);
});

test('media type is hard for every source and cannot be bypassed by fallback', () => {
  const canonical = intent({ mediaType: 'tv', genres: ['War'], themes: ['guerre moderne', 'avions de combat'] });
  const sources = ['tmdb_discover', 'tmdb_search', 'supabase_lexical', 'supabase_vector', 'legacy', 'fallback'];
  const pool = sources.flatMap((source, index) => [candidate(index * 2 + 1, 'movie', {}, source),
    candidate(index * 2 + 2, 'tv', {}, source)]);
  const result = filterStrictCandidates(pool, canonical, { enabled: true });
  assert.equal(result.candidates.length, sources.length);
  assert.ok(result.candidates.every(item => item.mediaType === 'tv'));
  assert.equal(result.decisions.filter(item => item.decision.rejectedBy.includes('mediaType')).length, sources.length);
  const fallback = filterStrictCandidates([candidate(99, 'movie', {}, 'fallback')], canonical, { enabled: true });
  assert.deepEqual(fallback.candidates, []);
});

test('critical modern-war fighter-aircraft series keeps zero movies in the canonical pool', async () => {
  const telemetry = {};
  const canonical = intent({ mediaType: 'tv', genres: ['War'], themes: ['guerre moderne', 'avions de combat'] });
  const pool = await orchestrateCandidateRetrieval({
    orchestration: { canonicalIntent: canonical, resolvedIntentContext: {} },
    services: { legacy: async () => [row(1, 'movie'), row(2, 'tv')] },
    context: { telemetry }, env: enabled
  });
  assert.equal(pool.length, 1);
  assert.ok(pool.every(item => item.mediaType === 'tv'));
  assert.equal(telemetry.strictFilterAttempted, true);
});

test('psychological thriller excludes murder/investigation fixtures without title hardcoding', () => {
  const canonical = createCanonicalIntentFromLegacy({ media_type: 'movie', primary_genres: ['Thriller'], mood_tags: ['dark'] },
    { userQuery: 'un thriller psychologique sombre sans meurtre ni enquête policière' });
  const fixtures = [
    candidate(1, 'movie', { title: 'Psychose', overview: 'A motel story involving murder.' }),
    candidate(2, 'movie', { title: 'Shining', overview: 'Isolation, madness and murder consume a family.' }),
    candidate(3, 'movie', { title: 'The Quiet Mind', overview: 'A dark psychological portrait of grief and identity.' })
  ];
  const result = filterStrictCandidates(fixtures, canonical, { enabled: true });
  assert.deepEqual(result.candidates.map(item => item.tmdbId), [3]);
  assert.ok(result.decisions.slice(0, 2).every(item => item.decision.rejectedBy.includes('semanticExclusion')));
  assert.equal(result.decisions[2].decision.eligible, true);
});

test('excluded titles match TMDB ID, canonical, original and normalized title', () => {
  const byName = evaluateStrictConstraints(candidate(1, 'movie', { title: 'Amélie', original_title: 'Le Fabuleux Destin d’Amélie Poulain' }),
    intent({ excludedTitles: ['amelie'] }));
  const byOriginal = evaluateStrictConstraints(candidate(2, 'movie', { title: 'Localized', original_title: 'The Original Title' }),
    intent({ excludedTitles: ['the original title'] }));
  const byId = evaluateStrictConstraints(candidate(42), intent(), { resolvedExcludedTitles: [{ tmdbId: 42 }] });
  assert.ok(byName.rejectedBy.includes('excludedTitle'));
  assert.ok(byOriginal.rejectedBy.includes('excludedTitle'));
  assert.ok(byId.rejectedBy.includes('excludedTitle'));
});

test('excluded genres prefer typed TMDB IDs and unknown genre data stays admissible', () => {
  const canonical = intent({ mediaType: 'movie', excludedGenres: ['Science Fiction'] });
  assert.ok(evaluateStrictConstraints(candidate(1, 'movie', { genre_ids: [878] }), canonical).rejectedBy.includes('excludedGenre'));
  const unknown = evaluateStrictConstraints(candidate(2, 'movie', { genre_ids: [] }), canonical);
  assert.equal(unknown.eligible, true);
  assert.ok(unknown.unknownConstraints.includes('excludedGenre'));
});

test('Arrival-like request excludes space travel but preserves a grounded linguistic story', () => {
  const canonical = intent({ semanticExclusions: extractReliableSemanticExclusions('un film comme Arrival mais sans voyage spatial') });
  const result = filterStrictCandidates([
    candidate(1, 'movie', { overview: 'An interstellar space travel mission.' }),
    candidate(2, 'movie', { overview: 'A linguist deciphers an unknown language on Earth.' })
  ], canonical, { enabled: true });
  assert.deepEqual(result.candidates.map(item => item.tmdbId), [2]);
});

test('realistic medieval series excludes magic and fantasy creatures without false rejection', () => {
  const canonical = intent({ mediaType: 'tv', semanticExclusions: extractReliableSemanticExclusions(
    'une série médiévale réaliste sans magie ni créatures fantastiques') });
  const result = filterStrictCandidates([
    candidate(1, 'tv', { overview: 'Magic and fantasy creatures shape the kingdom.' }),
    candidate(2, 'tv', { overview: 'A grounded struggle between medieval dynasties.' })
  ], canonical, { enabled: true });
  assert.deepEqual(result.candidates.map(item => item.tmdbId), [2]);
});

test('1990s horror excludes monsters, ghosts and supernatural while enforcing years', () => {
  const canonical = intent({ yearMin: 1990, yearMax: 1999, semanticExclusions: extractReliableSemanticExclusions(
    'un film d’horreur des années 90 sans monstres, fantômes ni surnaturel') });
  const result = filterStrictCandidates([
    candidate(1, 'movie', { release_date: '1995-01-01', overview: 'A ghost haunts a house.' }),
    candidate(2, 'movie', { release_date: '1997-01-01', overview: 'A tense human home invasion.' }),
    candidate(3, 'movie', { release_date: '2001-01-01', overview: 'A tense human home invasion.' })
  ], canonical, { enabled: true });
  assert.deepEqual(result.candidates.map(item => item.tmdbId), [2]);
  assert.ok(result.decisions[2].decision.rejectedBy.includes('yearRange'));
});

test('American political series excludes science-fiction and comedy using genre IDs', () => {
  const canonical = intent({ mediaType: 'tv', countries: ['US'], semanticExclusions: extractReliableSemanticExclusions(
    'une série politique américaine sans science-fiction ni comédie') });
  const result = filterStrictCandidates([
    candidate(1, 'tv', { genre_ids: [10765], origin_country: ['US'] }),
    candidate(2, 'tv', { genre_ids: [35], origin_country: ['US'] }),
    candidate(3, 'tv', { genre_ids: [18], origin_country: ['US'], overview: 'A political drama.' })
  ], canonical, { enabled: true });
  assert.deepEqual(result.candidates.map(item => item.tmdbId), [3]);
});

test('science-fiction request can exclude space, robots, aliens and time travel', () => {
  const canonical = intent({ genres: ['Science Fiction'], semanticExclusions: extractReliableSemanticExclusions(
    'une science-fiction sans espace, robots, extraterrestres ni voyage dans le temps') });
  const result = filterStrictCandidates([
    candidate(1, 'movie', { genre_ids: [878], overview: 'A colony exists in space.' }),
    candidate(2, 'movie', { genre_ids: [878], overview: 'A grounded social dystopia about memory.' })
  ], canonical, { enabled: true });
  assert.deepEqual(result.candidates.map(item => item.tmdbId), [2]);
});

test('Korean thriller enforces 2015–2022 language/country and preserves missing country as unknown', () => {
  const canonical = intent({ yearMin: 2015, yearMax: 2022, languages: ['ko'], countries: ['KR'] });
  const fixtures = [
    candidate(1, 'movie', { release_date: '2019-01-01', original_language: 'ko', production_countries: [{ iso_3166_1: 'KR' }] }),
    candidate(2, 'movie', { release_date: '2010-01-01', original_language: 'ko', production_countries: [{ iso_3166_1: 'KR' }] }),
    candidate(3, 'movie', { release_date: '2020-01-01', original_language: 'en', production_countries: [{ iso_3166_1: 'US' }] }),
    candidate(4, 'movie', { release_date: '2021-01-01', original_language: 'ko' })
  ];
  const result = filterStrictCandidates(fixtures, canonical, { enabled: true });
  assert.deepEqual(result.candidates.map(item => item.tmdbId), [1, 4]);
  assert.ok(result.decisions[3].decision.unknownConstraints.includes('country'));
});

test('French comedy after 2020 applies known runtime and keeps unknown runtime', () => {
  const canonical = intent({ yearMin: 2021, runtimeMax: 105, languages: ['fr'], countries: ['FR'] });
  const fixtures = [
    candidate(1, 'movie', { release_date: '2022-01-01', runtime: 100, original_language: 'fr', production_countries: [{ iso_3166_1: 'FR' }] }),
    candidate(2, 'movie', { release_date: '2022-01-01', runtime: 120, original_language: 'fr', production_countries: [{ iso_3166_1: 'FR' }] }),
    candidate(3, 'movie', { release_date: '2023-01-01', original_language: 'fr', production_countries: [{ iso_3166_1: 'FR' }] })
  ];
  const result = filterStrictCandidates(fixtures, canonical, { enabled: true });
  assert.deepEqual(result.candidates.map(item => item.tmdbId), [1, 3]);
  assert.ok(result.decisions[2].decision.unknownConstraints.includes('runtimeRange'));
});

test('adult mismatch is rejected while missing constraint data is retained and counted unknown', () => {
  const canonical = intent({ adult: false, yearMin: 2020, runtimeMin: 80, languages: ['fr'], countries: ['FR'] });
  const rejected = evaluateStrictConstraints(candidate(1, 'movie', { adult: true }), canonical);
  const unknown = evaluateStrictConstraints(candidate(2, 'movie', { release_date: undefined, original_language: undefined }), canonical);
  assert.ok(rejected.rejectedBy.includes('adult'));
  assert.equal(unknown.eligible, true);
  assert.deepEqual(new Set(unknown.unknownConstraints), new Set(['yearRange', 'runtimeRange', 'language', 'country', 'adult']));
});

test('unrelated genre IDs cannot turn missing semantic evidence into a known absence', () => {
  const decision = evaluateStrictConstraints(candidate(1, 'movie', { genre_ids: [18], overview: '' }),
    intent({ semanticExclusions: ['murder'] }));
  assert.equal(decision.eligible, true);
  assert.ok(decision.unknownConstraints.includes('semanticExclusion'));
});

test('telemetry aggregates counts without logging query or decisions', () => {
  const telemetry = {};
  const canonical = intent({ mediaType: 'movie', yearMin: 2020, excludedGenres: ['Romance'], semanticExclusions: ['murder'] });
  filterStrictCandidates([
    candidate(1, 'tv'),
    candidate(2, 'movie', { release_date: '2010-01-01' }),
    candidate(3, 'movie', { genre_ids: [10749] }),
    candidate(4, 'movie', { overview: 'A murder story.' }),
    candidate(5, 'movie', { release_date: undefined, genre_ids: [], overview: '' })
  ], canonical, { telemetry, enabled: true });
  assert.deepEqual(telemetry, {
    strictFilterAttempted: true, strictFilterInputCount: 5, strictFilterOutputCount: 1,
    strictFilterRejectedCount: 4, strictFilterUnknownCount: 2,
    rejectedMediaType: 1, rejectedYear: 1, rejectedGenre: 1, rejectedTitle: 0,
    rejectedSemanticExclusion: 1
  });
});

test('flag rollback preserves the exact pool; unconstrained filtering preserves order', () => {
  const pool = [candidate(2), candidate(1)];
  assert.equal(isStrictConstraintFilterEnabled({}), true);
  assert.equal(isStrictConstraintFilterEnabled(enabled), true);
  assert.equal(isStrictConstraintFilterEnabled({ [STRICT_CONSTRAINT_FILTER_FLAG]: 'false' }), false);
  assert.equal(filterStrictCandidates(pool, intent({ yearMin: 2030 }), { enabled: false }).candidates, pool);
  assert.deepEqual(filterStrictCandidates(pool, intent(), { enabled: true }).candidates, pool);
});

test('constraint internals never enter the historical ranking/public adapter', () => {
  const value = toLegacyRankingCandidate(candidate(1, 'movie', { runtime: 90, origin_country: ['FR'] }));
  assert.equal(value.constraintData, undefined);
  assert.equal(value.constraintDecision, undefined);
});
