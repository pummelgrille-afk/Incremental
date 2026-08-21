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
