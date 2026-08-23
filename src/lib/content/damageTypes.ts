import type { ArmourClass, DamageType } from '../entities/types'

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
