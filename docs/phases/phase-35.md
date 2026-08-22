# Phase 35: Full-Game Balancing Pass

**Stage 5 — Balance & Onboarding**
Output: `tests/support/playthrough.ts` (a full-game harness), `tests/balance.test.ts`,
four content corrections

## Checklist

- [x] End-to-end playthroughs across multiple prestige loops
- [x] Adjust so no single ally / support unit / node dominates
- [x] Validate offline-progress values

## The harness

There is no way to answer "does the prestige loop work" from unit tests, so this
phase's first deliverable is a thing that plays the game: buys slots, unlocks
units, spends Recollection, fights on the real `Simulation` at the real tick
rate, dies, rewinds, repeats.

It drives the **real** systems throughout — `progression/` for every purchase,
`core/formation` for fielding, `Simulation` for combat. Nothing is modelled
twice, because a balance harness that approximates the thing it is balancing
measures its own approximation.

The one thing it *does* model is the player, and that model is deliberately
simple: buy the cheapest useful thing, always; strike with the Flare whenever a
charge is banked. A real player does better, so every figure below is a floor.

### Three harness bugs, all of which looked like economy failures

Worth recording, because each produced a plausible-looking wrong answer:

1. **Double-charging for slots.** `placePlatform` charges internally; the first
   draft called `spendSalvage` first as well. The modelled player sat on 1,400
   banked Salvage with six slots.
2. **Giving up instead of falling through.** It picked the cheaper of slot and
   mount, and stopped entirely when that one could not be taken. Once the slot
   price passed the mount price at six slots it preferred a mount, owned no
   Array to mount, and bought nothing for the rest of the game.
3. **Fielding by DPS.** It put the highest attack-per-second unit in every slot,
   so the whole formation became Rakes the moment Rake unlocked for 3 Clearance
   — 45 HP, 2 defence, the narrowest block arc in the roster. The field stopped
   intercepting anything and measured depth *fell* as the player got richer.

The third is also a real finding about the game: **block arc carries
survivability, so a DPS-maximising build is a trap.** That is combat-spec.md §5
working as intended, and it is worth knowing that the obvious build is the wrong
one.

## The headline finding: the ladder outruns the player

economy-spec.md §3 states the diagnostic in advance — *"Runs get shorter and
deeper. If Phase 35 playtests show run length climbing instead, the tree is
under-powered relative to the wave curve."*

Measured, twelve prestige loops:

| Rewind | 1 | 2 | 3 | … | 12 |
|--------|---|---|---|---|----|
| Depth | 7 | 11 | 11 | 11 | 11 |
| Minutes | 8.4 | 12.5 | 12.6 | 12.6 | 12.4 |

Against the cadence table's 8 / 14 / 22 / 40 / 75. **Depth plateaus at stage 11
by the second Rewind and never moves again.** Run length climbs rather than
falls, which is precisely the symptom the spec names.

### It is structural, not a tuning miss

The arithmetic, with everything bought:

| | |
|---|---|
| Slots | ×12.0 (4 → 48) |
| Levels | ×2.08 (level 10) |
| Tree attack | ×2.42 (all 72 nodes) |
| Tree haste | ×1.78 |
| **Player ceiling** | **×107.5** |
| Per-enemy HP at stage 40 | ×165.7 (`1.14^39`) |
| Enemy count growth | ×1.65 |
| **Wall at stage 40** | **×273.4** |

The ceiling runs out around **stage 37 on per-enemy HP alone**, earlier once
count growth is included. The last stretch of the authored ladder cannot be
cleared by any build the game currently offers — not by a better player, not by
a smarter build, not by more time.

And the measured plateau is at 11, far below even that ×107.5 ceiling, because
the *economy* delivers nowhere near full investment: Recollection is gated on
depth, depth is gated on power, and power is gated on Recollection. Stall
anywhere and the loop stops.

### I swept the constants and did not change them

Every candidate lives inside its authored band in balancing.csv:

