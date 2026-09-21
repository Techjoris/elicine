# Phase 11 — Search quality evaluation harness

Phase 11 adds an opt-in evaluation trace without changing retrieval, strict
filtering, ranking weights, diversification or embeddings. A trace exists only
when a test or the manual diagnostic command passes `evaluationTrace` in the
request-scoped context. Normal production searches do not create or log it.
`SEARCH_EVALUATION_ENABLED=true` is required when explicitly running the trace
under `NODE_ENV=production`.

The trace captures CanonicalIntent, semantic expansion and resolved keyword
IDs, ResolvedIntentContext, bounded per-source metrics, pools before and after
deduplication, the strict-filter output, Phase 8 score components, the Phase 9
order and final candidates. It stores candidate identities and fixed error
labels, never provider exceptions, secrets, vectors or a raw query.

`quality-phase11.json` contains twenty structural cases. The deterministic
suite measures Recall@5, Recall@10, MRR, constraint violation rate, unrelated
pool overlap and empty-result rate. Fixtures and live diagnostics are strictly
separate; CI never calls TMDB, Supabase or an embedding provider.

Manual live diagnosis:

```sh
npm run search:diagnose -- "film de guerre moderne avec des avions de combat"
```

The command reads locally configured environment variables, prints no secret,
makes no LLM call, and reports unavailable providers explicitly. Its local
intent inference is diagnostic-only and is not part of the production engine.

Focused validation:

```sh
node --test tests/search/phase11.test.mjs
```
