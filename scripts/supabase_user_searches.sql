-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — Schéma SQL pour le suivi des recherches quotidiennes (Supabase)
-- Limite à 3 recherches gratuites par jour par utilisateur / adresse IP
-- Exécutez ce script dans l'éditeur SQL de votre Dashboard Supabase.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Création de la table des recherches utilisateurs
CREATE TABLE IF NOT EXISTS public.user_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                          -- ID Supabase Auth, device_id ou 'ip_' + hash
  ip_address TEXT,                                 -- Adresse IP client ou hash
  ip_hash TEXT,                                    -- Hash SHA-256 de l'adresse IP client (RGPD)
  search_date DATE NOT NULL DEFAULT CURRENT_DATE,  -- Date de la recherche (YYYY-MM-DD)
  search_count INTEGER NOT NULL DEFAULT 1,         -- Nombre de recherches effectuées ce jour
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_daily_search UNIQUE (user_id, search_date)
);

-- Migration douce si la table existe déjà sans la colonne ip_hash :
ALTER TABLE public.user_searches ADD COLUMN IF NOT EXISTS ip_hash TEXT;

-- 2. Index d'optimisation pour les requêtes de quota journalier
CREATE INDEX IF NOT EXISTS idx_user_searches_user_date ON public.user_searches(user_id, search_date);
CREATE INDEX IF NOT EXISTS idx_user_searches_ip_date ON public.user_searches(ip_address, search_date);
CREATE INDEX IF NOT EXISTS idx_user_searches_ip_hash_date ON public.user_searches(ip_hash, search_date);
CREATE INDEX IF NOT EXISTS idx_user_searches_date ON public.user_searches(search_date);

-- 3. Activation de Row Level Security (RLS)
ALTER TABLE public.user_searches ENABLE ROW LEVEL SECURITY;

-- 4. Politiques de sécurité (Lecture et écriture autorisées pour les utilisateurs et l'API)
CREATE POLICY "Lecture autorisée des quotas de recherche"
  ON public.user_searches
  FOR SELECT
  USING (true);

CREATE POLICY "Enregistrement et incrémentation des recherches autorisés"
  ON public.user_searches
  FOR ALL
  USING (true)
  WITH CHECK (true);
