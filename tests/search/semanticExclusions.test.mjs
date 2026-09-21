/**
 * Stated exclusions, end to end (Mission 1/3).
 *
 * A negative clause is part of the intent, not a soft preference: the
 * interpreter writes it as a concept, the orchestrator normalizes it, Discover
 * prunes the provider pool with `without_keywords`, and the strict filter
 * confirms it on the candidate's own metadata. The reported live defect was the
 * opposite: works whose French overview never spells the excluded word
 * (Psychose, American Psycho) went through because the overview was the only
 * local evidence. The keyword channel closes that hole without a provider call
 * per candidate and without naming a single work.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { createRetrievalTelemetry } from '../../src/search/hybridRetriever.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';
import { evaluateStrictConstraints, extractReliableSemanticExclusions, normalizeSemanticExclusions }
  from '../../src/search/strictConstraintFilter.js';

const movie = (id, title, extra = {}) => ({ id, media_type: 'movie', title, overview: '',
  genre_ids: [53], vote_average: 7.5, vote_count: 4000, popularity: 30, ...extra });

test('the live negative clause maps onto its exclusion families', () => {
  assert.deepEqual(extractReliableSemanticExclusions(
    'un thriller psychologique sombre sans meurtre ni enquête policière'), ['murder', 'police_investigation']);
  assert.deepEqual(normalizeSemanticExclusions(['meurtre', 'enquête policière', 'cadavres']),
    ['murder', 'police_investigation']);
  assert.deepEqual(normalizeSemanticExclusions(['voyage dans le temps']), ['time_travel']);
});

test('a silent overview is no longer a blind spot when the keywords name the exclusion', () => {
  const intent = createCanonicalIntent({ mediaType: 'movie',
    semanticExclusions: ['murder', 'police_investigation'] });
  const tagged = movie(1, 'Silent Tag', { constraintData: { keywords: ['murder', 'serial killer'] } });
  const decision = evaluateStrictConstraints(tagged, intent);
  assert.equal(decision.eligible, false);
  assert.ok(decision.rejectedBy.includes('semanticExclusion'));
  const inspector = movie(2, 'Le Doute', { overview: "Un inspecteur mene l'enquete." });
  assert.equal(evaluateStrictConstraints(inspector, intent).eligible, false);
  const bodies = movie(3, 'Les Ombres', { overview: 'Des cadavres sont retrouves sur le port.' });
  assert.equal(evaluateStrictConstraints(bodies, intent).eligible, false);
});

test('an unverifiable candidate is kept, never rejected on missing information', () => {
  const intent = createCanonicalIntent({ mediaType: 'movie', semanticExclusions: ['robots'] });
  const decision = evaluateStrictConstraints(movie(4, 'Unknowable'), intent);
  assert.equal(decision.eligible, true);
  assert.deepEqual(decision.rejectedBy, []);
  assert.ok(decision.unknownConstraints.includes('semanticExclusion'));
});

test('the orchestrated pipeline removes a silent-overview work its keywords confirm as excluded', async () => {
  const telemetry = createRetrievalTelemetry();
  const results = await orchestrateCandidateRetrieval({
    orchestration: {
      canonicalIntent: createCanonicalIntent({ mediaType: 'movie', genres: ['Thriller'],
        themes: ['psychological'], moods: ['dark'], semanticExclusions: ['murder', 'police_investigation'] }),
      resolvedIntentContext: { resolvedPeople: [], resolvedTitles: [], requestedTitles: [] }
    },
    services: {
      discover: async () => [
        movie(901, 'Le Doute Interieur', { popularity: 900, vote_average: 8.4,
          keywords: ['murder', 'detective'] }),
        movie(902, 'Portrait Trouble', { popularity: 40,
          overview: 'Un portrait psychologique sombre sur le deuil et l identite.',
          keywords: ['psychological', 'dark'] })
      ]
    },
    context: { telemetry },
    env: { HYBRID_RETRIEVAL_ENABLED: 'true', STRICT_CONSTRAINT_FILTER_ENABLED: 'true',
      ELICINE_RANKING_ENABLED: 'true', DIVERSIFIED_RANKING_ENABLED: 'true' }
  });
  assert.deepEqual(results.map(candidate => candidate.tmdbId), [902]);
  assert.equal(telemetry.strictFilterAttempted, true);
  assert.ok(telemetry.strictFilterRejectedCount >= 1);
  assert.ok(telemetry.rejectedSemanticExclusion >= 1);
});
