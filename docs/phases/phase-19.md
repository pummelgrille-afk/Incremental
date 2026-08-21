# Phase 19: Wave & Difficulty Scaling Director

**Stage 2 — Core Combat Systems**
Output: `content/scaling.ts`, `systems/scaling.ts`, boss-milestone validation,
`tests/scaling.test.ts`

## Checklist

- [x] Data-driven wave curve
- [x] Tied to the player's current power — **one-sided**, see below
- [x] Boss-wave triggers at stage milestones
- [x] The stage 3 knife edge from Phase 17, diagnosed and fixed

## The knife edge was not what I said it was

Phase 17 recorded that a 10% count change flipped stage 3 from a clear to a
loss, non-monotonically, and guessed at a cascade: a Movement disabling, its
block arc vanishing, its neighbour following. That guess was wrong.

Across 24 seeds, correlation with lowest Tension:

| Suspect | r |
|---|---|
| Movement disables | −0.26 |
| Seconds with a unit down | −0.11 |
| Peak enemy count | −0.08 |
| Splitter offspring | constant — ruled out |
| **Wave 1 duration** | **−0.88** |
| **Worst Cant lifetime** | **−0.89** |
| **Seconds a Cant spent inside ring 1** | **−0.89** |

**51 of 96 Cant instances reached inside ring 1, many to radius 0** — parked on
the Mainspring.

### The reachability hole

`inReach` applied the same fixed angular gate at every radius. The innermost
ring's exemption drops its inner bound to zero so ring 1 can defend the centre —
the comment says a Slack there "would be unreachable by anything at all"
otherwise — but **a bearing at radius zero is arbitrary**. A Detent's 22° window
covers 6% of the circle, so an enemy on the objective was hittable about one
second in eight.

The radial half of the intent was implemented. The angular half was not.

Cant exposes it because it is the slowest thing in the game (22 px/s) with three
shield hits — the one enemy that reliably survives the trip inward. And the
design funnels the *worst* answer into the only slot that can respond: ring 1 is
where the formation bonuses push a tank, and the tank has the lowest attack in
the roster.

The bimodality follows: a Cant either dies before the centre or it does not.
Good seeds' closest approach was 35–102 px; bad seeds sat at 0 for 16–18 s.

### The fix

Reach is an arc *length* — which combat-spec.md §2 already says, in the other
direction ("the same angular reach covers more arc length on an outer ring").
Read inward, the same length subtends a wider angle as a target closes:

```
subtended = min(π, angularReach × ringRadius / radius)
```

Clamped so reach only ever **widens inward, never narrows outward**. The
authored values were tuned as the reach at and beyond a unit's own ring; letting
them shrink at range would rebalance every unit rather than fix one degenerate
case. Landed separately as its own commit.

| 24 seeds, identical | Before | After |
|---|---|---|
| full+beat, Routine | 0.805 (spread 0.298) | **0.849** (spread 0.128) |
| full+beat, Noted | 0.516 (spread 0.502) | **0.553** (spread 0.398) |
| full no-Beat, Noted | LOST 18/24 | **LOST 12/24** |
| new+beat, Noted | LOST 16/24 | **LOST 9/24** |
| Longest inside ring 1 | 30.9 s | **22.5 s** |

Every cell improved or held. Per-seed outcomes reshuffle — different kill order
diverges the trajectory — so "strictly better" would overstate it.

**The original symptom no longer reproduces at all**: zero losses in 24 seeds.
The Phase 17 retune and the scattering had already moved stage 3 off the cliff;
what survived was the variance, which had the same root cause.

## "Tied to the player's current power", carefully

PLAN.md asks for a wave curve tied to current power. Taken in both directions
that is rubber-banding, and it would break the design outright: economy-spec.md
§5 makes HP outgrow damage *precisely* so an out-scaled player feels a stall,
and game-loop.md makes that stall the signal to Rewind. A director that eased
off when the player was weak would erase the only thing telling them the run is
over.

So the response is **one-sided**. Over-levelled adds enemies; under-levelled
changes nothing, ever. Replaying cleared content stops being free, and no wall
is ever hidden.

```
pressure = formationDps / waveHpPerSecond
bonus    = clamp(0, (pressure - 3.0) × 0.35, 0.5)
```

Three decisions worth recording:

**Measured against the wave, not against an authored power curve.** A baseline
number would need re-deriving every time the roster or ring layout changed, and
would rot silently in between. Dividing by the wave's own HP-per-second is
self-calibrating from content that already exists.

**Chimes count at their Charge rate, not their fire rate.** A Chime is gated by
Charge (combat-spec.md §4); rating it at burst speed would read it as several
times stronger than it plays, and the director would punish a build for owning
one.

