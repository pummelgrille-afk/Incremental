# Phase 17: Collision & Damage Resolution

**Stage 2 — Core Combat Systems**
Output: authored hurtboxes, `systems/feed.ts`, popup rendering,
`tests/collision.test.ts`

## Checklist

- [x] Hitbox/hurtbox decoupled from sprite bounds for fairness
- [x] Spatial partitioning — **measured and declined**, see below
- [x] Damage-number popups surfaced to the render layer via the simulation
- [x] Hit-flash feedback
- [x] Death/despawn effects

## Spatial partitioning: measured, then declined

PLAN.md asks for a grid or quadtree "to keep checks cheap at scale". Before
building one, the linear scan was measured at and beyond the entity budget:

| Movements | Slack | Bullets | Pair checks | Median | % of 50 ms tick |
|---|---|---|---|---|---|
| 6 | 50 | 150 | 8,400 | 0.1 ms | 0.2% |
| 18 | 120 | 400 | 55,200 | 0.6 ms | 1.2% |
| **30** | **200** | **600** | **138,000** | **1.3 ms** | **2.6%** |

At the full budget — every ring slot filled, the Slack budget reached, the
projectile pool saturated — collision costs **2.6% of a tick**.

A grid is therefore not built. This is the same judgement as the Phase 11
decision not to pool enemies: optimising what measurement says is free costs
real complexity and buys nothing. A polar grid would also need rebuilding every
tick as everything moves, which is not obviously cheaper than the scan it
replaces at these counts.

**The trigger for revisiting** is recorded here: cost scales as
`projectiles × (movements + slack)`. Doubling the projectile budget to 1200 for
Phase 32 bosses would put this near 2.6 ms — still fine. It becomes worth
building if Slack counts rise well beyond the 200 budget, which would be a
content decision, not an engine one.

## Hurtboxes are now authored, not magic numbers

Collision previously used two literals: `p.radius + 11` for every Slack, and
`10 + p.radius` for the block band.

Each Slack now declares its own `hurtboxRadius`, and the block band is a named
constant with a comment saying why it exists. Both are explicitly **decoupled
from sprite bounds**, and the interface says so — Phase 37 sets sprite sizes and
must not drag these along.

The asymmetry is deliberate and both directions favour the player:

- **Slack hurtboxes are generous** relative to what is drawn, so a shot that
  looks like a graze counts as a hit.
- **The Mainspring hitbox is smaller** than what is drawn (28 px against a 34 px
  ring), so a near miss reads as a miss.

Tested by firing at the exact offset that clears a Burr's hurtbox and confirming
the same offset connects against a Drift's larger one.

## The combat feed

`systems/feed.ts` carries transient events the render layer draws: damage
numbers, kills, blocks, objective hits.

**These are presentation, not state.** Dropping one changes no outcome, which is
what licenses a fixed-capacity pool that discards overflow rather than growing.
A burst of forty simultaneous hits costs a few missing popups, never an
allocation spike on the hot path.

Capacity is 64 — well below the 600 projectile budget on purpose. A frame where
hundreds of hits all produced popups would be unreadable regardless, so the cap
is a legibility decision (P4) as much as a performance one.

Positional events live here rather than on the entities because **they outlive
what caused them**: a kill popup has to survive the death that produced it.
Hit-flash stays on the entity, since it is per-entity and dies with it.

The render layer reuses `Text` objects by index rather than creating them per
event — creating a Pixi `Text` allocates a texture, which on a burst of kills
would spike the frame far worse than the drawing.

### Verified in play

A full stage produced all four event kinds — `block`, `damage`, `kill`,
`objective` — peaking at 8 concurrent popups against a capacity of 64, with zero
dropped and render time unchanged at 0.5 ms.

**A test asserts the feed can never influence the simulation**: two runs from the
same seed, one with 200 events pre-loaded into its feed, produce identical
Tension and kill counts.

## Test coverage

299 tests passing; 16 added, covering authored hurtboxes and their
per-Slack behaviour, the block band (intercepts on the ring, ignores inside it,
skipped while disabled, lets projectiles through when nothing blocks), all four
event kinds, event expiry and overflow, display rounding, and simulation
independence.

## Carried forward

| Phase | Item |
|-------|------|
| 32 | Boss density may double the projectile budget; collision cost scales linearly and stays affordable |
| 37 | Sprite sizes are set here and must **not** be tied to hurtboxes |
| 40 | Death and hit VFX build on the feed rather than adding a parallel channel |
| 42 | The HUD may want a feed-derived recent-damage readout |


