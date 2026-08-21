import type { ArmourClass, ContentDef, EntityId, Vec2 } from './types'

/**
 * Contact — the creatures of the Approach. Not an invading faction; condensed
 * lost output, moving down the output gradient toward the Sun
 * (docs/design/narrative.md).
 *
 * Unlike Platforms and Arrays, Contact are free-moving and carry a resolved
 * cartesian position rather than a slot reference.
 */

/** Broad motion archetype. Concrete curves live in systems/spawn.ts. */
export type ContactMotion =
  | 'swarm'
  /** Straight in, steady pace. */
  | 'drift'
  /** Accelerates once inside a threshold radius. */
  | 'charge'
  /** Orbits at a fixed radius while firing. */
  | 'orbit'

/** Behavioural hooks, reskinned per Phase 15. */
export interface ContactTraits {
  /**
   * Spawns smaller Contact on death.
   *
   * Content must not create a split cycle (A spawning A, directly or through a
   * chain) — nothing clamps this at runtime, and a cycle would spawn without
   * bound. Guarded by `tests/spawn.test.ts`.
   */
  readonly splitsInto?: { defId: string; count: number }

  /** Absorbs a fixed number of hits before taking HP damage. */
  readonly shieldHits?: number

  /**
   * Multiplies incoming damage while this Contact is telegraphing.
   *
   * A fairness window: the moment a Contact becomes dangerous is also the moment
   * it is most worth shooting, so a player who reads the telegraph is rewarded
   * for acting on it rather than only for avoiding it.
   */
  readonly vulnerableWhileTelegraphing?: number

  /**
   * Radius an `orbit` Contact settles at before circling. Ignored by every other
   * motion archetype.
   */
  readonly orbitRadius?: number
}

export interface ContactDef extends ContentDef {
  readonly armour: ArmourClass
  readonly motion: ContactMotion

  readonly maxHp: number
  readonly attack: number
  readonly defence: number
  /** Pixels per second, before wave scaling. */
  readonly speed: number

  /**
   * Collision radius, **decoupled from sprite bounds** (combat-spec.md §5).
   *
   * Deliberately generous relative to what is drawn, which favours the player:
   * a shot that looks like a graze counts as a hit. The Sun's hitbox is
   * decoupled the other way — smaller than drawn — so near misses read as
   * misses. Both err toward the player.
   *
   * Phase 37 sets sprite sizes; this number must not follow them.
   */
  readonly hurtboxRadius: number

  /** Id into content/patterns — what this Contact fires. */
  readonly patternId: string
  /** Seconds between pattern emissions. */
  readonly patternInterval: number

  /** Salvage dropped on death, before zone and tree multipliers. */
  readonly baseDrop: number

  /**
   * Contribution to the threat score that `highestThreat` targeting reads.
   * Combined with proximity to the Sun in systems/ai.ts.
   */
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

  /** Scaled stats for the current stage — see economy-spec.md §5. */
  scaledAttack: number

  /** Counts down to the next pattern emission. */
  patternCooldown: number
  /** Non-zero while telegraphing; no projectiles spawn until it hits zero. */
  telegraphRemaining: number

  shieldHitsRemaining: number

  /** Set on hit so the render layer can flash without querying the sim. */
  hitFlash: number
}

/** Distance from the Sun, which sits at the origin. */
export function distanceToCentre(contact: ContactInstance): number {
  const { x, y } = contact.position
  return Math.sqrt(x * x + y * y)
}
