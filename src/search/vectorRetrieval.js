import { candidateMediaType } from './retrievalCandidate.js';

export const VECTOR_RETRIEVAL_FLAG = 'VECTOR_RETRIEVAL_ENABLED';
export const VECTOR_EMBEDDING_MODEL = 'text-embedding-3-small';
export const VECTOR_EMBEDDING_DIMENSION = 1024;
export const VECTOR_EMBEDDING_VERSION = 'text-embedding-3-small:1024:v1';
export const VECTOR_MATCH_LIMIT = 20;
export const VECTOR_MATCH_THRESHOLD = 0.40;

export function isVectorRetrievalEnabled(env = process.env) {
  // Phase 6 is the validated default; explicit false is the operational rollback.
  return String(env?.[VECTOR_RETRIEVAL_FLAG] ?? 'true').toLowerCase() !== 'false';
}

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const list = value => [...new Set((Array.isArray(value) ? value : [])
  .map(item => clean(typeof item === 'object' ? item?.name ?? item?.id : item)).filter(Boolean))];

/** Stable query representation made only from CanonicalIntent, never the raw query. */
export function buildVectorQueryText(intent = {}) {
  const parts = [
    ['media_type', clean(intent.mediaType)], ['genres', list(intent.genres).join(', ')],
    ['moods', list(intent.moods).join(', ')], ['themes', list(intent.themes).join(', ')],
    ['keywords', list(intent.keywords).join(', ')], ['references', list(intent.knownTitles).join(', ')],
    ['languages', list(intent.languages).join(', ')], ['countries', list(intent.countries).join(', ')],
    ['year_min', intent.yearMin], ['year_max', intent.yearMax],
    ['runtime_min', intent.runtimeMin], ['runtime_max', intent.runtimeMax], ['min_rating', intent.minRating]
  ];
  return parts.filter(([, value]) => value !== null && value !== undefined && clean(value))
    .map(([label, value]) => `${label}: ${clean(value)}`).join('\n');
}

/** Stable profile text shared by the reindexer for both movies and TV series. */
export function buildMediaIndexText(media = {}) {
  const type = candidateMediaType(media, media.mediaType) || clean(media.mediaType);
  const parts = [
    ['media_type', type], ['title', media.title || media.name],
    ['original_title', media.originalTitle || media.original_title || media.original_name],
    ['overview', media.overview], ['tagline', media.tagline],
    ['genres', list(media.genreIds || media.genre_ids || media.genres).join(', ')],
    ['keywords', list(media.keywords).join(', ')], ['themes', list(media.themes).join(', ')],
    ['moods', list(media.moods).join(', ')], ['setting', media.setting],
    ['release_date', media.releaseDate || media.release_date || media.firstAirDate || media.first_air_date],
    ['original_language', media.originalLanguage || media.original_language]
  ];
  return parts.filter(([, value]) => clean(value)).map(([label, value]) => `${label}: ${clean(value)}`).join('\n');
}

export function validateEmbedding(vector, dimension = VECTOR_EMBEDDING_DIMENSION) {
  if (!Array.isArray(vector) || vector.length !== dimension || vector.some(value => !Number.isFinite(value))) {
    throw new Error('EMBEDDING_DIMENSION_MISMATCH');
  }
  return vector;
}

