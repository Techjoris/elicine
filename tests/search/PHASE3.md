# Phase 3 — canonical server orchestration

api/search.js remains the HTTP, authentication, quota, and public-response
boundary. It interprets a query once, then calls orchestrateSearch.

Canonical orchestration is enabled by default. Setting
CANONICAL_SEARCH_ENGINE_ENABLED=false in the server environment forces the
legacy path. An explicit true also selects canonical:

LLM parser -> legacy adapter -> normalizer/Zod -> CanonicalIntent -> orchestrator -> existing retrieval

The orchestrator projects the canonical media type, genres, and moods back into
the compatibility shape used by the existing retrieval functions. LLM
recommendations and matches remain candidate hints, not intent constraints.
There is no additional LLM, TMDB, quota, database, or network operation.

With the flag explicitly disabled, Phase 2 still calculates the shadow intent
for telemetry and the legacy input stays untouched. Canonical
validation/orchestration failure yields the original interpretation through the
legacy path and fixed non-PII telemetry codes. It does not repeat providers.

The API HTTP contract stays unchanged. The frontend is still an API consumer for
the primary path. Its historical browser fallback in unifiedAiSearch.ts remains
outside this bounded server orchestration migration and is not removed here.

The test-only baseline runner executes legacy and canonical in isolated
processes with exactly the same mocks. It compares every public response and
quota response. Canonical may add only its bounded known-title resolution calls
(maximum five); LLM calls and historical direct candidate calls must not be
duplicated. Each of the 30 versioned queries covers direct TMDB resolution,
empty TMDB resolution, no provider, provider error, and duplicate TMDB IDs (150
parity comparisons total). It does not use production credentials or make
network I/O.
