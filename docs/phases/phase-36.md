# Phase 36: Tutorial & Onboarding

**Stage 4 — Content Production**
Output: `entities/Tutorial.ts`, `content/tutorial.ts`, `progression/tutorial.ts`,
`ui/Tutorial.svelte`, save schema 7, `tests/tutorial.test.ts`

## Checklist

- [x] Light-touch tutorial introducing formation, support units and the Almanac
      in sequence
- [x] Contextual first-time cards rather than a forced tutorial
- [x] Existing saves opted out, rather than greeted like new ones
- [ ] **Playtest with new users** — see "What is not done" below

## The shape

Nine cards, each attached to the moment its system becomes *relevant* rather
than to a step counter. The full table lives in `game-loop.md`, "Onboarding";
what matters here is why it is built this way.

PLAN.md asks for "contextual tooltips/first-time popups rather than a forced
tutorial", and economy-spec.md §3 already sets the pace for the reveals: a
first-time player meets **one progression system at a time**. Those are the same
requirement stated twice, so onboarding rides the reveals rather than running
ahead of them — the Almanac card fires on the boss clear that reveals the
Almanac, not before it.

The module split is the one the achievements system already uses, because the
problems are the same shape:

| Layer | File | Owns |
|-------|------|------|
| Type | `entities/Tutorial.ts` | what a trigger may look at |
| Content | `content/tutorial.ts` | the nine steps and their copy |
| Rule | `progression/tutorial.ts` | which card is due, and marking it seen |
| View | `ui/Tutorial.svelte` | a card in the corner |

Nothing in the component decides when a card appears. A rule living in a
template is a rule nothing can test, and the interesting assertions here are all
about *when*.

## Three rules, enforced rather than authored

**At most one card per moment.** `evaluate` returns a single step — the first in
authored order whose trigger passes — so order in `content/tutorial.ts` *is* the
sequence. Late in a first run, one stage clear can satisfy four triggers at
once; four cards at once is the forced tutorial this phase rules out, and it
teaches none of the four. The rest keep and arrive at the following clears.

**A card waits for its system to be reachable.** The formation card does not
fire until the next slot is affordable, because a card telling you to spend
Salvage you do not have is a card about being poor. The two reveal gates are
read from `progression/` rather than from the store, which widens both in a dev
build — a card announcing the Almanac to a player who cannot reach it would be
worse than no card.

**Nothing blocks.** No dimming, no focus steal, no paused wave, no next button.
The Flare stays clickable underneath the card explaining the Flare, which is the
one thing that card must not get wrong.

## Existing saves

Schema 6 → 7 adds `meta.tutorialSeen`, and the interesting part is what it is
seeded with: **a save that has cleared anything is marked as having seen every
step.** Without that, everyone currently playing is met on their next load by a
card explaining what Salvage is, then one explaining the panel they have had
open all evening.

The condition is `clearedStages` rather than playtime because it is the one
signal that cannot be produced by leaving the game open on a menu. A save that
has genuinely never cleared a stage keeps the sequence — they are mid-onboarding
whether or not the tutorial existed when they started.

The migration carries its own literal list of ids rather than importing from
content, following the rule the migrations file already sets: a migration speaks
the vocabulary of the version it produces. If a later phase adds a tenth card, a
save migrated by *this* step has not seen it, and will be shown it once — which
is correct for a genuinely new system.

## Traced through a real first run

Where the cards actually land, played by the deliberately poor player Phase 35
built (cheapest useful thing, always — so this is a floor; a real player arrives
sooner, never later):

```
stage  0    0 min  standing-watch
stage  1    1 min  the-flare
stage  2    2 min  the-formation
stage  3    4 min  clearance
stage  4    5 min  the-arrays
stage  5    6 min  the-ladder

run ended at stage 7 after 8 min; 7 cleared
```

One card per stage, in order, across the first six minutes. Nothing piles up and
nothing arrives before the thing it describes exists.

Two cards are missing from that trace and both are correct. `conjunction` fires
on its own moment, which the stage-level trace cannot see — a separate test
plays the opening stage with the granted formation and confirms an alignment of
two actually happens, so the card is reachable rather than dead content.
`the-almanac` and `the-rewind` are gated on the first boss clear at stage 8,
which this run did not reach; they arrive in the second run, which is exactly
what economy-spec.md §3 asks for.

The trace is a test (`tests/tutorial.test.ts`, "a first run, traced") rather
than a one-off measurement, so pacing that regresses fails CI: no two cards at
one stage, authored order preserved, formation and Arrays both taught inside the
opening run.

## What is not done

**Playtesting with new users.** PLAN.md asks for it and it has not happened —
nobody new has played this. The trace above answers the half of that question a
harness can answer: whether the cards arrive spread out, in order, and after the
thing they describe exists. It cannot answer whether the copy lands, whether
nine cards is two too many, or whether anyone reads them at all. Those need
people, and the checklist item stays open until they have been in front of it.

The likely findings are worth writing down before they are contradicted:

- **Card 2 (The Flare) may be too late.** It fires on the first clear, so a
  player who wanted to click something spent the whole first stage not knowing
  they could. Moving it to the first *wave* clear is a one-line change if
  someone reports it.
- **Nine may be too many.** Cards 5 and 6 (Clearance, The Arrays) land a minute
  apart and are both about spending the same currency in the same panel. They
  are the first candidates to merge.
- **Nothing re-opens a dismissed card.** A player who dismisses one by reflex
  cannot get it back. Phase 43's settings screen is the natural home for a
  "replay onboarding" control, and `skipTutorial` already has the inverse.
