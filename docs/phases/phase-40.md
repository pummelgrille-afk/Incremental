# Phase 40: VFX Production

**Stage 5 — Art & Audio**
Output: `systems/particles.ts`, `content/effects.ts`, emitters in
`systems/synergy.ts`, `systems/collision.ts`, `core/loop.ts` and
`core/bootstrap.ts`, `tests/particles.test.ts`, art-style.md §6

## Checklist

- [x] Hit-flash — already present since Phase 17; extended to Platforms in 38
- [x] Death effects — derived clips, Phase 38
- [x] Level-up and upgrade-unlock effects
- [x] A projectile VFX library matching the pattern system
- [x] Particle counts inside the Phase 11 budget — measured, and it took a
      redesign to get there

## The signature system was firing in silence

`ConjunctionEvent.angle` has carried the comment **"where the render layer draws
the burst"** since Phase 18. Nothing ever drew it.

So for twenty-two phases the game's central mechanic — the thing the whole
rotating-formation puzzle exists to arrange, with a countdown in the formation
panel and a hard requirement in combat-spec.md §3 that it be legible — happened
with no sign on the field at all. The damage landed, the buffs applied, and the
screen said nothing. The data needed to draw it had been sitting in the event
the entire time.

That is the headline of this phase. Everything else is smaller.

## Frequency, not size, is what an effect costs

The burst was authored at 14 particles for a Minor and 38 for a Grand, which
looks modest. Measured against a full formation it cost **881 particles per
second** against a budget of 400 — the field was exhausted on the opening stage,
with 4,999 particles dropped in 28 seconds.

The cause is not the effect. It is that a full formation of 48 Platforms fires
roughly **36 conjunctions a second**: combinatorially many slot sets come into
line, and each carries its own cooldown. That is by design, and the balance pass
already accounts for it — but it means any per-conjunction effect must be
essentially free, which a visible one cannot be.

The fix was to stop emitting per conjunction and emit **once per evaluation**,
for the largest alignment in it. At the 100 ms evaluation cadence the eye reads
one event anyway, so the other 35 bought nothing but overflow. Taking the
largest keeps the thing worth seeing: a Grand must not be hidden behind a Minor
that fired beside it.

| | Peak of 400 | Dropped |
|---|---|---|
| Per conjunction | exhausted | 4,999 in 28s |
| Per evaluation | 167–188 | 0 |

Measured with every ring slot and rim mount filled at maximum level, on stages
across the whole ladder including the first and last boss. `tests/particles.
test.ts` plays that configuration and fails if either number moves.

**This is why the budget is worth having.** Nothing broke when it was exceeded —
the pool discards overflow silently, so an exhausted field looks exactly like
effects that stopped appearing, which is the kind of thing that ships.

## Its own random source, and that is not optional

The particle field carries a private `Rng` rather than borrowing the
simulation's. A stage is seeded so that it plays the same way every time, which
is what makes Phase 35's balance measurements reproducible — and drawing scatter
from that stream would put every wave in the game downstream of how many sparks
an explosion happened to throw. Changing a particle count would silently change
what spawns.

Pinned by a test that states the property rather than the mechanism: two
identical stages, one showered with particles between ticks, must end in exactly
the same state.

## Effects that happen behind a panel

PLAN.md asks for level-up and upgrade-unlock effects. Both happen inside an
overlay that covers the whole screen, so an effect played at the moment of
purchase is an effect nobody sees.

They are queued and played on the first frame the field is actually visible. A
levelled Platform is acknowledged at each of its fielded positions; an Almanac
node has no unit, so it goes to the objective.

## Measured

- 2.16 ms per frame for simulation and render together with the field
  **saturated at its 400-particle cap**, against a 16.7 ms budget.
- Particles present in 28% of frames during ordinary play with the starting
  four-Platform formation — noticeable without being constant.
- The Flare's sparks show on the field: 26 pixels in its own colour on the frame
  after a strike.
- 952 tests, `npm run check` and a production build green.

## What is not here

**Screen shake**, which the effects brief usually implies. `Settings.
screenShake` exists and is a Phase 43 accessibility toggle; adding a shake
before the toggle that turns it off would be the wrong order, and art-style.md
§6 rule 7 already says nothing may depend on motion to be understood.

**Pattern-specific projectile VFX.** The brief asks for a library "matching the
Phase 16 pattern system", and what is built is per damage *type* rather than per
pattern — the type is what decides whether a shot answers what it hits
(combat-spec.md §7), and it is what the unit body and tracer are already
coloured by. A per-pattern look would say something the player cannot act on.
