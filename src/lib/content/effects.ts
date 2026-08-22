import type { ConjunctionScale, DamageType } from '../entities/types'

/**
 * The VFX library.
 *
 * Numbers live here rather than inside the systems that emit them, for the same
 * reason every other tuning table does: a system reads them and never hardcodes
 * one. That matters more for effects than it looks, because these are the
 * numbers most likely to be nudged by eye — and a number nudged by eye inside a
 * system is a number nobody can find again.
 *
 * ## The colours are the type matrix, again
 *
 * A conjunction carries the participating unit's damage type (combat-spec.md
 * §3), an impact carries the projectile's, and both are drawn in the colour
 * that unit's body and tracer already use. Three places now say the same thing
 * about a type, and none of them can disagree — this table is the one they all
 * read.
 */

/** Damage-type colours, shared with the Platform body and its tracer. */
export const TYPE_COLOURS: Readonly<Record<DamageType, number>> = Object.freeze({
  percussive: 0xd8b45a,
  shear: 0x8fb3c9,
  thermal: 0xe08a4a,
  resonant: 0x5eead4,
})

export interface BurstSpec {
  readonly count: number
  readonly speed: number
  readonly life: number
  readonly size: number
  /** Half-angle in radians. π is the whole circle. */
  readonly spread: number
  /** Velocity retained per second. Below 1 the pieces slow down. */
  readonly drag: number
}

/**
 * A conjunction firing — the effect this phase exists for.
 *
 * `ConjunctionEvent.angle` has carried the comment "where the render layer
 * draws the burst" since Phase 18, and until now the render layer drew nothing
 * at all. The game's signature system fired in silence: the formation panel
 * counted down to it, the damage happened, and the field showed no sign.
 *
 * Scaled by participant count, because a Grand conjunction *is* the pay-off the
 * whole formation puzzle is arranged for — combat-spec.md §3 — and it should
 * not look like a Minor one.
 */
export const CONJUNCTION_BURST: Readonly<Record<ConjunctionScale, BurstSpec>> =
  Object.freeze({
    minor: { count: 14, speed: 130, life: 0.5, size: 2.4, spread: 0.5, drag: 0.25 },
    major: { count: 24, speed: 165, life: 0.62, size: 2.8, spread: 0.6, drag: 0.25 },
    grand: { count: 38, speed: 205, life: 0.75, size: 3.2, spread: 0.7, drag: 0.25 },
  })

/**
 * Where a conjunction's burst is thrown from, as a fraction of the rim.
 *
 * Out at the participants rather than at the Sun. The alignment happens on the
 * rings, and a burst blooming from the centre would credit the objective for
 * something the formation did.
 */
export const CONJUNCTION_RADIUS = 0.55

/**
 * A projectile ending on something.
 *
 * Deliberately small. Six hundred projectiles are allowed in the air at once,
 * and the budget is four hundred particles — an impact that spent twenty would
 * exhaust the field on twenty simultaneous hits, which is a normal tick in a
 * late wave. Four is enough to say "this landed here".
 */
export const IMPACT_BURST: BurstSpec = Object.freeze({
  count: 4,
  speed: 90,
  life: 0.26,
  size: 1.7,
  spread: Math.PI,
  drag: 0.12,
})

/**
 * A Platform absorbing a shot on its block arc.
 *
 * Distinct from an impact and brighter than one: a block is a *good* outcome
 * the player arranged, and combat-spec.md §5 makes block arc the thing that
 * carries survivability. It should be visible that it worked.
 */
export const BLOCK_BURST: BurstSpec = Object.freeze({
  count: 7,
  speed: 110,
  life: 0.3,
  size: 1.9,
  spread: 1.1,
  drag: 0.1,
})

/** The Flare's own sparks, on top of the ring it already draws. */
export const FLARE_BURST: BurstSpec = Object.freeze({
  count: 20,
  speed: 190,
  life: 0.45,
  size: 2.2,
  spread: Math.PI,
  drag: 0.2,
})

export const FLARE_COLOUR = 0xfff1a8

/**
 * A unit levelling, or an Almanac node being bought.
 *
 * Held back until the field is visible again — both happen inside a panel that
 * covers the whole screen, so an effect played at the moment of purchase is an
 * effect nobody sees. `core/bootstrap.ts` queues it and the field plays it on
 * the next frame the panel is shut.
 */
export const UPGRADE_BURST: BurstSpec = Object.freeze({
  count: 16,
  speed: 95,
  life: 0.8,
  size: 2.3,
  spread: Math.PI,
  drag: 0.06,
})

export const UPGRADE_COLOUR = 0xc9a227
