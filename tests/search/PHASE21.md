# Phase 21 — The historical match ladder, restored

Reported live: "the match percentages are still globally very low; during the
project I had found the right balance before the search engine changed."

## What the measurement showed

One real request was replayed on the published endpoint
(`film de guerre moderne avec des scènes de dog fight`):

| Rank | Work | Displayed before | Computed `finalScore` |
| --- | --- | --- | --- |
| 1 | Top Gun : Maverick | 99 | ~0.95 |
| 2 | Baron Rouge | 73 | ~0.69 |
| 3 | Flyboys | 70 | ~0.66 |
| 4 | Les Chevaliers du ciel | 62 | ~0.58 |
| 5 | Land of Bad | 56 | ~0.51 |
| 6 | Furtif | 50 | ~0.45 |
| 7 | Top Gun (1986) | 46 | ~0.41 |

The ordering was right and the computed scores were well spread; only the
displayed ladder was low. The cause was historical, not a regression: the
unified engine (Phase 8) replaced the historical public score by
`round(finalScore * 100)`, and Phases 16-18 then re-fitted a *saturating* curve
on top of it. Saturation spreads the ladder, but it also drags the whole useful
band down: with `saturation 0.98, gamma 0.88`, the range the engine really
reaches (0.35-0.75) is displayed between 40 and 78.

## The ladder that was in place before

The pre-unified engine read a work on two axes and displayed
`min(99, max(25, round(0.70 * narrativeScore + 0.30 * genreScore + qualityDelta)))`.
Its bands were: a partial answer ~54-62, a solid answer ~67-91, a narrative
match ~84-98, an archetype 93-99, and nothing real below ~25.

## What changed

`ELICINE_RANKING_CONFIG.publicMatch` is now the historical ladder expressed as
anchor points on the computed score of the current engine, interpolated
linearly between them:

```
finalScore  0.00 0.15 0.25 0.35 0.45 0.55 0.65 0.75 0.85 0.92 0.98 1.00
displayed     0   25   48   64   76   84   90   94   96   98   99   99
```

- pure, monotone and bounded: no per-title, per-year or relative value is ever
  hardcoded, and the same `finalScore` always displays the same percentage;
- the exceptional band (95-99) still requires a converged answer: a bare
  category answered by a strong work reads 93, a described multi-signal request
  reads 98-99;
- a work answering nothing stays under the partial band (measured: 9), so
  strength still never substitutes for the request.

Nothing else moved. Weights, retrieval, the strict filter, the LLM
interpretation, the narrative channel and the diversification are untouched:
the ordering is identical, only the displayed percentage is re-read.

## Measured after the change

The same live grid now reads **95, 83, 82, 77, 68, 62** — the ordering is
unchanged, the tail gains 27 points, and the top keeps its lead.

Corpus fixtures, before → after:

| Case | `finalScore` | Before | After |
| --- | --- | --- | --- |
| bare category, strong work | 0.722 | 81 | 93 |
| bare category, weak work | 0.506 | 57 | 80 |
| described multi-signal request | 1.000 | 99 | 99 |
| strong work answering nothing | 0.054 | 5 | 9 |

## A second defect, found while measuring

The live replay exposed a blocking bug that had nothing to do with the curve:
`api/search.js` counted the media **format** among the advanced filters
reserved for Pass Pro. The server derives that format from the wording of the
request ("film" → Films, "série" → Séries TV) and the client sends back what it
just derived, so any free search containing the word "film" or "série" was
rejected with `403 PRO_REQUIRED` — while the very same request without the
format field answered in 200. Measured:

| Request | Result |
| --- | --- |
| `un film d'action des années 90`, `mediaType: Tous` | 200, 12 results |
| `un film d'action des années 90`, `mediaType: Films` | **403 PRO_REQUIRED** |

The rating floor and the platform filter still require Pass Pro, and are still
tested as such; the format is again free for everyone.

## Validation

- `node --import tsx --test tests/search` — 505 tests pass;
- `npm run search:benchmark` — top1 1.000, MRR 1.000, coverage 0.969,
  off-topic 0.053, identical to Phase 18: the ranking did not move;
- the ladder itself is locked by `tests/search/scoreCalibration.test.mjs`
  ("the public ladder is the historical one, restored") so it cannot silently
  drift again.
