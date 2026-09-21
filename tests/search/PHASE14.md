# Phase 14 - Result budget: best matches instead of a filled grid

Phase 14 makes the canonical pipeline decide *how many* works a search should
return. `src/search/resultBudget.js` is the last stage of the local pipeline:

```
hybrid retrieval -> strict filter -> ranking -> diversification -> result budget
```

The interpreted intent type separates the two shapes of a request:

- `identification` (`specific_title_description`, and `person_search` only when
  the query also describes the work itself): the user describes ONE work;
- `selection` (theme, mood, constraint, similar-to-title, mixed): the user wants
  several works.

Each shape maps to a bucket with a documented window (`target` = largest grid,
`minKeep` = smallest answer it tries to reach):

| bucket | target | minKeep | relative floor |
| --- | --- | --- | --- |
| identification_confident | 1 | 1 | - |
| identification_ambiguous | 3 | 2 | 0.45 |
| precise_recommendation | 10 | 6 | 0.40 |
| similar_to_title | 12 | 8 | 0.35 |
| normal_recommendation | 12 | 10 | 0.30 |
| broad_discovery | 20 | 12 | 0.25 |

A work is only returned alone when the ranking evidence is unambiguous:
`IDENTIFICATION_CONFIDENCE` requires a strong top convergence (0.55) with no
comparable runner-up (1.35 score margin, or a runner-up convergence below 0.45).
Otherwise the answer keeps 2-3 plausible works.

The grid is never padded. The relative floor cuts the long tail under the best
score and everything below it is dropped rather than used to fill the grid:
`minKeep` is the size a bucket aims at, never a floor it forces, so a short
honest answer wins over a filled grid. An unranked pool (legacy hints or direct
TMDB resolution) is only capped at the bucket target. The rule is identical for
films and for series, and no title is ever hardcoded.

Phase 14 also calibrates the displayed percentage. `convergenceScore` rewards
candidates supported by several independent strong signals (entity, reference,
title, theme, keyword, mood, genre, semantic) plus source breadth, and is
blended into `finalScore` through an explicit `convergenceWeight` (0.095) so the
documented `weights` stay untouched and still sum to 1. `publicMatchScore` is a
pure monotone curve over `finalScore` (floor 22, saturation 0.8, gamma 1.15):
close candidates no longer display an artificial plateau, and a stronger match
always displays a stronger score.

`RESULT_BUDGET_ENABLED=false` is an exact rollback: the ranked pool is returned
unchanged. Observability stays bounded (`resultBudgetApplied`, shape, bucket,
target, `minKeep`, input and output counts).

Focused validation:

```sh
node --test --import tsx tests/search/resultBudget.test.mjs
```
