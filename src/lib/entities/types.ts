
export type EntityId = number

export type RingIndex = 0 | 1 | 2 | 3 | 4

export interface SlotRef {
  ring: RingIndex
  slot: number
}

export interface Vec2 {
  x: number
  y: number
}

export type DamageType = 'shear' | 'percussive' | 'thermal' | 'resonant'

export type ArmourClass = 'massed' | 'rigid' | 'seized' | 'erratic'

export type TargetingPolicy =
  | 'nearest'
  | 'lowestHp'
  | 'highestThreat'
  | 'deepest'
  | 'none'

export type UnitRole = 'tank' | 'damage' | 'support' | 'control'

export type ConjunctionScale = 'minor' | 'major' | 'grand'

export interface Damageable {
  hp: number
  maxHp: number
}

export interface ContentDef {
  readonly id: string
  readonly name: string

  readonly description: string

  readonly assetKey?: string
}

export interface TimedBonus {
  magnitude: number
  remaining: number
}
