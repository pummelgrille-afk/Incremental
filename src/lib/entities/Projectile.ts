import type { DamageType, EntityId, Vec2 } from './types'

/**
 * A projectile. Pooled from the first line of code that spawns one — at the
 * budget in balancing.csv (600, up to 1200) allocation churn would dominate
 * the frame. See utils/pool.ts, Phase 11.
 *
 * There is deliberately no ProjectileDef: projectiles are not authored content.
 * They are produced by pattern functions in systems/patterns.ts, which own
 * their shape and timing.
 */

export type ProjectileFaction = 'slack' | 'chime'

export interface Projectile {
  readonly id: EntityId

  /** Pooled entities are recycled; `active` gates every system that reads them. */
  active: boolean

  faction: ProjectileFaction
  position: Vec2
  velocity: Vec2

  damage: number
  damageType: DamageType

  /** Collision radius. Decoupled from sprite bounds for fairness (§5). */
  radius: number

  /** Seconds before self-despawn, so strays cannot leak out of the pool. */
  lifetime: number

  /**
   * Set for projectiles that curve. Radians per second applied to the
   * velocity vector — this is what makes spiral patterns cheap.
   */
  angularVelocity: number

  /** Which Chime or Slack fired it, for kill attribution and telemetry. */
  sourceId: EntityId
}

/** Reset a pooled projectile to a known-inert state before reuse. */
export function deactivate(p: Projectile): void {
  p.active = false
  p.velocity.x = 0
  p.velocity.y = 0
  p.angularVelocity = 0
  p.lifetime = 0
  p.damage = 0
}
