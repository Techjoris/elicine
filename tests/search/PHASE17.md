# Phase 17 — The public score reflects the real match level

Reported live after Phase 16: "the match percentages still do not correspond to
the real match level of the films".

## What the live grids showed

The published percentages were flat where the answers were not. Measured on the
production endpoint (`/api/search`, results captured and replayed locally):

- `un film d'horreur`: 19 results between 95 and 100, from `Shining`
  (8.2/19 395 votes) to `The Last Kiss` (6.4/12 votes) and `Twin`-era
  direct-to-video 2026 titles;
- `film de guerre moderne avec des avions de combat`: `Top Gun : Maverick` 81,
  then 69, 68, 57, 47, 36 - a 45-point band for a grid whose real relevance spans
  much more;
- `Top Gun` (1986) at 47 while a generic aviation film sat at 69.

The cause was structural, not cosmetic: the computed score was the weighted
average of the components the request activates, normalised by that same
subset. A request that only names a category therefore activated one real
dimension (the genre), worth ~1 for every member of the category, and the
displayed percentage could not separate a landmark from an unseen title.

## The model

The score is now the product of the two things a percentage is read as:

```
finalScore = answerScore * (1 - convergenceWeight) + convergenceScore * convergenceWeight
           + identifiedWorkBonus + narrativeCandidateBonus + temporalAdjustment

answerScore      = coverage * strengthFactor
coverage         = weighted average over the intent components the request makes
                   meaningful (semantics, genre, theme, mood, keyword, reference,
                   person, title, year, language, country) - the documented weights,
                   unchanged, and the historical `intentScore`
strengthFactor   = floor + (1 - floor) * strength
strength         = 0.65 * qualityScore + 0.15 * voteConfidenceScore
                 + 0.10 * popularityScore + 0.10 * sourceConfidenceScore
floor            = 0.15 (bare category) .. 0.85 (described request)
matchScore       = round(100 * clamp(finalScore / 0.9))
```

- `voteConfidenceScore` (`log1p(votes)/log1p(5000)`) is new: an average over a
  handful of votes and the same average over twenty thousand are not the same
  answer, which the Bayesian quality alone says too weakly.
- The floor is derived from the request: it counts the describing dimensions
  (concepts, keywords, hard constraints, named works), never a title, a year or
  a genre. A bare category lets the strength of the work decide, a described
  request keeps content coverage dominant.
- The temporal preference of Phase 16 now weighs `0.12` on this scale, so a very
  old work loses about fifteen displayed points on a modern request while a
  contemporary one gains them.
- Because the two factors multiply, a famous work that answers nothing stays
  low and a work carried by a bare genre tag cannot display an excellent match
  on its own. Nothing is filtered: ordering, retrieval, embeddings, LLM
  interpretation, narrative candidates and diversification are untouched.

## Measured, on the captured live grids

| Grid | Before | After |
| --- | --- | --- |
| `un film d'horreur` | 95-100 (19 results) | 63-92 (Shining 91, The Thing 89, Exorciste 85, unseen 2026 titles 63-75) |
| `film de guerre des années 1940 avec des avions` | 97-100 | era-correct works 74-85, weak evidence 13-31 |
| `film récent d'aviation militaire` | 69-100 | coverage-driven 42-80 in the replay; the live values are published in the delivery report |

Quality corpus (18 cases, `npm run search:benchmark`): top1 1.000, coverage
0.941, off-topic 0.053 - unchanged, and the intended works display 90-100.

## Files

- `src/search/searchRanker.js`: `voteConfidenceScore`, `intentSpecificity`,
  `answerStrengthScore`, `answerScore`, `publicMatch`, `publicMatchScore`
- `tests/search/scoreCalibration.test.mjs` (new),
  `tests/search/temporalRelevance.test.mjs`, `tests/search/phase11.2.test.mjs`
