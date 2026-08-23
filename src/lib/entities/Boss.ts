import type { ArmourClass, ContentDef, EntityId } from './types'

export interface BossPhaseDef {
  readonly name: string

  readonly fromHpFraction: number
  readonly patternId: string
  readonly patternInterval: number

  readonly summons?: {
    readonly defId: string
    readonly count: number
    readonly everySeconds: number
  }
}

export interface BossDef extends ContentDef {
  readonly armour: ArmourClass

  readonly maxHp: number
  readonly attack: number
  readonly defence: number
  readonly speed: number
  readonly hurtboxRadius: number
  readonly baseDrop: number

  readonly phases: readonly BossPhaseDef[]

  readonly phaseTelegraphMs: number

  readonly firstClearSalvage: number
}

export interface BossRuntime {
  readonly def: BossDef

  readonly contactId: EntityId

  phaseIndex: number

  transitionRemaining: number

  summonCooldown: number

  announced: string | null
}

export function phaseAt(def: BossDef, hpFraction: number): number {
  let index = 0
  for (let i = 0; i < def.phases.length; i++) {
    if (hpFraction <= def.phases[i].fromHpFraction) index = i
  }
  return index
}
