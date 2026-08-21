import type { RingIndex } from '../entities/types'

/**
 * Field geometry. Mirrors docs/design/combat-spec.md §1 and the `field` and
 * `beat` rows of docs/design/balancing.csv.
 *
 * balancing.csv is the ground truth (economy-spec.md §8). When these disagree,
 * the CSV wins and this file is wrong.
 */

export interface RingConfig {
  readonly index: RingIndex
  readonly radius: number
  readonly slots: number
  /** Seconds per revolution. */
  readonly period: number
}

export const RINGS: readonly RingConfig[] = [
  { index: 1, radius: 90, slots: 6, period: 8 },
  { index: 2, radius: 160, slots: 10, period: 14 },
  { index: 3, radius: 240, slots: 14, period: 22 },
  { index: 4, radius: 310, slots: 18, period: 34 },
] as const

/**
 * The first and last orbits, derived rather than written down.
 *
 * Both used to be the literal `3`, in five places across four files, which made
 * "add an orbit" a change you had to remember to make everywhere. Now it is one
 * array entry — see theme-revision.md, "Structure".
 */
export const INNERMOST_RING = RINGS[0].index
export const OUTERMOST_RING = RINGS[RINGS.length - 1].index

/**
 * Ring periods are deliberately non-integer ratios (8 : 14 : 22 : 34 =
 * 4 : 7 : 11 : 17, pairwise coprime) so alignments do not repeat on a short
 * cycle. This is what makes conjunction a planning problem rather than a
 * metronome. Guarded by tests/simulation.test.ts.
 *
 * The real periods of Mercury, Venus, Earth and Mars are 1 : 2.56 : 4.15 :
 * 7.81, which would put Mars at ~62 s per revolution — longer than most waves
 * last, so the outer orbit would read as static. Compressed to 34 s, which
 * keeps the ordering and the coprimality and loses the astronomical accuracy.
 * theme-revision.md anticipated this trade.
 *
 * Rotation is **constant and never player-controllable** (combat-spec.md §1).
 * No upgrade may grant steering; that was tried and removed after the Phase 10
 * playtest.
 */

/** Chime mounts. The rim does not rotate. */
export const RIM_RADIUS = 380
export const RIM_MOUNTS = 8

/** Slack spawn at the rim and move inward. */
export const SPAWN_RADIUS = RIM_RADIUS

/**
 * The Beat — the Wright's manual strike, and the only live input.
 *
 * Instant and area-based on purpose: there is nothing to aim and nothing to
 * miss, so its failure mode is *damage not dealt* rather than *damage taken*.
 * See combat-spec.md §1.
 */
export const BEAT = {
  maxCharges: 3,
  /** Seconds to regain one charge. */
  rechargeInterval: 3,
  /** Minimum gap between strikes, so a double-click cannot waste one. */
  cooldown: 0.25,
  /** Blast radius in pixels. */
  radius: 44,
  baseDamage: 26,
} as const

export const CONJUNCTION = {
  /** Radians. 6° — the window within which units count as aligned. */
  tolerance: (6 * Math.PI) / 180,
  /** Milliseconds between synergy passes. Not every tick. */
  evalInterval: 100,
  /** Seconds, keyed on the participating slot set. */
  cooldown: 6,
  multipliers: { minor: 1.25, major: 1.6, grand: 2.2 },

  /**
   * Type pairing — combat-spec.md §3 rule 5.
   *
   * A matched group amplifies; an opposed pair *interferes*, trading magnitude
   * for reach. Interference is deliberately not a penalty with nothing to show
   * for it: a wider pulse arc can catch a spread wave that a narrow one misses,
   * so a mixed-type formation has a case rather than an apology.
   */
  pairing: { matched: 1.25, interference: 0.7, mixed: 1 },

  /** Half-width, radians, of a damagePulse's reach around the alignment. */
  pulseArc: 0.5,
  /** The wider arc interference buys. */
  interferenceArc: 1,
} as const

export function ringByIndex(index: RingIndex): RingConfig | undefined {
  return RINGS.find((r) => r.index === index)
}

/** Total slots across every ring — the formation's upper bound. */
export const TOTAL_SLOTS = RINGS.reduce((sum, r) => sum + r.slots, 0)

/**
 * Angle of a slot, given the ring's current phase. The single place this
 * conversion happens; nothing else should reimplement it.
 */
export function slotAngle(ring: RingConfig, slot: number, phase: number): number {
  return (slot / ring.slots) * Math.PI * 2 + phase
}
