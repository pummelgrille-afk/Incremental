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

/**
 * Type pairing for conjunctions — combat-spec.md §3 rule 5.
 *
 * Two damage types **oppose** each other when each is favourable against
 * exactly what the other is unfavourable against. Derived from the matrix
 * rather than listed, so the two facts cannot drift apart: the pairs named in
 * this file's header (Shear↔Percussive, Thermal↔Resonant) fall straight out of
 * it, and a test asserts they still do.
 */
export function opposesType(a: DamageType, b: DamageType): boolean {
  if (a === b) return false
  return ALL_ARMOUR_CLASSES.every((armour) => {
    const left = MATRIX[a][armour]
    const right = MATRIX[b][armour]
    if (left === FAVOURABLE) return right === UNFAVOURABLE
    if (left === UNFAVOURABLE) return right === FAVOURABLE
    return right === NEUTRAL
  })
}

/**
 * How a conjunction's participants relate.
 *
 * - `matched` — every participant shares one damage type; the effect amplifies.
 * - `interference` — some pair opposes; the effect is weaker but reaches wider.
 * - `mixed` — neither; the effect is unmodified.
 *
 * `matched` is checked first and the two can never both hold, since a type does
 * not oppose itself.
 */
export type TypePairing = 'matched' | 'interference' | 'mixed'

export function pairingOf(types: readonly DamageType[]): TypePairing {
  if (types.length < 2) return 'mixed'
  if (types.every((t) => t === types[0])) return 'matched'

  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      if (opposesType(types[i], types[j])) return 'interference'
    }
  }
  return 'mixed'
}
