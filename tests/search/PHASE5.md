# Phase 5 — Hybrid candidate retrieval

## Boundary

`CanonicalIntent` and `ResolvedIntentContext` now feed `hybridRetrieve`. The
retriever fetches candidates, merges them by `mediaType:tmdbId`, and returns at
most 50 internal `RetrievalCandidate` objects. `toLegacyRankingCandidate` then
adapts this pool to the existing server scoring/enrichment function. No ranking
weight, public response field, prompt, pgvector migration, payment path, or
frontend search implementation is changed.

The transition flag is server-only:

- after the completed activation gate, absence or `true` selects hybrid retrieval;
- `HYBRID_RETRIEVAL_ENABLED=false` immediately restores historical retrieval.

Production executes one retrieval path. Legacy/hybrid shadow comparison exists
only in deterministic tests.

## Sources and limits

The candidate sources are `tmdb_search`, `tmdb_discover`, `tmdb_similar`,
`tmdb_recommendations`, `supabase_lexical`, and `legacy`. Independent work uses
isolated promises so one rejected or timed-out source cannot discard the others.
External sources have a 4,000 ms orchestration deadline; TMDB transport has a
3,500 ms request-and-body deadline. A request may use at most 30 distinct TMDB
URLs, regardless of result count.

Search is limited to two explicit unresolved titles. Resolved references are
never searched again and at most three unique, type-compatible seeds drive
Similar and Recommendations. At most five independently structured
theme/mood/keyword terms are exact-matched against TMDB keyword names, with at
most three unambiguous IDs passed to Discover. Discover is typed and supports
the documented genre, year, single original-language, minimum rating, adult,
and runtime parameters.

The checked-in Supabase source remains lexical ILIKE retrieval over the existing
catalogue. It deliberately performs no vector RPC and assumes those catalogue
rows are movies unless they explicitly say otherwise. The older client fallback
in `src/services/unifiedAiSearch.ts` remains out of scope and is technical debt.

## Retrieval priority versus ranking

Before the 50-candidate cap, retrieval priority is deterministic:

1. candidates supported by multiple sources;
2. seed recommendations and similar candidates;
3. Discover candidates;
4. explicit-title Search candidates;
5. Supabase lexical and legacy candidates.

This ordering only protects the bounded pool. It is not a semantic relevance
score. The historical `calculateSemanticMatchScore` remains the final scorer.

## Failure and cache behavior

Each source reports only a fixed `SOURCE_FAILED` or `TIMEOUT` code. If a usable
source remains, retrieval continues. If the pool is empty, the handler invokes
the existing global fallback without a second provider cascade; a strict movie
or TV constraint is applied afterward, so the legacy movie-only safety list can
never leak films into a TV pool.

The request-scoped TMDB client caches promises by canonical URL, including
pending and failed calls. Entity resolution, the legacy hint adapter, Discover,
Similar, Recommendations, and keyword lookup therefore share one bounded
transport. No global cache and no second LLM call were introduced.

## Test suites

- `phase5.test.mjs`: candidate contract, all strategies, filters, isolation,
  deadlines, caps, cache, lexical source, adapter, and flags.
- `retrieval-quality.test.mjs`: seven structural quality cases and comparative
  legacy/hybrid metrics.
- `hybrid-baseline.test.mjs`: 30 historical corpus queries checking HTTP shape,
  quotas, provider counts, type/identity deduplication, and internal-field
  non-disclosure.
- `baseline-regression.test.mjs`: frozen historical legacy/canonical parity with
  hybrid explicitly disabled.
