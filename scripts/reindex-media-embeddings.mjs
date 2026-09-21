import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { buildMediaIndexText, createEmbeddingClient, validateEmbedding,
  VECTOR_EMBEDDING_VERSION } from '../src/search/vectorRetrieval.js';
import { candidateMediaType } from '../src/search/retrievalCandidate.js';

const numberArg = (value, fallback, max) => Math.max(1, Math.min(max, Number.parseInt(value, 10) || fallback));
export function parseReindexArgs(argv = []) {
  const values = Object.fromEntries(argv.filter(arg => arg.startsWith('--') && arg.includes('='))
    .map(arg => arg.slice(2).split(/=(.*)/s, 2)));
  return {
    apply: argv.includes('--apply'), input: values.input || null,
    sourceTable: values['source-table'] || 'movies_embeddings',
    limit: numberArg(values.limit, 10, 100), batchSize: numberArg(values['batch-size'], 10, 50)
  };
}

const genreIds = row => (row.genre_ids || row.genreIds || row.genres || [])
  .map?.(genre => Number(typeof genre === 'object' ? genre?.id : genre)).filter(Number.isInteger) || [];

export function createCanonicalMediaRecord(row, embedding) {
  const mediaType = candidateMediaType(row, row.mediaType) || 'movie';
  const tmdbId = Number(row.tmdb_id ?? row.tmdbId ?? row.id);
  const title = row.title || row.name || row.original_title || row.original_name;
  if (!['movie', 'tv'].includes(mediaType) || !Number.isSafeInteger(tmdbId) || tmdbId <= 0 || !title) {
    throw new Error('INVALID_MEDIA_RECORD');
  }
  return {
    media_type: mediaType, tmdb_id: tmdbId, title,
    original_title: row.original_title || row.original_name || title,
    overview: row.overview || null, poster_path: row.poster_path || null,
    backdrop_path: row.backdrop_path || null,
    release_date: mediaType === 'movie' ? row.release_date || null : null,
    first_air_date: mediaType === 'tv' ? row.first_air_date || null : null,
    original_language: row.original_language || null, genre_ids: genreIds(row),
    profile_text: buildMediaIndexText({ ...row, mediaType }),
    embedding_version: VECTOR_EMBEDDING_VERSION,
    embedding: validateEmbedding(embedding)
  };
}

/** Bounded, injectable batch operation used by the CLI and Phase 6 tests. */
export async function reindexMediaBatch({ rows, embeddingClient, upsert, apply = false, batchSize = 10 }) {
  const selected = Array.isArray(rows) ? rows : [];
  if (!apply) {
    return { planned: selected.length, indexed: 0, batches: 0, dryRun: true,
      sampleTexts: selected.slice(0, 3).map(buildMediaIndexText) };
  }
  let indexed = 0;
  let batches = 0;
  for (let offset = 0; offset < selected.length; offset += batchSize) {
    const batch = selected.slice(offset, offset + batchSize);
    const vectors = await embeddingClient.embed(batch.map(buildMediaIndexText));
    const records = batch.map((row, index) => createCanonicalMediaRecord(row, vectors[index]));
    await upsert(records);
    indexed += records.length;
    batches += 1;
  }
  return { planned: selected.length, indexed, batches, dryRun: false };
}

async function runCli() {
  const options = parseReindexArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let client = null;
  let rows;
  if (options.input) {
    rows = JSON.parse(await readFile(options.input, 'utf8'));
  } else {
    if (!url || !key) throw new Error('SUPABASE_REINDEX_CONFIGURATION_MISSING');
    if (!['movies', 'movies_embeddings'].includes(options.sourceTable)) throw new Error('UNSUPPORTED_SOURCE_TABLE');
    client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.from(options.sourceTable).select('*').limit(options.limit);
    if (error) throw new Error('SOURCE_READ_FAILED');
    rows = data || [];
  }
  rows = rows.slice(0, options.limit);
  if (options.apply && !client) {
    if (!url || !key) throw new Error('SUPABASE_REINDEX_CONFIGURATION_MISSING');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  const result = await reindexMediaBatch({ rows, apply: options.apply, batchSize: options.batchSize,
    embeddingClient: createEmbeddingClient(),
    upsert: async records => {
      const { error } = await client.from('media_embeddings').upsert(records,
        { onConflict: 'media_type,tmdb_id,embedding_version' });
      if (error) throw new Error('TARGET_UPSERT_FAILED');
    } });
  process.stdout.write(JSON.stringify({ ...result, embeddingVersion: VECTOR_EMBEDDING_VERSION }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(error => {
    process.stderr.write(`${error?.message || 'REINDEX_FAILED'}\n`);
    process.exitCode = 1;
  });
}
