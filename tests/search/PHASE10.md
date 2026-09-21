# Phase 10 — Fallback hardening

## Scope

Phase 10 keeps the canonical pipeline unchanged through retrieval, strict
filtering, ranking and diversification. It hardens only degraded and empty
paths.

## Rules

- Retrieval providers fail independently; completed sources remain usable.
- Explicit constraints are never relaxed. In particular, media type, adult,
  excluded titles/genres and semantic exclusions remain strict.
- An empty canonical pool stays empty and is represented internally as
  `no_candidates` or `no_relevant_results`.
- A ranking failure or empty ranking returns no unranked replacement.
- No cross-media candidate is injected into the primary pool.
- No catalogue entry is fabricated when real providers are unavailable.
- A successful empty server response is authoritative for the frontend.

The only retained relaxation is the pre-existing similarity-threshold retry on
the legacy direct-vector compatibility endpoint. It is bounded to one retry,
does not alter explicit intent constraints and is reported by telemetry.

## Telemetry

Only fixed labels are recorded in the five Phase 10 fields:

- `fallbackAttempted`
- `fallbackUsed`
- `fallbackReason`
- `fallbackSource`
- `fallbackRelaxationApplied`

Raw queries, vectors and provider error messages are excluded.

## Focused validation

Run:

```sh
node --import tsx --test tests/search/phase10.test.ts tests/search/heuristicFallback.test.mjs
```

The fixtures cover isolated TMDB, vector and Supabase failures, timeouts, a
fully unavailable external stack, empty retrieval and ranking, LLM absence,
strict semantic exclusions, media-type integrity and authoritative frontend
empty responses.
