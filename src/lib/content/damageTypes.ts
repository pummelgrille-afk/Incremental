import type { ArmourClass, DamageType } from '../entities/types'

/**
 * Type interaction matrix. Mirrors docs/design/combat-spec.md §7 and the
 * `types` rows of balancing.csv.
 *
 * Two independent pairs — Shear↔Percussive and Thermal↔Resonant — rather than
 * a four-way cycle. A cycle would force one correct answer per wave; two pairs
 * leave most waves with two workable builds, which is the freedom the formation
 * puzzle needs.
 */

export const FAVOURABLE = 1.5
export const UNFAVOURABLE = 0.75
export const NEUTRAL = 1.0

const MATRIX: Record<DamageType, Record<ArmourClass, number>> = {
  shear: { massed: FAVOURABLE, rigid: UNFAVOURABLE, seized: NEUTRAL, erratic: NEUTRAL },
  percussive: { massed: UNFAVOURABLE, rigid: FAVOURABLE, seized: NEUTRAL, erratic: NEUTRAL },
  thermal: { massed: NEUTRAL, rigid: NEUTRAL, seized: FAVOURABLE, erratic: UNFAVOURABLE },
  resonant: { massed: NEUTRAL, rigid: NEUTRAL, seized: UNFAVOURABLE, erratic: FAVOURABLE },
}

export function typeMultiplier(damage: DamageType, armour: ArmourClass): number {
  return MATRIX[damage][armour]
}

/**
 * Invariant from economy-spec.md §7: multipliers stay within 0.75–1.5. Widening
 * the band makes off-type units feel useless and collapses roster diversity.
 * Asserted by tests so a tuning pass cannot silently violate it.
 */
export const MULTIPLIER_BOUNDS = { min: 0.75, max: 1.5 } as const

export const ALL_DAMAGE_TYPES: readonly DamageType[] = [
  'shear',
  'percussive',
  'thermal',
  'resonant',
] as const

export const ALL_ARMOUR_CLASSES: readonly ArmourClass[] = [
  'massed',
  'rigid',
  'seized',
  'erratic',
] as const