/** OpenAI-compatible transport. The canonical model is always requested at 1024D. */
export function createEmbeddingClient({
  apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '',
  endpoint = process.env.EMBEDDING_MODEL_URL || 'https://api.openai.com/v1/embeddings',
  model = process.env.EMBEDDING_MODEL || VECTOR_EMBEDDING_MODEL,
  configuredDimension = process.env.EMBEDDING_DIMENSION || VECTOR_EMBEDDING_DIMENSION,
  fetchImpl = globalThis.fetch
} = {}) {
  return {
    async embed(input, { signal } = {}) {
      if (Number(configuredDimension) !== VECTOR_EMBEDDING_DIMENSION || model !== VECTOR_EMBEDDING_MODEL) {
        throw new Error('EMBEDDING_CONFIGURATION_MISMATCH');
      }
      if (!apiKey || typeof fetchImpl !== 'function') throw new Error('EMBEDDING_UNAVAILABLE');
      const response = await fetchImpl(endpoint, {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input, dimensions: VECTOR_EMBEDDING_DIMENSION, encoding_format: 'float' })
      });
      if (!response.ok) throw new Error('EMBEDDING_PROVIDER_FAILED');
      const payload = await response.json();
      const vectors = (payload?.data || []).sort((a, b) => Number(a.index) - Number(b.index))
        .map(item => validateEmbedding(item?.embedding));
      const expected = Array.isArray(input) ? input.length : 1;
      if (vectors.length !== expected) throw new Error('EMBEDDING_INVALID_RESPONSE');
      return Array.isArray(input) ? vectors : vectors[0];
    }
  };
}

/** Request-scoped memoization guarantees at most one query embedding. */
export function createQueryEmbeddingService({ client, telemetry = {} } = {}) {
  let promise = null;
  return {
    get(intent, options = {}) {
      if (promise) return promise;
      const text = buildVectorQueryText(intent);
      if (!text) return Promise.resolve(null);
      const startedAt = Date.now();
      promise = Promise.resolve().then(() => client.embed(text, options)).finally(() => {
        telemetry.embeddingDurationMs = Date.now() - startedAt;
      });
      return promise;
    }
  };
}

const fixedEmbeddingError = error => {
  if (['EMBEDDING_DIMENSION_MISMATCH', 'EMBEDDING_CONFIGURATION_MISMATCH'].includes(error?.message)) {
    return error.message;
  }
  return 'EMBEDDING_FAILED';
};

/** Injectable Supabase RPC adapter used as one Phase 5 retrieval source. */
export function createSupabaseVectorSource({
  client, queryEmbedding, telemetry = {}, limit = VECTOR_MATCH_LIMIT,
  threshold = VECTOR_MATCH_THRESHOLD, embeddingVersion = VECTOR_EMBEDDING_VERSION
} = {}) {
  if (!client || !queryEmbedding) return null;
  return async (intent, { signal } = {}) => {
    const startedAt = Date.now();
    Object.assign(telemetry, { vectorRetrievalAttempted: true, vectorRetrievalSucceeded: false,
      vectorRetrievalCandidateCount: 0, vectorRetrievalError: null });
    try {
      let vector;
      try {
        vector = await queryEmbedding.get(intent, { signal });
        if (!vector) {
          Object.assign(telemetry, { vectorRetrievalSucceeded: true,
            vectorRetrievalCandidateCount: 0, vectorRetrievalError: null });
          return [];
        }
        validateEmbedding(vector);
      } catch (error) {
        telemetry.vectorRetrievalError = fixedEmbeddingError(error);
        throw error;
      }
      let request = client.rpc('match_media', {
        query_embedding: vector,
        match_media_type: intent.mediaType || null,
        match_limit: Math.max(1, Math.min(VECTOR_MATCH_LIMIT, Number(limit) || VECTOR_MATCH_LIMIT)),
        match_threshold: Number(threshold),
        match_embedding_version: embeddingVersion
      });
      if (signal && typeof request?.abortSignal === 'function') request = request.abortSignal(signal);
      const { data, error } = await request;
      if (error) {
        telemetry.vectorRetrievalError = 'VECTOR_RPC_FAILED';
        throw new Error('VECTOR_RPC_FAILED');
      }
      const rows = (Array.isArray(data) ? data : []).filter(row => {
        const type = candidateMediaType(row);
        return type && (!intent.mediaType || type === intent.mediaType);
      });
      Object.assign(telemetry, { vectorRetrievalSucceeded: true,
        vectorRetrievalCandidateCount: rows.length, vectorRetrievalError: null });
      return rows;
    } catch (error) {
      if (!telemetry.vectorRetrievalError) telemetry.vectorRetrievalError = 'VECTOR_RETRIEVAL_FAILED';
      throw error;
    } finally {
      telemetry.vectorRetrievalDurationMs = Date.now() - startedAt;
    }
  };
}
