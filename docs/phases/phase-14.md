# Phase 14: Ranged Support-Unit System

**Stage 2 — Core Combat Systems**
Output: Chime balance pass, invulnerability made explicit, five-axis
distinction locked by test

## Checklist

- [x] Support AI distinct from front-line allies — long-range targeting,
      projectile spawning, cooldown/ammo design
- [x] Decision on splitting `supportAi.ts` — **not split**, with the trigger
      for revisiting recorded in `ai.ts`
- [x] Balance support-unit power against allies so both feel necessary
- [x] Tracked in `docs/design/balancing.csv`

## The split question

PLAN.md offers a separate `supportAi.ts` "if it diverges enough". It does not,
yet. `updateChimes` shares the scoring function, the retarget interval and the
overall update shape with `updateMovements`; what differs is ~50 lines — Charge,
target leading, unrestricted reach.

Splitting now would separate two functions that are read against each other and
duplicate the shared scorer's import for no gain. The trigger for revisiting is
recorded in `ai.ts`: Chimes needing targeting policies Movements do not have, or
a genuinely different update shape. Phase 25 could bring either.

## The balance pass

The real work of this phase, and it needed measurement rather than judgement.

### First finding: Chimes were dominant

Comparing whole compositions at roughly equal Filings cost:

| Composition | Cost | Result |
|---|---|---|
| 5 Movements | 250 | cleared, 61.7 s, 62.9% Tension |
| **2 Chimes** | 240 | **LOST** — 8 kills, Tension zero |
| 3 Movements + 1 Chime | 270 | cleared, 58.1 s, **84.8%** Tension |

Half the design worked immediately: **Chimes alone lose the stage**, because they
have no block arc and nothing they do slows a Slack down.

But the mixed build beat pure Movements at equal cost on *every* metric — faster
*and* far healthier, with a smaller front line. That is not "both feel
necessary"; that is Chimes being the correct answer and Movements being the
minimum tax you pay to hold the line.

### A confounded test, corrected

The comparison above varies Movement count and Chime presence together, so it
cannot separate the two. Re-run holding the front line fixed and asking a
cleaner question — **is ~120 Filings better spent on a Chime or on two more
Movements?**

| `chargeInterval` | +1 Chime | +2 Movements | |
|---|---|---|---|
| 4 s (shipped) | +0.49 Tension | +0.33 | Chime dominant |
| 5 s | +0.43 | +0.33 | Chime dominant |
| **6 s** | **+0.34** | **+0.33** | **balanced** |
| 7 s | +0.22 | +0.33 | Movements dominant |

A smooth gradient, not the cliff the confounded version suggested.
**`chargeInterval` is now 6 s.**

At 6 s the Chime build clears *faster* (56.4 s vs 59.1 s) while being equally
robust — the two options differ in profile rather than in quality, which is what
a real choice looks like.

### Chime damage is close to irrelevant

An unexpected result worth recording: at the same `chargeInterval`, an attack of
13 and an attack of 16 produced **identical** clear times and Tension.

That looked like a broken harness, so it was checked directly — damage scales
exactly with `attack` (×6.25 for 16→100). The harness was fine. Clear time is
**floored by the wave spawn schedule**: a wave cannot complete before it has
finished spawning, so extra damage stops mattering once you can already kill
everything in time.

Recorded in `balancing.csv`: tune `charge_interval`, not `attack`.

## Chimes cannot be damaged

`hp`, `maxHp` and `disabledFor` existed on `ChimeInstance` and were **only ever
restored, never reduced** — nothing in the game could damage a Chime.

That turns out to be correct, not a bug, but it was undocumented. Chimes sit on
the rim, outside the field of fire: Slack spawn at that radius and travel
inward, and so do their projectiles. Nothing reaches a mount.

The trade is deliberate: a Chime's cost is contributing **no defence at all** —
it has no block arc — and having its output gated by Charge. Fragility is not
part of the bargain.

The fields are kept rather than deleted (level scaling writes `maxHp`, and Phase
25 may introduce durability) but the interface now says plainly that they are
inert, so the state is not silently a lie.

## Test coverage

230 tests passing; 7 added, locking the five axes from `combat-spec.md` §4:

| Axis | Assertion |
|------|-----------|
| Position | Chime position is unchanged after 40 ticks; the Movement's is not |
| Range | A Chime hits a target no annular band contains |
| Resource | At zero Charge a Chime is silent while a Movement fires regardless |
| Conjunction | Two aligned Chimes produce nothing, and none is smuggled into a Movement conjunction |
| Targeting | The Chime aims ahead of a mover; the Movement resolves against it directly |

Plus: a Chime has no `blockArc`, and its `hp` is unchanged after a full stage of
hostile fire.

These exist because balancing is where distinctions erode. If a later pass makes
one class quietly behave like the other, the roster loses a dimension and these
fail first.

## Carried forward

| Phase | Item |
|-------|------|
| 20 | Re-run the marginal-value comparison once the roster is larger; one Chime against three Movements is a thin sample |
| 25 | Support-unit upgrades; if durability arrives, `hp` stops being inert and the invulnerability note needs revisiting |
| 30 | The 4–6 launch Chimes must each hold the five axes, not just this one |
| 35 | `chargeInterval` is the lever; expect it to move as content scales |
