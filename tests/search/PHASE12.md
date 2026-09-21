# Phase 12 — Durable search telemetry

Phase 12 persists one technical summary row per server-side search in
`public.search_telemetry`. The API generates a UUID `searchId` at the response
boundary and keeps the same value through the canonical pipeline. Persistence
uses the server Supabase client only and failures are intentionally ignored by
the search path.

The allow-list excludes raw queries, titles, complete intents, embeddings,
provider payloads and personal data. A bounded result-set hash is retained only
to identify repeated generic pools. Rows expose fallback, provider-error,
vector, semantic-expansion, strict-filter, ranking, duration and empty-result
signals. See `supabase/SEARCH_TELEMETRY.md` and
`supabase/search_telemetry_metrics.sql` for retention and operational queries.

Focused validation:

```sh
node --test tests/search/phase12.test.mjs
```
