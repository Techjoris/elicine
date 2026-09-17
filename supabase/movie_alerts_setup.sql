-- ══════════════════════════════════════════════════════════════════════════════
-- ÉLICINÉ — Configuration de la table des Alertes de Sortie (user_movie_alerts)
-- Fonctionnalité de suivi et de notification par email des sorties (Pass Pro)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Création de la table user_movie_alerts
CREATE TABLE IF NOT EXISTS public.user_movie_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  movie_id BIGINT NOT NULL,
  movie_title TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date DATE,
  media_type TEXT DEFAULT 'movie',
  overview TEXT,
  notified_j_minus_2 BOOLEAN DEFAULT FALSE,
  notified_release_day BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_movie_alert UNIQUE (user_id, movie_id)
);

-- 2. Index de performance pour les requêtes quotidiennes du Cron et la navigation utilisateur
CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_release_date 
  ON public.user_movie_alerts(release_date);

CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_user_id 
  ON public.user_movie_alerts(user_id);

CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_email 
  ON public.user_movie_alerts(email);

CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_j2 
  ON public.user_movie_alerts(release_date, notified_j_minus_2);

CREATE INDEX IF NOT EXISTS idx_user_movie_alerts_day 
  ON public.user_movie_alerts(release_date, notified_release_day);

-- 3. Activation de Row Level Security (RLS)
ALTER TABLE public.user_movie_alerts ENABLE ROW LEVEL SECURITY;

-- Politiques de sécurité RLS pour les utilisateurs authentifiés
DROP POLICY IF EXISTS "Users can read own movie alerts" ON public.user_movie_alerts;
CREATE POLICY "Users can read own movie alerts"
  ON public.user_movie_alerts
  FOR SELECT
  USING (
    user_id = auth.uid()::text 
    OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR auth.jwt() ->> 'email' = 'ivanjoris959@gmail.com'
    OR auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
  );

DROP POLICY IF EXISTS "Users can insert own movie alerts" ON public.user_movie_alerts;
CREATE POLICY "Users can insert own movie alerts"
  ON public.user_movie_alerts
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::text 
    OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR auth.jwt() ->> 'email' = 'ivanjoris959@gmail.com'
  );

DROP POLICY IF EXISTS "Users can delete own movie alerts" ON public.user_movie_alerts;
CREATE POLICY "Users can delete own movie alerts"
  ON public.user_movie_alerts
  FOR DELETE
  USING (
    user_id = auth.uid()::text 
    OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR auth.jwt() ->> 'email' = 'ivanjoris959@gmail.com'
    OR auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
  );

DROP POLICY IF EXISTS "Service role full access on movie alerts" ON public.user_movie_alerts;
CREATE POLICY "Service role full access on movie alerts"
  ON public.user_movie_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
