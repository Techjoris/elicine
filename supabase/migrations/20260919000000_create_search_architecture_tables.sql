-- ==============================================================================
-- Éliciné - Search Architecture & Semantic Retrieval Schema
-- PostgreSQL + pgvector + pg_trgm + Hybrid Search Indexes & RLS
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. TABLES

-- Table principale des films
CREATE TABLE IF NOT EXISTS movies (
    tmdb_id BIGINT PRIMARY KEY,
    original_title TEXT,
    release_year INT,
    runtime INT,
    poster_path TEXT,
    overview TEXT,
    tagline TEXT,
    vote_average NUMERIC,
    popularity NUMERIC,
    original_language CHAR(2),
    director TEXT,
    genres INT[],
    keywords TEXT[],
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table des titres multilingues, localisations et embeddings de titres
CREATE TABLE IF NOT EXISTS movie_titles (
    id BIGSERIAL PRIMARY KEY,
    tmdb_id BIGINT NOT NULL REFERENCES movies(tmdb_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    language CHAR(2) NOT NULL,
    country CHAR(2),
    is_original BOOL DEFAULT false,
    is_primary BOOL DEFAULT false,
    source TEXT,
    embedding_title vector(1024),
    CONSTRAINT uq_movie_titles_tmdb_title_lang_country UNIQUE(tmdb_id, title, language, country)
);

-- Table des profils sémantiques et vecteurs denses (1024 dimensions)
CREATE TABLE IF NOT EXISTS movie_profiles (
    tmdb_id BIGINT PRIMARY KEY REFERENCES movies(tmdb_id) ON DELETE CASCADE,
    profile_text TEXT,
    embedding vector(1024),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table de disponibilité streaming par pays et fournisseur
CREATE TABLE IF NOT EXISTS movie_platforms (
    tmdb_id BIGINT REFERENCES movies(tmdb_id) ON DELETE CASCADE,
    country CHAR(2) NOT NULL,
    provider_name TEXT NOT NULL,
    PRIMARY KEY(tmdb_id, country, provider_name)
);

-- Table des préférences utilisateurs (pondération facettes, plateformes favorites)
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY,
    locale CHAR(2) DEFAULT 'fr',
    preferred_platforms TEXT[],
    facet_weights JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table des événements de feedback et télémétrie de recherche
CREATE TABLE IF NOT EXISTS feedback_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID,
    tmdb_id BIGINT,
    event_type TEXT,
    query_raw TEXT,
    facets JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table de benchmarking et qualité de recherche (diversité, scores, hidden gems)
CREATE TABLE IF NOT EXISTS search_quality (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID,
    query_raw TEXT,
    top1_score NUMERIC,
    top1_top2_gap NUMERIC,
    diversity_score NUMERIC,
    hidden_gems_ratio NUMERIC,
    passed BOOL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. INDEXES DE PERFORMANCE ET DE RECHERCHE HYBRIDE

-- Index GIN trigram pour la recherche textuelle floue et rapide sur les titres
CREATE INDEX IF NOT EXISTS idx_movie_titles_title_trgm 
    ON movie_titles USING gin (title gin_trgm_ops);

-- Index HNSW Cosine pour la recherche sémantique par similarité vectorielle (profils de films)
CREATE INDEX IF NOT EXISTS idx_movie_profiles_embedding 
    ON movie_profiles USING hnsw (embedding vector_cosine_ops);

-- Index HNSW Cosine pour la recherche vectorielle directe sur les titres (titres vectorisés)
CREATE INDEX IF NOT EXISTS idx_movie_titles_embedding_title 
    ON movie_titles USING hnsw (embedding_title vector_cosine_ops) 
    WHERE embedding_title IS NOT NULL;

-- Index B-tree sur l'année de sortie pour le filtrage chronologique
CREATE INDEX IF NOT EXISTS idx_movies_release_year 
    ON movies (release_year);

-- Index GIN sur les genres (tableau d'entiers) pour les filtres combinatoires
CREATE INDEX IF NOT EXISTS idx_movies_genres_gin 
    ON movies USING gin (genres);

-- Index GIN sur les mots-clés (tableau de texte)
CREATE INDEX IF NOT EXISTS idx_movies_keywords_gin 
    ON movies USING gin (keywords);

-- Index B-tree sur les événements utilisateurs pour l'analytics et historique
CREATE INDEX IF NOT EXISTS idx_feedback_events_user_created 
    ON feedback_events (user_id, created_at);

-- 4. ROW LEVEL SECURITY (RLS) & POLICIES

-- Activation RLS
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE movie_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE movie_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE movie_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_quality ENABLE ROW LEVEL SECURITY;

-- Policies de lecture publique pour le catalogue
CREATE POLICY "Allow public read access on movies" 
    ON movies FOR SELECT USING (true);

CREATE POLICY "Allow public read access on movie_titles" 
    ON movie_titles FOR SELECT USING (true);

CREATE POLICY "Allow public read access on movie_profiles" 
    ON movie_profiles FOR SELECT USING (true);

CREATE POLICY "Allow public read access on movie_platforms" 
    ON movie_platforms FOR SELECT USING (true);

-- Policies d'écriture restreintes au rôle de service (service_role)
CREATE POLICY "Allow service_role full access on movies" 
    ON movies FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on movie_titles" 
    ON movie_titles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on movie_profiles" 
    ON movie_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on movie_platforms" 
    ON movie_platforms FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on user_preferences" 
    ON user_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on feedback_events" 
    ON feedback_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on search_quality" 
    ON search_quality FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Policies spécifiques pour les utilisateurs authentifiés
CREATE POLICY "Allow users to read and update own preferences" 
    ON user_preferences FOR ALL TO authenticated 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to insert feedback" 
    ON feedback_events FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
