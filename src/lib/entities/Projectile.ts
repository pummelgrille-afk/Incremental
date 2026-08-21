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

export type ProjectileFaction = 'contact' | 'array'

/** Most Contacts one piercing shot can remember having hit. */
export const MAX_PIERCE_MEMORY = 8

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

  /**
   * Remaining Contacts this shot may pass through before despawning.
   *
   * Flattened off `ShotProfile` into a plain number because projectiles are
   * pooled: a union or an object here would allocate per shot, which is the
   * exact churn the pool exists to avoid.
   */
  pierceRemaining: number

  /** Splash radius in px on impact. 0 for shots that do not splash. */
  burstRadius: number

  /**
   * Contacts this projectile has already damaged, as a fixed-capacity list.
   *
   * A single `lastHitId` is not enough and the difference is measurable. With
   * two Contacts whose hurtboxes overlap, a piercing shot hits A, then B, then
   * A again — because by then the "last" id is B. Measured on a two-Contact
   * cluster it dealt three hits' worth of damage for a two-target pierce, and
   * a wave of tightly packed Skiffs would have made a Transit the best unit in
   * the game for reasons no player could see.
   *
   * A preallocated array rather than a Set: projectiles are pooled precisely to
   * avoid per-shot allocation, and `hitCount` is small enough that the linear
   * scan is cheaper than hashing.
   */
  hitIds: EntityId[]
  hitCount: number

  /** Which Array or Contact fired it, for kill attribution and telemetry. */
  sourceId: EntityId

  /**
   * The *def* id behind `sourceId`.
   *
   * Carried on the projectile rather than looked up on impact: telemetry
   * attributes by type, and the firing unit may be dead by the time its shot
   * lands. Resolving it then would mean an O(n) scan for something that no
   * longer exists.
   */
  sourceDefId: string
}

/** Reset a pooled projectile to a known-inert state before reuse. */
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

/*
 * Note: `deactivate` is currently exported and called by nothing. The pool
 * deliberately does not clear on release — see utils/pool.ts, which documents
 * that a recycled object keeps its old field values and callers must fully
 * initialize it.
 *
 * That makes the *spawn site* the guarantee, not this function: every field a
 * shot's behaviour depends on has to be written on every acquire, or a Long
 * Baseline shot reusing a Transit's slot would silently pierce. Both spawners
 * do write all of them, and a test pins it.
 */
