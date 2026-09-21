-- Phase 13: durable semantic interpreter observability.
-- interpreter_path is one of: deepseek | provider_fallback | heuristic_fallback.
-- interpreter_reason is one of: timeout | provider_error | invalid_response |
-- unavailable. No raw query, title or provider payload is stored here.

ALTER TABLE public.search_telemetry
  ADD COLUMN IF NOT EXISTS interpreter_path TEXT,
  ADD COLUMN IF NOT EXISTS interpreter_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_search_telemetry_interpreter
  ON public.search_telemetry (interpreter_path, created_at DESC)
  WHERE interpreter_path IS NOT NULL;
