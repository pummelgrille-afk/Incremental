import type {
  ContentDef,
  DamageType,
  EntityId,
  SlotRef,
  TargetingPolicy,
  UnitRole,
  ConjunctionScale,
  TimedBonus,
} from './types'

export interface ConjunctionEffect {
  kind: 'damagePulse' | 'shield' | 'haste' | 'repair'

  magnitude: number

  duration?: number
}

export interface PlatformDef extends ContentDef {
  readonly role: UnitRole
  readonly damageType: DamageType

  readonly maxHp: number
  readonly attack: number
  readonly defence: number

  readonly baseInterval: number

  readonly angularReach: number

  readonly radialReach: number

  readonly targeting: TargetingPolicy

  readonly blockArc: number

  readonly conjunctionEffect: ConjunctionEffect

  readonly unlockCost: number
}

export interface PlatformInstance {
  readonly id: EntityId
  readonly def: PlatformDef

  slot: SlotRef
  level: number

  hp: number
  maxHp: number

  cooldownRemaining: number

  targetId: EntityId | null
  timeSinceRetarget: number

  disabledFor: number

  hitFlash: number

  bonuses: FormationBonuses

  levelScale: number

  buffs: UnitBuffs
}

export interface UnitBuffs {
  haste: TimedBonus

  attack: TimedBonus

  shield: TimedBonus
}

export interface FormationBonuses {
  attack: number
  defence: number
  range: number
}

export const NO_FORMATION_BONUSES: Readonly<FormationBonuses> = Object.freeze({
  attack: 0,
  defence: 0,
  range: 0,
})

export function conjunctionScaleOf(participants: number): ConjunctionScale {
  if (participants >= 4) return 'grand'
  if (participants === 3) return 'major'
  return 'minor'
}
