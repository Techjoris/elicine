# Phase 13 - LLM-first semantic interpretation

Phase 13 makes the LLM the primary interpreter of a user query. The runtime
path is now:

```
raw query -> one LLM call -> structured semantic intent
          -> CanonicalIntent + SemanticIntentContext
          -> people/title resolution -> semantic expansion
          -> hybrid retrieval -> strict filter -> ranking -> diversification
```

`src/search/semanticInterpreter.js` owns the system prompt, the compact JSON
contract and the provider cascade. DeepSeek is the primary provider
(`DEEPSEEK_MODEL`, default `deepseek-chat`); Groq, Qwen, Gemini and OpenAI are
provider fallbacks only. Exactly one interpretation call is made per attempt,
never one call per candidate.

`src/search/semanticIntentContext.js` carries the semantic layers the
interpreter extracts (people, directors, actors, semantic concepts, narrative
motifs, style references, negative concepts, intent type) alongside
CanonicalIntent, without widening the canonical contract. Only allowlisted
negative concepts and bounded, normalized strings are kept; the raw query is
never stored.

The no-LLM catalogue (`buildHeuristicInterpretation`) is a strict fallback. It
runs only when every provider is unusable, with one fixed reason:
`timeout`, `provider_error`, `invalid_response` or `unavailable`. A valid
interpretation is never completed by heuristic signals:
`recoverFallbackSignals` is now gated on the fallback path.

Observability is bounded: `semanticInterpreterPath`
(`deepseek | provider_fallback | heuristic_fallback`), the provider id, the
reason and a partial flag are recorded in telemetry and persisted in
`public.search_telemetry` (`interpreter_path`, `interpreter_reason`). A
database without the migration keeps writing its base row.

Focused validation:

```sh
node --test --import tsx tests/search/semanticInterpreter.test.mjs
```