| Configuration | Depth trajectory |
|---|---|
| Baseline | 7 → 11 → 11 … 11 |
| `enemyHpGrowth` 1.10 | 13 → 15 → 15 → 13 … 15 |
| + Recollection 1.9 / 5 | 13 → 13 → 15 … 13 |
| + `nodeCostGrowth` 1.6 | 13 → 13 → 15 … 15 |
| + count divisor 5 | 15 → 15 … 15 |

**Every configuration plateaus.** The wall only moves from 11 to 15; none of
them produces a climb. And lowering `enemyHpGrowth` to 1.10 takes the *first*
run to depth 13 against a target of ~8 — it wrecks a well-tuned opening to shift
a wall that stays put.

So the tuning is unchanged, deliberately. Fiddling constants to move a plateau
three stages while breaking the early game would be making a number look better
rather than fixing anything. **This needs a design decision, not a balance
tweak** — most likely a prestige reward that compounds rather than adding
percentages, which is a change to economy-spec.md §2 and §7 and is the user's
call, not a balancing pass's.

Recorded in `tests/balance.test.ts` as three assertions that fail if the gap is
ever closed *or* widened, so the next content commit cannot move it unnoticed.

## Four content corrections

The dominance checks found real problems, not hypothetical ones:

- **A Tuner was strictly worse than an Anchor on every stat and five times the
  price**, leaving it justified only by its conjunction effect. Its description
  says it exists to take hits meant for something else, so it now has the
  largest body and widest block arc in the roster: 110 → 175 HP, 22° → 28°.
- **A Relay's whole case is the largest alignment payload**, and at 44 it was
  beaten by a Kiln's 48 at half the price. Now 56.
- **A Ballast had traded its patience without getting an edge** — out-statted by
  an Anchor on body, defence and block arc. Attack 7 → 9 makes it the best
  damage among units that can hold a line, which is what its description claims.
- **`recovery-the-whole-week` was exactly half of everything Recovery grants of
  `offlineCap`**, making the other two nodes decoration. 8 h → 6 h.

## Two of my own rules were wrong

Worth separating from the content findings:

- **"No node exceeds 35% of its branch's total for a kind"** fails a branch that
  is *perfectly evenly distributed* across three nodes. Raised to 50%, and the
  rule is skipped entirely for kinds granted by fewer than three nodes — with
  two, an even split is 50% each and no distribution can pass.
- **The dominance check compared units with different conjunction payloads.** A
  Lantern out-stats a Relay on every line and costs less, but grants haste where
  the Relay carries a damage pulse. Comparing those magnitudes is comparing
  seconds to points; the check now only applies within a payload kind.

## Offline progress validates

PLAN.md asks for "meaningful but not run-breaking". At 3 Salvage/s:

| Away | Salvage | Active equivalent |
|------|---------|-------------------|
| 1 h | 3,456 | 10,800 |
| 4 h | 8,640 | 43,200 |
| 24 h | 8,640 | 259,200 |

40% of the active rate, capped at four hours. An hour away is worth having; a
day away never beats an hour of playing. Four assertions hold it there.

## Test coverage

848 passing; 14 added — every Platform and Array best at something, no unit
strictly dominating another within a payload kind, no tree node carrying a
branch, offline paying a real fraction of active play and never matching it and
stopping at the cap, the wall-versus-ceiling gap bounded in both directions, the
first zone staying inside the ceiling, the opening run reaching the first boss,
and the plateau recorded as a known bound.

## Carried forward

| Phase | Item |
|-------|------|
| — | **The progression plateau needs a design decision.** A compounding prestige multiplier is the usual answer and would change economy-spec.md §2 and §7 |
| — | The cadence table targets stage 75; the ladder ends at 40, so it also assumes content past the authored end |
| 36 | The DPS trap is invisible to a new player; the tutorial is where "block arc matters" should be taught |
| 36 | Nothing in the UI explains why a formation of one unit type fails |
