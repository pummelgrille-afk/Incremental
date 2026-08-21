import type { Damageable } from './types'

/**
 * The Mainspring — the defended objective at the centre of the field.
 *
 * Its health stat is Tension. At zero the Orrery stops and the stage is lost;
 * the *run* is not (docs/design/game-loop.md, "Win and loss conditions"). Losing
 * costs time, never progress.
 */

export interface MainspringState extends Damageable {
  /** Alias of hp, in the game's own vocabulary. Kept in sync by combat.ts. */
  readonly tension: number
  readonly maxTension: number

  /**
   * Collision radius — deliberately smaller than the rendered sprite so near
   * misses read as misses. See combat-spec.md §5.
   */
  readonly hitboxRadius: number

  /** Tension per second, if the Bracing branch has unlocked regeneration. */
  regenPerSecond: number

  /** Absorbs damage before Tension. Granted by conjunctions and upgrades. */
  shield: number

  /** Set on hit so the render layer can react without polling the sim. */
  hitFlash: number
}

export const MAINSPRING_HITBOX_RADIUS = 28

export function createMainspring(maxTension: number): MainspringState {
  return {
    hp: maxTension,
    maxHp: maxTension,
    get tension() {
      return this.hp
    },
    get maxTension() {
      return this.maxHp
    },
    hitboxRadius: MAINSPRING_HITBOX_RADIUS,
    regenPerSecond: 0,
    shield: 0,
    hitFlash: 0,
  }
}

/** The stage-loss condition. The only thing that ends a stage unsuccessfully. */
export function isOverwhelmed(m: MainspringState): boolean {
  return m.hp <= 0
}
