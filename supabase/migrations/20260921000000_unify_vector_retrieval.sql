-- Phase 6: one canonical vector store for movies and TV. Legacy 1024D
-- movie_profiles and legacy 1536D movies_embeddings/match_movies stay untouched.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.media_embeddings (
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date DATE,
  first_air_date DATE,
  original_language TEXT,
  genre_ids INTEGER[] NOT NULL DEFAULT '{}',
  profile_text TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (media_type, tmdb_id, embedding_version)
);

CREATE INDEX IF NOT EXISTS idx_media_embeddings_version_type
  ON public.media_embeddings (embedding_version, media_type);

CREATE INDEX IF NOT EXISTS idx_media_embeddings_vector_hnsw
  ON public.media_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION public.match_media(
  query_embedding vector(1024),
  match_media_type TEXT DEFAULT NULL,
  match_limit INTEGER DEFAULT 20,
  match_threshold DOUBLE PRECISION DEFAULT 0.40,
  match_embedding_version TEXT DEFAULT 'text-embedding-3-small:1024:v1'
)
RETURNS TABLE (
  tmdb_id BIGINT,
  media_type TEXT,
  title TEXT,
  original_title TEXT,
  overview TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date DATE,
  first_air_date DATE,
  original_language TEXT,
  genre_ids INTEGER[],
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT
    me.tmdb_id, me.media_type, me.title, me.original_title, me.overview,
    me.poster_path, me.backdrop_path, me.release_date, me.first_air_date,
    me.original_language, me.genre_ids,
    1 - (me.embedding <=> query_embedding) AS similarity
  FROM public.media_embeddings AS me
  WHERE me.embedding_version = match_embedding_version
    AND (match_media_type IS NULL OR me.media_type = match_media_type)
    AND 1 - (me.embedding <=> query_embedding) >= match_threshold
  ORDER BY me.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_limit, 1), 50);
$$;

ALTER TABLE public.media_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on canonical media embeddings"
  ON public.media_embeddings FOR SELECT USING (true);

CREATE POLICY "Allow service role to maintain canonical media embeddings"
  ON public.media_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.match_media(vector, TEXT, INTEGER, DOUBLE PRECISION, TEXT)
  TO anon, authenticated, service_role;
