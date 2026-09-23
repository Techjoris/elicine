# Phase 20 — Multi-concept retrieval recall

Reported live after Phase 19: the engine understood a multi-concept request, but
candidates that answer several of its dimensions never reached the pool.

Example: `film de guerre moderne avec des scènes de dog fight` returned the
aviation landmarks, but *Furtif / Stealth* — a contemporary film about stealth
fighter jets, aerial combat and military technology — never appeared.

## What the measurement showed

Replaying the real provider (through the production TMDB proxy) with the local
retrieval code, before the change:

| Finding | Evidence |
| --- | --- |
| Only 3 of the 5 resolved concepts were kept | `RETRIEVAL_LIMITS.keywordIds = 3`, so `aerial combat` and `air force` were resolved and then dropped |
| The two AND angles were empty | `dogfight` + `military aviation` and `aerial combat` + `fighter pilots` co-occur in no work |
| Every angle carried `with_genres=War` | *Furtif* is tagged Science-Fiction, so `discover` could never return it |
| The only productive angle was popularity-ordered, page 1 | the pool held 8 works, all 1927-1984 aviation classics |
| A concept that looked redundant locally was never queried | `fighter pilots` is a variant of `military aviation` in the lexicon, but `fighter pilot` is the keyword Top Gun: Maverick actually carries |

## What changed (retrieval only)

1. **All resolved concepts participate** (`keywordIds` 3 → 8) in the
   disjunctive angle: the provider lookups were already performed, the ids were
   simply truncated.
2. **Provider wordings are interleaved by concept** (up to 16), so every
   described concept contributes its own formulations before the variants of
   the first one.
3. **A complementary concept pair** is queried in addition to the two
   historical anchors.
4. **One genre-free angle** keeps the concept intersection reachable outside the
   declared genre - the ranking still weighs the genre family, nothing is
   assumed.
5. **The concept angle paginates** (pages 1-3 when the budget allows): a work
   that answers several concepts but is far less popular than the genre
   landmarks is frequently on page 2 or 3.
6. **The release-date angle** of a modern request now carries the whole concept
   set in disjunction instead of an intersection that is usually empty.
7. **Complementary angles are additive by construction**: admission fills the
   seats the historical angles leave, in their own order, so the recorded pool
   composition and its pre-ranking positions are preserved while the extra
   candidates still reach the ranking.

Every angle is bounded by the existing 30-call request budget (`remainingBudget`
guards), derived only from the canonical intent, and never names a work.

## Live validation (local code, real provider data)

`film de guerre moderne avec des scènes de dog fight`, movie:

| | Before | After |
| --- | --- | --- |
| pool | 8 works, all pre-1985 aviation classics | 50 works |
| *Top Gun : Maverick* | absent | in the pool |
| *Furtif / Stealth* | absent | in the pool (page 3 of the concept angle) |
| TMDB calls / errors | 13 / 0 | 24 / 0 (budget 30) |

Two other domains were checked the same way and both keep a full pool with no
error: horror/possession (50 candidates, *The Exorcist* among them) and a TV
cold-case request (50 candidates, all detective/cold-case series).

## Validation

- `node --import tsx --test tests/search` — 504 tests pass, including the 10 new
  multi-concept recall cases (war/aviation, horror/possession, sci-fi/AI,
  comedy/road trip, TV crime/cold case, romance/memory) and the recorded
  retrieval corpus (extended with the live responses of the new requests,
  existing entries untouched);
- `npm run search:benchmark` — top1 1.000, MRR 1.000, coverage 0.969,
  off-topic 0.053: unchanged;
- `npm run search:recall` — no regression on the recorded corpus;
- `npm run build` and the alerts / Prochainement / history / supporter suites:
  green.
