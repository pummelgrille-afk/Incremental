# Phase 5: Combat System Design Document

**Stage 0 — Concept & Design Foundation**
Output: `docs/design/combat-spec.md`

## Checklist

- [x] Auto-battle rules: targeting logic (5 policies), attack timing, formation grid
- [x] Bullet-hell rules: projectile patterns (6), defended-objective hitbox,
      dodge/block mechanics
- [x] Ranged-support behaviour specified as distinct from front-line allies
- [x] Damage formulas
- [x] Elemental/type interactions
- [x] Deterministic simulation order defined

## Decisions locked

- **Polar field.** All positions are `(ring, angle)`; cartesian exists only at
  render time. Rotation is O(rings), not O(units) — units store a slot index and
  derive their angle from the ring's phase.
- **Three rotating rings + a static rim** for Chime mounts.
- **The ring nudge:** one slot-width impulse, 0.4 s eased, 2.5 s cooldown per ring,
  free. This is the entire live input surface.
- **Conjunction:** units on *different* rings aligning within 6° fire a scaled
  burst. Evaluated every 100 ms with a 6 s per-alignment cooldown.
  A time-to-next-conjunction preview is a **hard requirement** — the mechanic is
  invisible without it.
- **Chimes differ from Movements on five axes** (position, range, resource,
  conjunction participation, targeting), so neither can substitute for the other.
- **Telegraph before threat is non-negotiable:** 400 ms floor, 600–900 ms for
  bosses. A pattern that kills without warning is a bug.
- **Diminishing defence** via `100/(100+defence)` — never immunising.
- **Two type pairs, not a four-way cycle**, so most waves have two workable builds.
  Multipliers confined to 0.75–1.5.
- **Movements are never permanently lost** — disabled for 12 s, then restored.
  Permadeath would fight P5 and punish idle play.
- **Step 11 of the tick is the only point the simulation touches Svelte.**

## Open questions for Phase 10

Five recorded in the spec, to be answered with the vertical slice rather than from
the armchair — including whether three rings is the right number.
