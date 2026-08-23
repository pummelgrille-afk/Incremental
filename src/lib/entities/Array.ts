import type { ContentDef, EntityId, TargetingPolicy, UnitRole } from './types'

export type ShotProfile =

  | { readonly kind: 'single' }

  | { readonly kind: 'pierce'; readonly targets: number }

  | { readonly kind: 'burst'; readonly radius: number }

export interface ArrayDef extends ContentDef {
  readonly role: UnitRole

  readonly maxHp: number
  readonly attack: number
  readonly defence: number
  readonly baseInterval: number

  readonly damageType: 'resonant'

  readonly maxCharge: number

  readonly chargeInterval: number

  readonly targeting: TargetingPolicy

  readonly projectileSpeed: number

  readonly shot: ShotProfile

  readonly unlockCost: number
}

export interface ArrayInstance {
  readonly id: EntityId
  readonly def: ArrayDef

  mount: number
  level: number

  hp: number
  maxHp: number

  charge: number
  cooldownRemaining: number

  targetId: EntityId | null
  timeSinceRetarget: number

  disabledFor: number

  levelScale: number

  maxCharge: number
  chargeInterval: number

  attackScale: number
}

export function canFire(array: ArrayInstance): boolean {
  return array.charge >= 1 && array.cooldownRemaining <= 0 && array.disabledFor <= 0
}
