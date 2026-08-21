import type { ArmourClass, ContentDef, EntityId, Vec2 } from './types'

/**
 * Slack — the creatures of the Unwinding. Not an invading faction; condensed
 * lost tension, moving down the tension gradient toward the Mainspring
 * (docs/design/narrative.md).
 *
 * Unlike Movements and Chimes, Slack are free-moving and carry a resolved
 * cartesian position rather than a slot reference.
 */

/** Broad motion archetype. Concrete curves live in systems/spawn.ts. */
export type SlackMotion =
  | 'swarm'
  /** Straight in, steady pace. */
  | 'drift'
  /** Accelerates once inside a threshold radius. */
  | 'charge'
  /** Orbits at a fixed radius while firing. */
  | 'orbit'

/** Behavioural hooks, reskinned per Phase 15. */
export interface SlackTraits {
  /** Spawns smaller Slack on death. */
  readonly splitsInto?: { defId: string; count: number }
  /** Absorbs a fixed number of hits before taking HP damage. */
  readonly shieldHits?: number
  /** Multiplies incoming damage while telegraphing — a fairness window. */
  readonly vulnerableWhileTelegraphing?: number
}

export interface SlackDef extends ContentDef {
  readonly armour: ArmourClass
  readonly motion: SlackMotion

  readonly maxHp: number
  readonly attack: number
  readonly defence: number
  /** Pixels per second, before wave scaling. */
  readonly speed: number

  /** Id into content/patterns — what this Slack fires. */
  readonly patternId: string
  /** Seconds between pattern emissions. */
  readonly patternInterval: number

  /** Filings dropped on death, before zone and tree multipliers. */
  readonly baseDrop: number

  /**
   * Contribution to the threat score that `highestThreat` targeting reads.
   * Combined with proximity to the Mainspring in systems/ai.ts.
   */
  readonly threatWeight: number

  readonly traits?: SlackTraits
}

export interface SlackInstance {
  readonly id: EntityId
  readonly def: SlackDef

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

/** Distance from the Mainspring, which sits at the origin. */
export function distanceToCentre(slack: SlackInstance): number {
  const { x, y } = slack.position
  return Math.sqrt(x * x + y * y)
}