**The Beat is excluded.** It is the player's input, not their formation. Scaling
waves against how well someone is *playing* is exactly the rubber-banding this
rejects.

### The threshold is calibrated against the reference build

The formation every balance pass since Phase 14 has measured against — six
Movements, two Chimes, level 1 — must score **zero on every authored stage**, or
the director is rebalancing the game rather than answering farming, and every
number in phase-17.md and this file stops being true.

| Formation | First Shift | Routine | Noted |
|---|---|---|---|
| New player (4+1), L1 | 1.29 | 0.74 | 0.47 |
| **Reference (6+2), L1** | **2.39** | **1.37** | **0.87** |
| Reference, L5 | 3.53 | 2.03 | 1.29 |
| Over-built (10+4), L1 | 4.50 | 2.58 | 1.65 |
| Over-built, L5 | 6.67 | 3.82 | 2.44 |

Threshold **3.0** clears the reference build on every stage with headroom, while
catching a formation roughly twice its strength replaying First Shift. A first
pass at 1.6 fired on the reference build itself; a test now asserts it cannot.

**Added enemies keep the wave's duration, not its interval** — denser, not
longer. Stretching a wave raises clear time without raising pressure, which is
the opposite of the intent. Capped at +50% because the authored wave is still
the *shape* of the question being asked (waves.ts), and because an uncapped
bonus would sail past the entity budget.

## The count formula was never implemented

`enemyCount = baseCount + floor(stage / 3)` has been in economy-spec.md §5 since
Phase 6 and had never reached the simulation — counts came entirely from
`zones.ts`. Applied per *group*, so a wave's shape survives: a pincer gains a
unit on each side rather than growing lopsided.

For zone 1 (indices 1–3) it adds at most +1 per group, and only on stage 3.
Measured cost there, reference build with the Beat: **0.553 → 0.410** mean
Tension, minimum 0.218, still no losses. Accepted rather than compensated for in
`zones.ts` — stage 3 should be the hardest stage in the zone, and the formula is
what will carry density for Phase 33's stages, which will not be hand-tuned one
at a time.

Two growth factors were also being written inline in `spawn.ts` while
balancing.csv owned them, which is exactly the drift CLAUDE.md's convention
exists to prevent. They live in `content/scaling.ts` now.

## Boss triggers, not boss encounters

Phase 32 owns the encounters. This phase owns **where they fall**: the interval,
the stat multipliers, and a countdown.

Rather than leave those as constants nothing reads — the failure mode this
project keeps hitting — the trigger has a live consumer. `validateStage` now
fails a stage that sits on the boss interval without a boss wave. Zone 1 stops
at index 3 so nothing trips it today; the moment Phase 33 authors stage 8
without one, the content tests say so by name.

Bosses ignore the count formula, so there is no `bossCount`: a boss stage is one
encounter, not a denser wave.

## One directed wave, read by everyone

`directWave` runs **once when a wave begins** and the result is cached on
`state.activeWave`. Spawning, the wave total and the spawn duration all read it
through a single `currentWave` accessor.

This matters more than it looks. Those three disagreeing about a count is a wave
that never completes, because the clear check waits for a total that never
arrives. Recomputing per tick would do exactly that — power drops as units are
disabled mid-wave, so the count would drift underneath the check.

The opening wave is directed lazily on the first tick rather than in the
constructor, because the formation is slotted *after* construction and measuring
power at construction time would read an empty field.

**Nothing mutates content.** `sim.stage` is a live reference into `zones.ts` and
`readonly` is compile-time only; a Phase 17 harness wrote through that reference
and invented a difficulty cliff. A test simulates a full directed stage and
asserts content is byte-identical afterwards.

## Test coverage

398 tests passing; 41 added. The curve and its ordering, boss intervals and
multipliers, boss-milestone validation in both directions, formation power
(level, disabled units, Charge-rated Chimes, Beat exclusion), one-sidedness,
the reference build scoring zero on every authored stage, the cap, density-not-
duration, content immutability, spawn and wave-total agreement, budget
compliance under a maxed formation, and that a directed stage still clears.

Six reach tests in `tests/ai.test.ts`, verified by reverting the fix and
watching two of them fail.

## Carried forward

| Phase | Item |
|-------|------|
| 20 | Re-check "the Beat is optional" — still failing on stages 2–3, though the reach fix improved it from 18/24 to 12/24 losses |
| 24 | Levelling goes live; `formationPower` reads `levelScale`, so the director responds automatically |
| 32 | Boss encounters consume `isBossStage`, `bossHp`, `bossDamage` |
| 33 | Authored stages past index 8 must carry boss waves or validation fails |
| 33 | The count formula, not hand-tuned counts, should carry density at scale |
