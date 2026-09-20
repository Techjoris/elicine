# Phase 4 — TMDB entity resolution

Canonical orchestration is now the default. `CANONICAL_SEARCH_ENGINE_ENABLED=false`
forces the immediate legacy path. After CanonicalIntent validation, the server
calls `resolveKnownTitles` with an injected TMDB search service and obtains a
request-scoped `ResolvedIntentContext`. CanonicalIntent remains provider-neutral.

The resolver processes at most five deduplicated `knownTitles`. It normalizes
case, accents, whitespace, apostrophes, and simple punctuation only for
comparison. Candidate scores combine title/original-title exactness, token
similarity, expected media type, and optional year; popularity is only the final
tie-breaker. The acceptance threshold is 0.72. Exact-title ties without a media
type, or close weak matches, are marked ambiguous and remain unresolved.

The context contains only the fields needed by later retrieval phases:

```js
{
  resolvedTitles: [{
    inputTitle, tmdbId, mediaType, canonicalTitle, originalTitle,
    releaseYear, originalLanguage, genreIds, resolutionConfidence,
    resolutionMethod
  }],
  unresolvedTitles,
  metrics
}
```

Provider errors and timeouts become unresolved references; they do not trigger a
global legacy fallback. A request-scoped Promise cache is shared between entity
resolution and the existing exact-title helper when the lookup key is
compatible. No global cache, ranking change, pgvector work, or public response
field was added.

The future-quality fixture `quality-phase4.json` records the modern-war TV
query and its expected themes for later retrieval/ranking phases. Phase 4 does
not force those qualitative results.
