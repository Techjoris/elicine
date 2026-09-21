# Phase 9.5 — Bounded semantic retrieval expansion

The reference query kept its `tv` boundary but lost semantic precision before
ranking. TMDB keyword lookup translated each French theme to at most one term,
the vector query embedded only the literal canonical fields, and lexical lookup
used only original terms. Discover therefore relied heavily on the broad TV War
genre and could admit unrelated popular series into the pre-ranking pool.

`semanticExpansion.js` now owns a small one-hop relation set. It expands themes,
keywords and moods deterministically, round-robin across matched concepts, with
at most eight additional terms. It makes no LLM or network call and never
recursively expands generated terms.

For modern warfare plus fighter aircraft, the bounded expansion is: `modern
warfare`, `military aviation`, `fighter aircraft`, `military`, `air force`,
`fighter jets`, `special forces`, and `aerial combat`. The same shared expansion
feeds exact TMDB keyword resolution, the query embedding text and Supabase
lexical filters. Unresolved or ambiguous TMDB keywords remain ignored, keyword
IDs remain capped at three, and request-scoped TMDB caching is unchanged.

The embedding model remains `text-embedding-3-small`, dimension 1024, and the
media index document remains unchanged. Phase 7 filtering, Phase 8 ranking and
Phase 9 diversification are untouched.
