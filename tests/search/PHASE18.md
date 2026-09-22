# Phase 18 — Relations, convergence and public match calibration

Live feedback after Phase 17: the engine was relevant, but a nearly perfect
result could still display 45-55 %, abstract searches kept a few intruders, and
multi-signal matches were not clearly separated from a single-genre match.

## A. Narrative relations and soft comparatives

`src/search/rankingPreferences.js` is now part of the deterministic ranker:

- a relation is a **joint** narrative connection measured on the candidate's
  overview, structured concepts and verified proposal reason, never a second
  bag-of-words average;
- a compound concept keeps its granularity ("shared dreams" is not answered by
  "dreams");
- comparatives are read relative to the work the query cites: more recent, more
  action, darker, less violent. They remain bounded preferences, never filters;
- soft preferences act through bounded factors, so the pool is not pruned.

## B. Convergence

Convergence is graded: four signals barely above the floor no longer count as
four fully answered signals. The evidence list now includes relation,
preference and temporal signals in addition to theme, mood, keyword, genre,
entity, reference, title and the narrative candidate. A bounded floor lets a
genuinely converged candidate reach the exceptional band even when one
metadata channel is sparse; it is gated by how much the request describes, so a
bare category cannot use it.

## C. Public match calibration

The public curve is still a pure, monotone function of `finalScore`:

```
matchScore = round(99 * clamp(finalScore / 0.98) ** 0.88)
```

The documented ladder now follows the product targets: exceptional 95-99,
excellent 85-94, very good 70-84, average 50-69, weak under 50. The top is
capped at 99, and no title, year or catalogue identifier is hardcoded.

A coherent verified proposal whose reason really carries the requested
concepts fills a sparse overview; an incoherent one stays low. That is what
lets a nearly perfect live result reach 95-99 instead of staying at 45-55.

## D. Validation

- `node --import tsx --test tests/search` — 482 tests pass;
- `npm run search:benchmark` — top1 1.000, MRR 1.000, coverage 0.969,
  off-topic 0.053;
- `npm run search:recall` — retrieval recall non-regression on the recorded live
  corpus;
- `npm run build` — TypeScript and Vite production build pass.
