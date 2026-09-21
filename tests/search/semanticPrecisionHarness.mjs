/**
 * Fixture harness for the semantic precision corpus (Mission 1/3).
 *
 * The corpus replays the real pipeline locally - hybrid retrieval, strict
 * constraints, ranking, diversification, dynamic budget - on fixtures only, so
 * a semantic regression is caught without any provider call. Each fixture is
 * served by the retrieval source it declares, so the source confidence and the
 * retrieval signals the ranking consumes are the ones a live pool would carry
 * instead of one synthetic source shared by every case.
 *
 * The quality test (`semanticPrecision.test.mjs`) and the generalization
 * benchmark (`scripts/search-benchmark.mjs`) both run through this harness, so
 * the measured numbers and the asserted thresholds can never diverge.
 */
import corpus from './semantic-precision-corpus.json' with { type: 'json' };
import { createCanonicalIntent } from '../../src/types/canonicalIntent.runtime.js';
import { createRetrievalTelemetry } from '../../src/search/hybridRetriever.js';
import { orchestrateCandidateRetrieval } from '../../src/search/searchOrchestrator.js';

export const SEMANTIC_PRECISION_ENV = Object.freeze({
  HYBRID_RETRIEVAL_ENABLED: 'true', STRICT_CONSTRAINT_FILTER_ENABLED: 'true',
  ELICINE_RANKING_ENABLED: 'true', DIVERSIFIED_RANKING_ENABLED: 'true'
});

export const semanticPrecisionCorpus = corpus;
export const semanticPrecisionSet = name => corpus.filter(entry => entry.set === name);

function row(candidate) {
  const date = `${Number.isInteger(candidate.year) ? candidate.year : 2020}-01-01`;
  return {
    id: candidate.id, media_type: candidate.mediaType, title: candidate.title,
    original_title: candidate.title, overview: candidate.overview || '',
    release_date: candidate.mediaType === 'movie' ? date : undefined,
    first_air_date: candidate.mediaType === 'tv' ? date : undefined,
    original_language: candidate.originalLanguage || 'en',
    genre_ids: candidate.genreIds || [], themes: candidate.themes || [], moods: candidate.moods || [],
    vote_average: candidate.voteAverage ?? 0, vote_count: candidate.voteCount ?? 0,
    popularity: candidate.popularity ?? 0,
    ...(Number.isFinite(Number(candidate.similarity)) ? { similarity: Number(candidate.similarity) } : {})
  };
}

const rowsFor = candidates => candidates.map(row);
const namedPerson = (personId, type) => candidate =>
  Number(candidate.personTmdbId) === Number(personId) && candidate.mediaType === type;
const namedSeed = seed => candidate =>
  Number(candidate.seedTmdbId) === Number(seed.tmdbId) && candidate.mediaType === seed.mediaType;

function servicesFor(entry) {
  const groups = new Map();
  for (const candidate of entry.candidates)
    for (const source of candidate.sources || ['legacy']) {
      if (!groups.has(source)) groups.set(source, []);
      groups.get(source).push(candidate);
    }
  const services = {};
  for (const [source, candidates] of groups) {
    if (source === 'tmdb_person_credits')
      services.personCredits = async (personId, type) => rowsFor(candidates.filter(namedPerson(personId, type)));
    else if (source === 'tmdb_similar')
      services.similar = async seed => rowsFor(candidates.filter(namedSeed(seed)));
    else if (source === 'tmdb_recommendations')
      services.recommendations = async seed => rowsFor(candidates.filter(namedSeed(seed)));
    else if (source === 'tmdb_search') services.search = async () => rowsFor(candidates);
    else if (source === 'tmdb_discover')
      services.discover = async type => rowsFor(candidates.filter(candidate => candidate.mediaType === type));
    else if (source === 'supabase_vector') services.vector = async () => rowsFor(candidates);
    else if (source === 'supabase_lexical') services.lexical = async () => rowsFor(candidates);
    else if (source === 'legacy') services.legacy = async () => rowsFor(candidates);
  }
  return services;
}

/** One corpus case, replayed through the real orchestration without any I/O. */
export async function replaySemanticPrecisionCase(entry) {
  const results = await orchestrateCandidateRetrieval({
    orchestration: {
      canonicalIntent: createCanonicalIntent(entry.intent),
      resolvedIntentContext: {
        resolvedPeople: entry.resolvedPeople || [],
        resolvedTitles: entry.resolvedTitles || [],
        requestedTitles: []
      }
    },
    services: servicesFor(entry),
    context: { telemetry: createRetrievalTelemetry() },
    env: SEMANTIC_PRECISION_ENV
  });
  return { id: entry.id, set: entry.set, query: entry.query,
    results: Array.isArray(results) ? results : [], expected: entry.expected };
}