# Phase 16 — Temporal relevance and public score calibration

Two live phenomena, two corrections, one layer touched: the ranking.

## Why

`film de guerre moderne avec des avions de combat` returned, in live, a 1927
work and a 1930 work around a 2022 one: "moderne" existed only as a narrative
concept (`modern warfare`), so the engine ranked the period as content and never
preferred a contemporary work over a silent-era one.

The displayed percentages were compressed as well: the strongest grid of the
engine spanned 48 to 69, so an excellent match did not stand out from an average
one. The public curve (`floor 22, spread 78, saturation 1, gamma 1.15`) mapped the
computed range the engine really reaches (roughly 0.35 to 0.75) into a narrow
middle band.

## A. Temporal preference

`src/search/searchRanker.js` derives, from the request itself, whether it asks
for a contemporary work, then applies a **graded** preference:

- the wording channel and the concept channel are both read with one bilingual
  list (`moderne`, `modern`, `récent`, `contemporain`, `actuel`, `de nos jours`,
  `21e siècle`...). The interpreter writes concepts in English, the user writes
  in French; either carries the intent;
- the request is carried to the ranker by `orchestrateSearch`
  (`userQuery`) and passed as `queryText`, so a wording the interpreter did not
  turn into a concept is still honoured. Retrieval never reads it;
- the preference is a ramp over the release year (`horizonYears: 45`, reference
  year = current year): 1 for a work released this year, 0 at the horizon and
  below, nothing for an undated work;
- it moves the computed score by a bounded symmetric amount
  (`temporalPreference.weight: 0.07`): what a contemporary work gains, a very old
  work loses. Nothing is filtered, nothing is hardcoded per title or per year.

Explicit year bounds always win: when the request names its period (or the
interpreter emits `year_min`/`year_max`, as it does for "années 1940"), the
derived preference stays inert and the era keeps its own works.

## B. Public score calibration

`publicMatch` becomes `floor 0, spread 100, saturation 0.8, gamma 1`: the top of
the computed range is saturated, so the whole useful band is spread over the
documented ladder instead of being flattened. The score remains
`round(100 * clamp(finalScore / 0.8))` - a pure calibration of the real
`finalScore`, no per-title value, no relative normalisation.

Measured on the live computed scores of the reported request (recovered from the
published percentages): the grid now spans ~46 % to ~93 % instead of 48 % to 69 %.

## C. Files

- `src/search/searchRanker.js`: `contemporaryAffinity`, `recencyFit`,
  `temporalScore`, `temporalAdjustment`, `publicMatch`, tie-break
- `src/search/searchOrchestrator.js`: `userQuery` on the orchestration result,
  `queryText` passed to the ranker
- `api/search.js`, `scripts/search-diagnose.mjs`: same option on the fallback and
  diagnostic ranking calls
- `tests/search/temporalRelevance.test.mjs` (new), `tests/search/resultBudget.test.mjs`

Retrieval, embeddings, LLM interpretation, narrative candidate channel and
diversification are untouched: the temporal preference is applied inside the
existing ranking blend.

## D. Validation

```sh
node --test --import tsx tests/search/temporalRelevance.test.mjs
node --test --import tsx tests/
npm run search:benchmark
npm run search:recall
npm run build
```