## Playtest follow-up

Two pieces of feedback from playing the Phase 17 build, both acted on.

### The Mainspring damage numbers were cut

> *"the damage dealt from the enemies to the mainspring isn't that clear to see
> with the numbers ... it is still flashing white when hit and I can see the
> health in the top left so it's fine"*

Right call. A number popping at the point of impact competed with the
Mainspring's own white flash and with the densest action on the field, while the
HUD Tension bar is already the authoritative readout **and is persistent rather
than transient**. Two channels for the same information, one of them worse, is
noise (P4).

`objective` is gone from `CombatEventKind` entirely rather than left unemitted —
dead configuration is what this project keeps finding bugs in. Damage to the
Mainspring is now carried by the flash and the bar alone, and a test asserts no
popup is produced.

### Density was raised

> *"it feels just a little boring with the amount of enemies right now"*

Confirmed the concern flagged in Phase 16. Peak concurrent enemies was 6–11
against a **budget of 200** — 5% of what the engine handles. The Beat is an area
strike that wants clusters, and 6 enemies rarely gives one.

| | Before | After |
|---|---|---|
| Peak enemies | 6 / 9 / 11 | **9 / 11 / 14** |
| Kills per stage | 23 / 35 / 26 | **36 / 56 / 32** |
| Lowest Tension | 0.96 / 0.86 / 0.81 | **0.95 / 0.73 / 0.65** |

More to shoot, ~50% more kill feedback, and an actual difficulty ramp instead of
three stages that all sat above 80%.

### The tuning harness was wrong twice

Worth recording, because both errors produced confident nonsense.

**Shared content mutation.** The first sweep scaled wave counts through
`sim.state.stage.waves` — which is a **reference into `content/zones.ts`**, not a
copy. Every run compounded on the last, so what was labelled "×3" was really ×6
and "×5" was ×120. That produced a dramatic "difficulty cliff" that did not
exist, and the conclusion drawn from it (that ×2 was already lethal) was wrong.

`readonly` in TypeScript is compile-time only and offered no protection.
`tests/stageLoader.test.ts` now asserts a full simulated stage leaves content
byte-identical.

**Measuring an approximation instead of the thing.** The corrected sweep scaled
*every* group interval, while the change actually shipped only tightened bulk
arrival. Close enough to look confirmatory, different enough that stage 3 lost
where the sweep predicted a clear at 0.36. Re-tuned against the real content.

### Stage 3 is on a knife edge

Found while re-tuning: at the raised density, a **10% count change flips stage 3
from a comfortable clear to a loss**, and the relationship is non-monotonic —
fewer enemies sometimes produced *worse* outcomes.

Stage 3 is held below the density of the earlier stages for now. The underlying
cause is not diagnosed, and it should be: a difficulty boundary that sharp
against a fixed formation suggests a cascade (likely a Movement disabling and
opening an arc). **Phase 19 owns this** — the scaling director should govern that
boundary rather than authored counts.


## Second playtest pass: the Beat, and predictable spawns

> *"the enemy spawn in stage 3 was just too predictable ... factor the beat in
> and check again for the density"*

Both correct, and the second exposed a hole in method.

### Every density measurement so far ignored the player

Every tuning pass up to this point ran with **zero Beats struck**. The game was
being balanced with the player's hands off the controls.

Measured properly, the Beat is worth **+0.52 and +0.48 Tension** on stages 2 and
3. That is not a rounding error — it is half the health bar, and it meant the
"correct" densities were calibrated for a game nobody plays.

A simulated player was added to the harness: strike the densest cluster whenever
a charge is up and the cluster is worth it. Not optimal play, but representative.

### Spawn bearings are now randomised

Arc-based waves spawned perfectly evenly across a fixed arc — a comb a player
memorises in two attempts. Two changes, both preserving the shape:

- **Per-spawn jitter** of half the neighbour spacing, so individual positions
  are unguessable.
- **Per-wave arc rotation**, rerolled from the run's seeded generator, so a
  `pincer` is not always on the same axis.

The *shape* is the question the wave asks and must survive; only its bearing
moves. Still fully deterministic from a seed, so tests stay stable.

### Retuned against real play

