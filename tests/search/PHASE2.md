# Phase 2 — canonical intent shadow

## Architecture and scope

The browser keeps its existing direct-title path, /api/search call, and /api/ai
fallback. Only the /api/search POST interpretation boundary is instrumented.
After queryLlmCandidates returns, generateCanonicalIntentShadow runs:
legacy interpretation -> adapter -> provider-neutral normalizer -> shared Zod
contract. Its return value is deliberately not used by retrieval or ranking.
No extra network calls, database writes, prompts, API fields, or quotas.
Removing the import and hook in api/search.js disables the shadow computation.

The Phase 1 implementation was moved without changing validation rules into
src/types/canonicalIntent.runtime.js. canonicalIntent.ts retains the typed public
exports. Plain Node handlers therefore need no TypeScript loader or new package.

## Normalization and evidence

Arrays are trimmed, internal whitespace collapsed, empty strings removed,
case-insensitive duplicates removed in stable order. Locale codes follow Phase 1
syntax (language 2–3 letters lowercase, country 2 letters uppercase), not an
exhaustive ISO registry. Media aliases map to movie/tv; legacy all maps to null.
Missing values receive [] or null. Numbers must be finite numbers, not numeric
strings: integer years 1888–2100, runtime 0–1000, rating 0–10. Inverted year/runtime
ranges, malformed arrays, invalid enums, and non-boolean adult are rejected.
No relative-date interpretation or enrichment is introduced.

The legacy parser synthesizes reference_titles from recommended_titles, themes
from mood_tags, and cleanSearchKeywords from the full cleaned query. These are
not reliable independent constraints. The adapter keeps reference titles only
when the entire title occurs in the original query (case/punctuation normalized).
No fuzzy corrections or translations are guessed; these references can remain
unknown. It does not convert facets.forbidden_mismatches into excluded genres.

The normalizer supports all canonical fields. The adapter maps optional explicit
snake_case constraints if present; today's parser discards most of them. Thus
years, exclusions, languages, countries, runtimes, rating, adult, and sort often
remain unknown. explicit_themes is reserved for independent structured themes;
the existing aliased themes field is intentionally ignored. No parser/prompt
extension was made. UI locale is not a requested content-language constraint.

## Telemetry

The existing Phase 0 request event receives:
canonicalIntentGenerated, canonicalIntentValid,
canonicalIntentNormalizationApplied, canonicalIntentError.
Normalization compares adapted fields with the validated output; inserted
defaults count as normalization. Failure leaves normalizationApplied null.
Errors are fixed codes LEGACY_INTENT_ADAPTER_FAILED or
CANONICAL_INTENT_VALIDATION_FAILED, never exception messages or raw inputs.
The canonical object and raw query are not persisted by Phase 2. Existing
Phase 0 logging policy/bounded buffer is unchanged.
Requests ending before interpretation (including quotas and proxy actions) have
no Phase 2 signals. A telemetry-write failure emits a fixed warning and returns.

## Verification

From repository root:

```powershell
node --test tests/search/phase0.test.mjs
npx --no-install tsx --test tests/search/canonicalIntent.test.ts
node --test tests/search/phase2.test.mjs tests/search/baseline-regression.test.mjs
npm run build
```

Phase 0: 5 tests. Phase 1: 4 tests. Phase 2: 42 tests. Baseline: 30 cases.
tsx is available in pre-existing uncommitted package changes; Phase 2 adds no
dependency. Its JavaScript tests require a Node version supporting JSON import
attributes; verified locally on Node 26.8.2.

Phase 3 extends the baseline runner to compare the legacy and canonical paths
using isolated deterministic fixtures; see tests/search/PHASE3.md.

This verifies deterministic non-regression, NOT the baseline's qualitative
relevance expectations, live provider reliability, authenticated Supabase
retrieval, or browser end-to-end behavior.

## Historical fallback correction

Phase 3 corrects the historical heuristicMood ReferenceError with a dedicated
regression test. The no-provider path now continues to its existing fallback.
