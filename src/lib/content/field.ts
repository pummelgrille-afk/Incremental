import type { RingIndex } from '../entities/types'

/**
 * Field geometry. Mirrors docs/design/combat-spec.md §1 and the `field` and
 * `nudge` rows of docs/design/balancing.csv.
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
] as const

/**
 * Ring periods are deliberately non-integer ratios (8 : 14 : 22 = 4 : 7 : 11,
 * pairwise coprime) so alignments do not repeat on a short cycle. This is what
 * makes conjunction a planning problem rather than a metronome — see
 * narrative.md, "The Wander Rings".
 */

/** Chime mounts. The rim does not rotate. */
export const RIM_RADIUS = 320
export const RIM_MOUNTS = 8

/** Slack spawn at the rim and move inward. */
export const SPAWN_RADIUS = RIM_RADIUS

export const NUDGE = {
  /** Impulse is one slot-width, so the input means the same on every ring. */
  impulseSlots: 1,
  /** Seconds of eased travel. Not instant — see combat-spec.md §1. */
  duration: 0.4,
  /** Seconds, per ring, independent. */
  cooldown: 2.5,
} as const

export const CONJUNCTION = {
  /** Radians. 6° — the window within which units count as aligned. */
  tolerance: (6 * Math.PI) / 180,
  /** Milliseconds between synergy passes. Not every tick. */
  evalInterval: 100,
  /** Seconds, keyed on the participating slot set. */
  cooldown: 6,
  multipliers: { minor: 1.25, major: 1.6, grand: 2.2 },
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
