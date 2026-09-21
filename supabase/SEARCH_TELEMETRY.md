# Phase 12 search telemetry

`search_telemetry` stores one technical summary row per server-side search. It
does not contain the raw query, titles, `CanonicalIntent`, embeddings, account
identifiers or provider payloads. The API writes with the server Supabase
client only; `anon` and `authenticated` have no table privileges.

Rows are retained for 90 days. Run `public.prune_search_telemetry(90)` from a
trusted maintenance job (or execute the documented `DELETE` in the migration)
once per day. The SQL examples in `search_telemetry_metrics.sql` provide the
volume, fallback, empty-result, provider-error, latency, score, vector and
semantic-expansion metrics without creating a dashboard.
