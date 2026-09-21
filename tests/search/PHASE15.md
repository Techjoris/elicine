# Phase 15 - Narrative candidate channel: the model proposes, the catalogue confirms

## Why

The 16-19/09 engine asked the model for a short list of works that really tell
the story, verified them against TMDB and merged them into the pool. Commit
`52344d1` ("make semantic LLM interpretation primary") replaced that prompt with
a pure intent extractor ("Tu ne dois PAS proposer de liste de films"), and the
works the model would have named stopped reaching the pool at all. On the
recorded baseline, nine of the twenty-two recall cases had the expected work
somewhere in the pool but absent from the final grid.

Phase 15 restores the proposal without restoring the authority.

## Contract

- The model PROPOSES. `src/search/narrativeCandidateInterpreter.js` makes exactly
  one bounded call per search (`max_tokens` 1800, temperature 0.4), asking for 4
  to 10 real works with a TMDB title, a year and a one-line narrative reason. The
  model never sees the catalogue.
- The catalogue CONFIRMS. Every proposed title is re-resolved against TMDB by
  `resolveNarrativeCandidates` (one search per title, `Promise.allSettled`,
  fail-soft). A title TMDB cannot confirm, or that has no poster, is dropped.
- The ranking DECIDES. The confirmed rows become the `llm_candidates` source and
  pass through the same strict filter, ranking, diversification and result budget
  as every other source. No proposal can bypass that chain.

## Pipeline

```
hybrid retrieval -> strict filter -> ranking -> diversification -> result budget
   ^
   +-- llm_candidates (TMDB-confirmed proposals, llm_rank + llm_reason)
```

`llm_candidates` gets a `strength` of 3.5 (between `tmdb_similar` 4 and
`tmdb_discover` 3) in `retrievalCandidate.js`, a source confidence of 0.90, and a
dedicated `narrativeCandidateScore` component: a rank score (`1 - (rank-1)/10`)
multiplied by the narrative term coverage of the model's reason. It is blended
into `finalScore` through `narrativeCandidateWeight` (0.28), outside the
documented `weights` table, exactly like `identifiedWorkWeight`, so the fourteen
documented weights still sum to 1. The component also joins `convergenceScore`
and the deterministic tie-break order.

## Latency

The proposal call is launched in parallel with `interpretSearchQuery`, so the
recovered recall costs no extra wall-clock latency on the critical path. Exactly
one extra model request per search, never one per candidate.

## Rollback and telemetry

`LLM_CANDIDATE_CHANNEL_ENABLED=false` is an exact rollback: the channel is never
scheduled and the pool is identical to Phase 14. With no proposal, or an empty
one, the channel is inert by construction.

Observability stays bounded and label-only (`narrativeCandidatePath`,
`narrativeCandidateProvider`, `narrativeCandidateReason`,
`narrativeCandidateProposedCount`, `narrativeCandidateResolvedCount`, plus the
`retrievalLlmCandidatesCount` source counter). No proposed title, provider text
or user query is ever stored.

## Files

- new `src/search/narrativeCandidateInterpreter.js`
- `requestProviderJson`, `runProviderCascade`, `parseJsonObject` and
  `normalizeMediaType` extracted and exported from `semanticInterpreter.js`
- `pickBestTitleHit` and `resolveNarrativeCandidates` in `retrievalServices.js`
- `llm_candidates` source, `RETRIEVAL_LIMITS.llmCandidates` (6) and the
  `retrievalLlmCandidatesCount` counter in `hybridRetriever.js`
- `narrativeCandidateScore` and its weight in `searchRanker.js`
- `recordNarrativeCandidateChannel` in `api/searchPhase0.js`, wiring in `api/search.js`

Frontend, payment, auth, PWA and monetisation are untouched.

## Focused validation

```sh
node --test --import tsx tests/search/narrativeCandidateChannel.test.mjs
node --test --import tsx tests/search/
npm run search:recall
```
