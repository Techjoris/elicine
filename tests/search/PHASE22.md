# Phase 22 — User preferences, and proposals that follow them

Requested: "the Éliciné system should record user preferences so it can make
adapted proposals on their next searches."

## What is recorded, and how

Two kinds of evidence, both tied to the account:

| Evidence | Weight | Where it comes from |
| --- | --- | --- |
| A search | 1 | the canonical intent the interpreter already produced (genres, themes, moods, language, format) |
| A release alert | 2.5 | the work the member asked to follow |
| A work kept in "Ma liste" | 3 | the deliberate act of saving a work |

Saving a work weighs more than searching for it, because it is an explicit act
rather than a description. Every new signal fades the previous ones
(`PROFILE_DECAY`), so tastes are allowed to change, and a profile saturates
after `MAX_SIGNALS` so an early heavy user does not lock the ranking.

Only counters are stored, per genre, theme, mood, language and media type. No
title, no query text, no identifier beyond the account id.

## Where it lives

`public.user_preference_profile`, one row per account, in
`supabase/SETUP_4_PREFERENCES.sql` (and section 11 of `APPLY_SUPABASE_SETUP.sql`).
Row-level security mirrors the search history: a member reads, writes and
deletes only their own row; the service role keeps full access.

The feature is written to survive a missing table: every read and write goes
through `api/_preferences.js`, which returns an empty profile on any failure.
Running the SQL is therefore a deployment step, not a prerequisite for the app
to work.

## How it changes the proposals

`api/search.js` loads the profile once per search and hands it to the
orchestration, which forwards it to the ranker as `userProfile`.

Personalisation is the **last and bounded** layer of the score:

```
finalScore = <historical composition> + personalizationBonus
personalizationBonus = 0.05 * profileStrength * personalizationScore(candidate, profile)
```

- it is capped at `PERSONALIZATION_WEIGHT` (5 % of the computed score), and the
  cap is applied before anything else: a taste can reorder near-equal
  candidates, never overtake relevance;
- it only weighs a candidate that already passed the strict filter;
- `personalizationScore` only counts the families the profile actually knows
  about, and a family the member never expressed does not participate;
- with no profile, `personalizationBonus` is exactly `0` and the score is
  byte-for-byte the historical one — asserted by a test.

The inspirations shown under the results (`suggestedPrompts`) are drawn from the
member's strongest genres, in the format they actually watch (film or series),
and fall back to the generic wording for a thin profile.

## Client

`src/services/preferenceService.ts` sends the signal when a member keeps a work
in "Ma liste" or follows its release. The call is fire-and-forget: no spinner,
no toast, no error surface, and nothing at all without an identified account.

## API

| Route | Effect |
| --- | --- |
| `GET /api/preferences` | the caller's profile, empty for a visitor |
| `POST /api/preferences` | records `{ signal: { kind }, work: { genreIds, mediaType, … } }` |

Both answer `200` for a visitor and record nothing, so the endpoint never leaks
that an account exists and never stores anything unauthenticated.

The route is a rewrite onto the existing search function
(`/api/preferences` → `/api/search?action=preferences`), the same pattern the
project already uses for `/api/tmdb` and `/api/geo`: a serverless plan counts
the functions deployed, so the feature adds none.

## Validation

- `node --import tsx --test tests/search` — 524 tests pass, including 16 new
  ones covering the aggregation, the decay, the bound, the malformed input, the
  personalised inspirations and the "no profile, no change" guarantee;
- `npm run search:benchmark` — top1 1.000, MRR 1.000, coverage 0.969,
  off-topic 0.053: the ranking is unchanged without a profile;
- `npm run build` — TypeScript and Vite production build pass.

## Deployment note

Run `supabase/SETUP_4_PREFERENCES.sql` in the Supabase SQL editor once. Until
then the app works exactly as before; preferences simply are not stored.
