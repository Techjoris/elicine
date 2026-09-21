-- Phase 12: durable, technical-only search observability.
-- No raw query, title, intent, embedding or user identity is stored here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.search_telemetry (
  search_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  media_type TEXT,
  engine_path TEXT,
  locale TEXT,
  llm_used BOOLEAN NOT NULL DEFAULT false,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  fallback_reason TEXT,
  fallback_source TEXT,
  fallback_relaxation_applied BOOLEAN NOT NULL DEFAULT false,
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  filtered_count INTEGER NOT NULL DEFAULT 0 CHECK (filtered_count >= 0),
  final_count INTEGER NOT NULL DEFAULT 0 CHECK (final_count >= 0),
  top_score DOUBLE PRECISION CHECK (top_score IS NULL OR (top_score >= 0 AND top_score <= 1)),
  retrieval_duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (retrieval_duration_ms >= 0),
  ranking_duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (ranking_duration_ms >= 0),
  total_duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (total_duration_ms >= 0),
  provider_error_count INTEGER NOT NULL DEFAULT 0 CHECK (provider_error_count >= 0),
  hybrid_retrieval_succeeded BOOLEAN NOT NULL DEFAULT false,
  vector_used BOOLEAN NOT NULL DEFAULT false,
  vector_succeeded BOOLEAN NOT NULL DEFAULT false,
  vector_candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (vector_candidate_count >= 0),
  embedding_duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (embedding_duration_ms >= 0),
  semantic_expansion_used BOOLEAN NOT NULL DEFAULT false,
  semantic_expansion_term_count INTEGER NOT NULL DEFAULT 0 CHECK (semantic_expansion_term_count >= 0),
  semantic_keyword_resolved_count INTEGER NOT NULL DEFAULT 0 CHECK (semantic_keyword_resolved_count >= 0),
  strict_filter_input_count INTEGER NOT NULL DEFAULT 0 CHECK (strict_filter_input_count >= 0),
  strict_filter_rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (strict_filter_rejected_count >= 0),
  strict_filter_unknown_count INTEGER NOT NULL DEFAULT 0 CHECK (strict_filter_unknown_count >= 0),
  rejected_media_type INTEGER NOT NULL DEFAULT 0 CHECK (rejected_media_type >= 0),
  rejected_year INTEGER NOT NULL DEFAULT 0 CHECK (rejected_year >= 0),
  rejected_genre INTEGER NOT NULL DEFAULT 0 CHECK (rejected_genre >= 0),
  rejected_title INTEGER NOT NULL DEFAULT 0 CHECK (rejected_title >= 0),
  rejected_semantic_exclusion INTEGER NOT NULL DEFAULT 0 CHECK (rejected_semantic_exclusion >= 0),
  ranking_candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (ranking_candidate_count >= 0),
  diversification_reordered_count INTEGER NOT NULL DEFAULT 0 CHECK (diversification_reordered_count >= 0),
  generic_pool_suspected BOOLEAN NOT NULL DEFAULT false,
  low_confidence_result BOOLEAN NOT NULL DEFAULT false,
  embedding_unusable BOOLEAN NOT NULL DEFAULT false,
  no_candidates_after_filter BOOLEAN NOT NULL DEFAULT false,
  no_relevant_results BOOLEAN NOT NULL DEFAULT false,
  excessive_duration BOOLEAN NOT NULL DEFAULT false,
  result_set_fingerprint TEXT,
  status_code INTEGER
);

CREATE INDEX IF NOT EXISTS idx_search_telemetry_created_at
  ON public.search_telemetry (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_telemetry_fallback
  ON public.search_telemetry (fallback_used, created_at DESC)
  WHERE fallback_used = true;

CREATE INDEX IF NOT EXISTS idx_search_telemetry_empty
  ON public.search_telemetry (no_relevant_results, created_at DESC)
  WHERE no_relevant_results = true;

CREATE INDEX IF NOT EXISTS idx_search_telemetry_pool_fingerprint
  ON public.search_telemetry (result_set_fingerprint, created_at DESC)
  WHERE result_set_fingerprint IS NOT NULL;

-- The browser roles receive no table privileges. Server writes use service_role,
-- which is kept outside the client bundle by api/_security.js.
ALTER TABLE public.search_telemetry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.search_telemetry FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.search_telemetry TO service_role;

DROP POLICY IF EXISTS "Service role may write search telemetry" ON public.search_telemetry;
CREATE POLICY "Service role may write search telemetry"
  ON public.search_telemetry
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Retention is intentionally explicit and simple. Schedule this statement from
-- Supabase/pg_cron or an external maintenance job at most once per day:
-- DELETE FROM public.search_telemetry
-- WHERE created_at < timezone('utc'::text, now()) - interval '90 days';

CREATE OR REPLACE FUNCTION public.prune_search_telemetry(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.search_telemetry
   WHERE created_at < now() - make_interval(days => GREATEST(retention_days, 1));
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_search_telemetry(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_search_telemetry(INTEGER) TO service_role;
