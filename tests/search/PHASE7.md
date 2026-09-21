# Phase 7 — Strict constraints before ranking

The canonical pipeline now applies `strictConstraintFilter` after hybrid
retrieval and before the unchanged historical ranking. The same local filter is
applied to the final canonical fallback, so an empty typed pool is never filled
with the other media type.

Hard rejections cover explicit media type, excluded titles and genres, known
year/runtime ranges, reliable language/country mismatches, adult mismatches, and
an allowlisted set of semantic exclusions. Missing runtime, year, language,
country, adult, genre, or semantic evidence is retained and counted as unknown
instead of being guessed.

Reliable semantic exclusions are extracted only from explicit negative clauses
and normalized to a small stable vocabulary. Evaluation uses existing genre IDs,
keywords, themes, moods, overview, and structured metadata. It performs no
network request and no per-candidate LLM call.

`STRICT_CONSTRAINT_FILTER_ENABLED=false` restores the previous pool unchanged.
After Phase 7 validation the default is enabled. Decisions and rejection reasons
remain internal and the public HTTP candidate adapter is unchanged.
