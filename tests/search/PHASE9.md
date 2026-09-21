# Phase 9 — Deterministic result diversification

The canonical pipeline now runs `resultDiversifier` after the Phase 8 ranker.
It is a pure local greedy reranker over the first 20 ranked candidates. The
Phase 8 top result is fixed, exact media identities are deduplicated, and the
remaining candidates are selected by relevance minus capped diversity
penalties.

All coefficients live in `DIVERSIFICATION_CONFIG`: explicit collection 0.05,
near-duplicate 0.08, highly overlapping genres 0.025, highly overlapping themes
0.035, and an already-known common director 0.02. Per-category penalties use
their maximum against selected results rather than accumulating per result, and
the total penalty is capped at 0.16.

Collection and director facts are normalized only from metadata already present
on a candidate. No title-derived franchise guess, provider request, network call
or LLM call is made. Exact normalized titles with a compatible year are treated
as near-duplicate variants, not as proof of a franchise.

Candidates strongly aligned with a resolved reference keep 80% of the normal
penalty disabled, so intentional franchise searches remain relevance-first.
Explicit varied/diverse intent modestly increases the penalties. The Phase 8
`finalScore` and public `match_rate` never change; `diversifiedScore` is internal.

`DIVERSIFIED_RANKING_ENABLED=false` returns the exact Phase 8 array. After the
Phase 9 validation gate, diversification is enabled by default.
