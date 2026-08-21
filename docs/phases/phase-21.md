# Phase 21: Resource Collection & Currency System

**Stage 3 — Progression Systems** (first phase)
Output: `content/economy.ts`, `progression/currencies.ts`, currency counters and
gain feedback in `ui/HUD.svelte`, `tests/currencies.test.ts`

## Checklist

- [x] Enemy and wave drops feeding the main currency
- [x] Secondary currencies with distinct sources
- [x] Currency UI — counters and gain feedback in `ui/HUD.svelte`

## Three currencies, no overlap

economy-spec.md §1 is emphatic: if two currencies ever bought the same thing,
one would be redundant. The implementation keeps the sources apart too.

| | Source | Scope | Sinks |
|---|---|---|---|
| **Filings** | Slack destroyed | this run only | slots, mounts, repairs, reinforcements |
| **Recollection** | Rewinding | permanent | the Escapement Tree (Phase 22) |
| **Keys** | *First* clears only | permanent | roster unlocks (Phase 24) |

Tests assert the separation directly: earning and spending Filings leaves the
permanent currencies untouched, and a stage clear leaves Filings untouched.

## Where the rules live

Everything in `progression/currencies.ts` is a **pure function of the save plus
its arguments**. The simulation never reaches in, and `core/bootstrap.ts` is the
one place a tick's events become a currency change.

That seam is what keeps the economy testable without a running field, and keeps
`systems/` free of save-shaped state. It also means the whole of this phase is
covered by 34 tests that never start a Simulation.

## Two duplicated constants, removed

The zone drop scaling (`0.35`) was written inline in `systems/combat.ts`, and
the repair curve (`40`, `1.5`) sat as **default parameters** on
`Mainspring.repairCost` — while balancing.csv owned both. Exactly the drift
CLAUDE.md's convention exists to prevent, and the third instance of it this
project has found.

`repairCost` moved out of the entity entirely, joining the other three Filings
sinks in `currencies.ts`. Leaving it in `entities/` and importing
`content/economy.ts` would have fixed the duplication by inverting the layering
— `content/` declares *against* `entities/`, so the dependency cannot run the
other way.

## Keys cannot be farmed

First-clear only, and `applyStageClear` is **idempotent by construction**: the
second call finds the address already in `clearedStages` and awards nothing. A
clear event that fires twice — a doubled event, a reload mid-transition — must
not double-pay.

`clearReward` reports what *would* be awarded without granting it, so the UI can
quote a number before the stage ends without the quote itself paying out.

This is the property Phase 29's roster balance depends on: Keys measure how much
content a player has *seen*, which makes the unlock curve authored rather than
grindable.

## The zero-award guard, derived not authored

economy-spec.md §1 requires a Rewind that would grant nothing to be blocked with
an explanation of the threshold — a player must never burn a run for nothing.

`minimumRewindDepth()` finds that threshold by searching the award formula
rather than declaring a second constant beside it. A hand-written threshold
would be a number that could disagree with the formula it describes, and the
whole point is to explain the formula accurately.

## A coincidence worth recording

Ten Movement slots cost **1179** Filings. A full pass of zone 1 yields **1175**.

Those two numbers were authored two stages apart — the cost curve in Phase 6,
the wave densities in Phases 17 and 20 — and landed within 0.3% of each other
without anyone aiming for it. economy-spec.md §1 claims the 1.18 growth is
"shallow enough that the tenth slot is reachable in a first run"; on current
content that is true almost exactly to the Filing.

The test asserts a **band** rather than the coincidence, since a first run will
span more than one zone once Phase 33 authors the rest. But it measures against
what zone 1 actually pays out rather than a threshold picked to fit — an
invented number there would assert nothing about the design and would quietly
stop meaning anything the first time a wave count changed. The first draft did
exactly that, and had to be replaced.

## The HUD

Keys and Recollection sit beside Filings but deliberately quieter — they change
on the scale of a run, not a second, and a counter that never moves competing
for attention with one that always does is noise (P4).

Filings gain is **pooled over 1.1 s**, not shown per drop: kills arrive dozens a
second and an animation each would strobe.

The pooling lives in the store rather than the component. `syncFrom` already
runs exactly once a frame, so it can accumulate imperatively; doing it in a
`$effect` meant guessing a frame rate and risked a self-triggering read, which
is what the first attempt did before it was rewritten.

## Test coverage

461 tests passing; 34 added — drop scaling and tree bonuses, all four sink
curves and their authored ordering, refusal to overspend, the Recollection curve
(monotonic, integral, super-linear in depth) and its zero-award threshold, Keys
first-clear-only and idempotence, zone completion bonuses, depth tracking across
a simulated Rewind, and the separation of the three currencies from each other.

## Carried forward

| Phase | Item |
|-------|------|
| 22 | `TreeBonuses` is threaded through every formula already; the tree just has to supply it |
| 22 | Node cost growth (1.9 within a branch) is authored in balancing.csv, unimplemented |
| 24 | Slot and mount costs need a UI that spends them; nothing calls `spendFilings` yet |
| 26 | The Rewind consumes `recollectionFor` and `minimumRewindDepth` |
| 27 | Offline Filings are capped — economy-spec.md §1 says Filings alone are earned idle |
| 35 | The 1.6 depth exponent is expected to move |
