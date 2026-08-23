import type { ArmourClass, ContentDef, EntityId, Vec2 } from './types'

export type ContactTier =

  | 'basic'

  | 'elite'

  | 'specialist'

export type ContactMotion =
  | 'swarm'

  | 'drift'

  | 'charge'

  | 'orbit'

export interface ContactTraits {
  readonly splitsInto?: { defId: string; count: number }

  readonly shieldHits?: number

  readonly vulnerableWhileTelegraphing?: number

  readonly orbitRadius?: number

  readonly wardsNearby?: { radius: number; reduction: number }
}

export interface ContactDef extends ContentDef {
  readonly tier: ContactTier
  readonly armour: ArmourClass
  readonly motion: ContactMotion

  readonly maxHp: number
  readonly attack: number
  readonly defence: number

  readonly speed: number

  readonly hurtboxRadius: number

  readonly patternId: string

  readonly patternInterval: number

  readonly baseDrop: number

  readonly threatWeight: number

  readonly traits?: ContactTraits
}

export interface ContactInstance {
  readonly id: EntityId
  readonly def: ContactDef

  position: Vec2
  velocity: Vec2

  hp: number
  maxHp: number

  scaledAttack: number

  patternCooldown: number

  telegraphRemaining: number

  shieldHitsRemaining: number

  hitFlash: number

  damageScale: number
}

export function distanceToCentre(contact: ContactInstance): number {
  const { x, y } = contact.position
  return Math.sqrt(x * x + y * y)
}