| | Peak enemies | With Beat | Without Beat |
|---|---|---|---|
| First Shift | 7 | 0.96 | 0.73 |
| Routine Maintenance | 15 | **0.77** | LOST |
| Noted in the Log | 21 | **0.46** | LOST |

A genuine ramp, and peak enemies roughly doubled from where this phase started.

### The guard tests did their job

At the first attempt (a uniform ×1.8) **two tests failed** — the ones asserting
the Beat is optional. Weakening them to fit the change would have been the
obvious mistake; the property is why the Beat exists at all.

Instead stage 1 was pulled back separately. It is the stage a new player meets
with a partial formation and no upgrades, so it is now deliberately the gentlest
in the zone: four Movements and no strikes clear it at 0.55 Tension.

### An honest gap

**Stages 2 and 3 are not currently clearable without the Beat**, which
contradicts the "doing nothing is viable" property as written.

The confound is that the test formation is frozen at six units for every stage
because there is no economy yet. A player reaching stage 3 in the finished game
will have bought more. `combat-spec.md` §1 now records this as *partially
unverified* rather than claiming a property that does not currently hold, and
Phase 20 must re-check it with a stage-appropriate formation once Phases 21–24
make growth possible.

If it still fails then, **density comes down** — the property wins, not the
tuning.


## Third playtest pass: arc waves read as scripted

> *"the enemy spawn in wave 3 is still not randomized — just make it the same
> pattern as wave 2 but with the same difficulty parameters"*

The Phase 17 randomisation was applied *within* the arc: per-spawn jitter and a
per-wave rotation of the whole arc. The reasoning was that the shape is the
question the wave asks, so only its bearing should move.

In play that reasoning does not survive contact. A `pincer` is still visibly two
opposed clumps however the axis is rotated, and `massed` is still one clump —
and the third wave of every stage was one of those two. Rotating a recognisable
silhouette does not make it unpredictable; it makes it the same wave at a
different angle.

### What changed

Every wave in zone 1 now takes the no-arc branch, which draws a fresh uniform
bearing per spawn — the same distribution the `escorted` waves already used.
Counts, arrival rate and recovery gaps are unchanged:

| Stage | Was | Now |
|---|---|---|
| First Shift | `massed('burr', 16)` — 16 over 4.8 s | `scattered('burr', 16, 0.32)` — 16 over 4.8 s |
| Routine Maintenance | `pincer('burr', 16)` — 32 over 6.0 s | `scattered('burr', 32, 0.2)` — 32 over 6.2 s |
| Noted in the Log | `pincer('burr', 18)` — 36 over 6.8 s | `scattered('burr', 36, 0.2)` — 36 over 7.0 s |

`evenly` was renamed `scattered`. The old name described behaviour that stopped
being true when bearings were randomised — a group with no arc has never been
evenly spaced since.

### Difficulty held, measured

Eight seeds per cell, mean lowest Tension:

| | Before | After |
|---|---|---|
| Six units, Beat | 0.96 / 0.81 / 0.54 | 0.95 / 0.78 / 0.51 |
| Six units, no Beat | 0.79 / LOST | 0.89 / LOST |
| New player, Beat | 0.91 / 0.46 / 0.08 | 0.87 / 0.37 / 0.04 |
| New player, no Beat, stage 1 | 0.47, **lost 1/8** | **0.63, lost 0/8** |

Slightly harder with the Beat, slightly easier without it — scattered arrivals
give the Beat fewer clusters to hit, and spread leakage instead of concentrating
it. Stage 1 without the Beat gained real headroom, which strengthens the guard
test rather than threatening it.

### The cost, recorded

`massed` existed to hand the Beat a cluster. Removing it drops the Beat's value
on stage 1 from **+0.17 to +0.06** Tension. Stages 2 and 3 barely move
(+0.75 → +0.74, +0.50 → +0.42) because Slack converge on the centre anyway and
make their own clusters.

So the Beat is now close to pointless on First Shift. That is acceptable there —
stage 1 is deliberately the gentlest in the zone and clears without it either
way — but **Phase 19 should not assume clusters arrive for free**. If the
scaling director wants the Beat to matter, it has to create density itself.

`massed` and `pincer` are kept in `waves.ts` for Phase 33. They are no longer
used by any zone, so the arc branch of `spawnPosition` lost its only coverage;
`tests/spawn.test.ts` now exercises it directly — bearings stay inside the arc,
the per-wave offset rotates the whole arc, and no count produces a non-finite
position. Verified by breaking both lines and watching the tests fail.
