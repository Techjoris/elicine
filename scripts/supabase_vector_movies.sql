-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — Configuration de la recherche vectorielle avec pgvector (Supabase)
-- Exécutez ce script dans l'éditeur SQL de votre Dashboard Supabase.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Activation de l'extension pgvector pour les embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Création de la table movies_embeddings (résumés, ambiances, décors, tags thématiques)
CREATE TABLE IF NOT EXISTS public.movies_embeddings (
  id BIGSERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date DATE,
  vote_average NUMERIC(3, 1),
  vote_count INTEGER DEFAULT 0,
  genres JSONB DEFAULT '[]'::jsonb,
  genre_ids INTEGER[] DEFAULT '{}',
  themes TEXT[] DEFAULT '{}',
  setting TEXT,                               -- Décor : grotte, sous terre, espace, sous-marin...
  moods TEXT[] DEFAULT '{}',                  -- Ambiance : angoissant, paranoïa, sombre, claustrophobe...
  embedding vector(1536),                     -- Vecteur de plongement (ex: text-embedding-3-small)
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 3. Index vectoriel HNSW pour des recherches cosinus ultra-rapides (< 10ms)
CREATE INDEX IF NOT EXISTS idx_movies_embeddings_vector 
  ON public.movies_embeddings 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index textuels complémentaires
CREATE INDEX IF NOT EXISTS idx_movies_embeddings_tmdb_id ON public.movies_embeddings(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_embeddings_genre_ids ON public.movies_embeddings USING gin(genre_ids);
CREATE INDEX IF NOT EXISTS idx_movies_embeddings_themes ON public.movies_embeddings USING gin(themes);
CREATE INDEX IF NOT EXISTS idx_movies_embeddings_moods ON public.movies_embeddings USING gin(moods);

-- 4. Fonction RPC : match_movies (Interrogation sémantique & vectorielle Niveau 2)
-- Filtre directement par seuil de similarité cosinus (match_threshold)
CREATE OR REPLACE FUNCTION public.match_movies(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.40,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id BIGINT,
  tmdb_id INTEGER,
  title TEXT,
  original_title TEXT,
  overview TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date DATE,
  vote_average NUMERIC(3, 1),
  vote_count INTEGER,
  genre_ids INTEGER[],
  genres JSONB,
  themes TEXT[],
  setting TEXT,
  moods TEXT[],
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.id,
    me.tmdb_id,
    me.title,
    me.original_title,
    me.overview,
    me.poster_path,
    me.backdrop_path,
    me.release_date,
    me.vote_average,
    me.vote_count,
    me.genre_ids,
    me.genres,
    me.themes,
    me.setting,
    me.moods,
    1 - (me.embedding <=> query_embedding) AS similarity
  FROM public.movies_embeddings me
  WHERE 1 - (me.embedding <=> query_embedding) >= match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 5. Activation de Row Level Security (RLS)
ALTER TABLE public.movies_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture publique autorisée des films et embeddings"
  ON public.movies_embeddings
  FOR SELECT
  USING (true);
