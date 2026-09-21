# Phase 8 — Unified Eliciné ranking

The canonical pipeline now ranks Phase 7-admissible `RetrievalCandidate` values
before their HTTP conversion. The ranker is local, deterministic, provider
neutral, and performs no network or LLM call.

All component weights live in `ELICINE_RANKING_CONFIG`. Intent components carry
89% of the static weight budget; Bayesian quality, logarithmic popularity and a
bounded source-confidence signal share the remaining 11%. Only components that
are meaningful for the current intent enter the normalized weighted average.

The score contains semantic, genre, theme, mood, keyword, reference, title,
year, language, country, quality, popularity and source-confidence components.
Every component and `finalScore` is bounded to 0..1. The public `match_rate` is
exactly `round(finalScore * 100)`; internal components never enter the response.

Resolved reference titles reward Recommendations, Similar, vector proximity,
shared genres and already-available keywords/themes. The resolved reference item
itself receives no reference or title bonus. Multiple sources add a small capped
confidence bonus.

`ELICINE_RANKING_ENABLED=false` restores the unchanged historical ranking.
After Phase 8 validation the unified ranker is enabled by default. Canonical
fallback candidates pass through the same strict-filter/ranking sequence.
