# Phase 19 — Compositional relevance: reward the intersection of the criteria

Reported live: a rich request was understood concept by concept, but the grid
still let candidates that answered *one* of its concepts rival the ones that
answered all of them.

Example: `film de guerre moderne avec des scènes de dog fight` — a candidate
carried only by "aviation" could compete with a candidate that is a war film,
contemporary, with military aviation and dogfights.

## What changed

### 1. A typed ledger of independent signals

`src/search/signalLedger.js` groups the evidence the ranker already computes
into independent *families*: format, genre, era, origin, people, reference,
themes, mood, narrative, style, relation and comparative preference. The
families a request does not describe are simply absent, so nothing is invented
and no signal is dropped: every dimension the interpreter wrote survives to the
ranking.

### 2. Intersection instead of a plain average

From those families the ledger derives:

```
coverage     = weighted mean of the family scores          (historical behaviour)
intersection = weighted geometric mean of the family scores (conjunction)
composition  = coverage * (1 - w) + intersection * w       (w = 0.38, >= 2 families)
```

The geometric mean grows with every additional family answered and collapses
when one described family is left unanswered, which is exactly the reported
defect: answering four independent criteria now scores clearly above answering
one of them very well.

### 3. Bounded penalty for partial matches

`satisfiedShare` measures the weighted share of described families actually
answered (from 0.35 upwards). From three described families on, a candidate
that only answers part of the request loses up to 24 % of its answer score.
Nothing is filtered: the penalty is a bounded factor, and a request that
describes one or two families keeps its historical ranking exactly.

### 4. Soft constraints by meaning, not by query

- period words now work in **both directions**: `moderne / récent / contemporain`
  and `ancien / vieux / d'époque / classique` are the same graded preference read
  with opposite signs (`temporalDirection`);
- `lent / contemplatif / posé` and `rythmé / rapide / nerveux` are the two ends
  of the pace dimension the engine already measures;
- `réaliste / crédible / faits réels / documentaire` and `moins réaliste /
  onirique / surréaliste` are the two ends of an anchoring-in-reality measure.

### 5. Recall of the relevant but less popular title

`mergeCandidates` breaks entry ties into the bounded pool on *specific
retrieval evidence* (keyword-restricted Discover, person credit, vector
neighbour, narrative coverage) before the popularity ordering of a broad
source. A title the request really describes no longer loses its last seat to a
titleranked higher in a generic list. Multi-source agreement and provenance
still come first, so the historical admission order is untouched when there is
no specific evidence.

### 6. Stylistic requests have their own family

Concepts that describe staging rather than plot (`néo-noir`, `réaliste`,
`minimaliste`, `slow burn`, `documentaire`...) are measured in a style family
instead of being forgiven by the narrative ones. The vocabulary is generic: no
title, no identifier, no year, no per-query rule.

## What did not change

LLM-first architecture, hybrid retrieval, embeddings, strict filter and
diversification are untouched. The documented weight table is untouched: the
composition enters as an explicit, bounded share of the answer score.

## Validation

- `node --import tsx --test tests/search` — 493 tests pass, including the 11 new
  compositional cases (multi-criteria, exclusions, comparatives, temporality,
  mood, narrative, reference titles, people, style, recall admission);
- `npm run search:benchmark` — top1 1.000, MRR 1.000, coverage 0.969,
  off-topic 0.053: unchanged;
- `npm run search:recall` — retrieval recall non-regression on the recorded
  corpus;
- live endpoint tested on war/aviation, psychological thriller/heist, vintage
  war and TV investigation requests before validating.
