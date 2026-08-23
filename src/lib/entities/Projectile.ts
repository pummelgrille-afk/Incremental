import type { DamageType, EntityId, Vec2 } from './types'

export type ProjectileFaction = 'contact' | 'array'

export const MAX_PIERCE_MEMORY = 8

export interface Projectile {
  readonly id: EntityId

  active: boolean

  faction: ProjectileFaction
  position: Vec2
  velocity: Vec2

  damage: number
  damageType: DamageType

  radius: number

  lifetime: number

  angularVelocity: number

  pierceRemaining: number

  burstRadius: number

  hitIds: EntityId[]
  hitCount: number

  sourceId: EntityId

  sourceDefId: string
}

export function deactivate(p: Projectile): void {
  p.active = false
  p.velocity.x = 0
  p.velocity.y = 0
  p.angularVelocity = 0
  p.lifetime = 0
  p.damage = 0
  p.pierceRemaining = 0
  p.burstRadius = 0
  p.hitCount = 0
}
