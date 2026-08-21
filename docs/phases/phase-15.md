# Phase 15: Enemy AI & Spawn System

**Stage 2 — Core Combat Systems**
Output: `content/waves.ts` (new), enemy variety in `content/enemies.ts`,
`orbit` motion, splitters and telegraph vulnerability, `tests/spawn.test.ts`

## Checklist

- [x] Base enemy movement patterns — swarm, drift, charge, **orbit**
- [x] Driven by wave-config data from `content/waves.ts`
- [x] Enemy variety hooks — splitters, shielded, fast, tanky
- [x] Reskinned to the theme in `content/enemies.ts`

## Three declared-but-dead hooks

`SlackTraits` had existed since Phase 8 with three fields. Auditing them:

| Trait | State before this phase |
|-------|------------------------|
| `shieldHits` | Implemented |
| `splitsInto` | **Declared, never implemented** |
| `vulnerableWhileTelegraphing` | **Declared, never implemented** |
| `orbit` motion | **Fell through to `drift`** |

All three are now live, and each has content using it — a hook with no user is
untested configuration, so `tests/spawn.test.ts` asserts every hook and every
motion archetype has at least one live user.

## The roster now covers the archetypes

| Slack | Motion | Hook | The question it asks |
|-------|--------|------|----------------------|
| **Burr** | swarm | — | Baseline coverage |
| **Backlash** | charge | — | Is ring 1 thin? |
| **Drift** | drift | — | Can the line grind? |
| **Cant** | drift | `shieldHits: 3` | Chip damage is the wrong answer |
| **Wear** | drift | `splitsInto` | Kill it early or pay twice |
| **Fret** | orbit | `vulnerableWhileTelegraphing: 2` | Cannot be waited out |

Names come from `narrative.md`, which already listed Burr, Backlash, Drift, Cant,
Wear and Fret as the modes of mechanical decay.

**Telegraph vulnerability is the interesting one.** It makes the moment a Slack
becomes dangerous also the moment it is most worth shooting — so reading a
telegraph rewards *acting*, not merely dodging. Fret takes double damage while
winding up.

## Waves are now composed, not spelled out

`content/waves.ts` provides shapes rather than raw spawn groups, and each one
states the question it poses:

| Shape | Asks |
|-------|------|
| `evenly` | Raw coverage; nothing to align against |
| `massed` | Is the formation spread or clumped? Rewards a Beat |
| `pincer` | Can it cover both sides at once? A one-sided build fails even with higher total damage |
| `escorted` | Can it hold shape while a priority target walks in? The case `highestThreat` exists for |

Zone 1 grew from two stages to three, composed from these. Measured ramp:

| Stage | Types | Killed | Lowest Tension |
|-------|-------|--------|----------------|
| First Shift | 2 | 24 | 95.1% |
| Routine Maintenance | 3 | **35** | 85.6% |
| Noted in the Log | 4 | 26 | 81.5% |

Monotonic difficulty, all six types appearing across the zone, no budget
overruns. The 35 kills from 24 spawns in stage 2 are Wear's children — splitting
visible in the numbers.

## A bug the tests caught: orbit drifted

The first implementation moved tangentially each tick and re-closed whenever it
exceeded its radius. A tangent lies *outside* the circle, so Euler integration
walked the orbit outward until the re-close check yanked it back — an
oscillating band between 205 and 209.6 px rather than the fixed radius the
archetype promises.

The position is now renormalised to the target radius after each tangential
step. One square root, and "settles at a radius" becomes literally true.

A second failure was my test's fault, not the code's: it asserted that two
orbiters circle in opposite directions by comparing `velocity.x` at angle 0 —
where the tangent is vertical and `velocity.x` is zero for both, so its sign
carries no information. Comparing `velocity.y` instead.

## Splitting has no runtime clamp, by design

Children spawn in `reapSlack`, where death is handled, and **immediately** —
spawning them a step later would leave `sim.slack` empty for one tick and let
`objectiveRules` call the wave cleared. Tested directly.

Nothing limits splitting at runtime, consistent with the Phase 11 principle that
budgets are content constraints: clamping would rewrite authored difficulty
invisibly. That makes a **split cycle** (A spawning A, directly or through a
chain) unbounded, so `tests/spawn.test.ts` walks every definition and fails on
any cycle or any chain deeper than 8.

## Test coverage

248 tests passing; 18 added, covering each motion archetype's distinguishing
behaviour, all three traits, splitter placement and Filings, and content
integrity including the cycle guard.

## Carried forward

| Phase | Item |
|-------|------|
| 16 | Patterns are still 3 of 6; Fret and Cant reuse existing ones |
| 19 | The scaling director will drive wave composition; `waves.ts` shapes are its vocabulary |
| 31 | Full tiered roster; these six are archetype coverage, not the final set |
| 33 | Zones 2–6; zone 1's three stages are the template |
