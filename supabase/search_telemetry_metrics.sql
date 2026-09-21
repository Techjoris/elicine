-- Phase 12 operational queries. Run with a service_role/admin connection.
-- All examples use the last 90 days and contain technical aggregates only.

-- Volume, fallback, empty-result and provider-error rates.
SELECT
  count(*) AS searches,
  round(100.0 * avg((fallback_used)::int), 2) AS fallback_rate_pct,
  round(100.0 * avg((no_relevant_results)::int), 2) AS empty_result_rate_pct,
  round(100.0 * avg((provider_error_count > 0)::int), 2) AS provider_error_rate_pct,
  round(100.0 * avg((vector_used)::int), 2) AS vector_search_rate_pct,
  round(100.0 * avg((semantic_expansion_used)::int), 2) AS semantic_expansion_rate_pct
FROM public.search_telemetry
WHERE created_at >= now() - interval '90 days';

-- P50/P95 total latency and average top-1 score.
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY total_duration_ms) AS latency_p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY total_duration_ms) AS latency_p95_ms,
  avg(top_score) AS average_top1_score
FROM public.search_telemetry
WHERE created_at >= now() - interval '90 days';

-- Daily trend by media type and engine path.
SELECT
  date_trunc('day', created_at) AS day,
  media_type,
  engine_path,
  count(*) AS searches,
  avg(total_duration_ms) AS average_duration_ms,
  avg(top_score) AS average_top1_score,
  sum((no_relevant_results)::int) AS empty_results
FROM public.search_telemetry
WHERE created_at >= now() - interval '90 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC;

-- Repeated result-set fingerprints can reveal a generic pool. The fingerprint
-- is a one-way hash of technical media IDs, never a title or raw query.
SELECT result_set_fingerprint, count(*) AS occurrences
FROM public.search_telemetry
WHERE result_set_fingerprint IS NOT NULL
  AND created_at >= now() - interval '90 days'
GROUP BY result_set_fingerprint
HAVING count(*) > 1
ORDER BY occurrences DESC;
