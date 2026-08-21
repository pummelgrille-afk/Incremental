import type { ContentDef, EntityId, TargetingPolicy, UnitRole } from './types'

/**
 * A Chime — ranged support mounted on the static rim.
 *
 * Chimes differ from Movements on five axes, and all five must survive
 * balancing or one will collapse into the other (combat-spec.md §4):
 *
 *   1. Position   static rim mount, not a rotating slot
 *   2. Range      whole field, any ring
 *   3. Resource   consumes Charge, which regenerates
 *   4. Conjunction  never participates
 *   5. Targeting  predictive — leads moving targets
 *
 * Because they do not rotate, Chimes are the player's stable reference frame
 * while everything else turns.
 */

export interface ChimeDef extends ContentDef {
  readonly role: UnitRole

  readonly maxHp: number
  readonly attack: number
  readonly defence: number
  readonly baseInterval: number

  /** Chimes are always Resonant — see combat-spec.md §7. Not configurable. */
  readonly damageType: 'resonant'

  /** Shots held at once. Burst, not sustained damage. */
  readonly maxCharge: number
  /** Seconds to regain one charge. */
  readonly chargeInterval: number

  readonly targeting: TargetingPolicy
  /** Pixels per second; also the lead calculation's divisor. */
  readonly projectileSpeed: number

  readonly unlockCost: number
}

export interface ChimeInstance {
  readonly id: EntityId
  readonly def: ChimeDef

  /** Index into the rim's mount points. Static — the rim does not rotate. */
  mount: number
  level: number

  hp: number
  maxHp: number

  /** Fractional so regeneration is smooth; floor before spending. */
  charge: number
  cooldownRemaining: number

  targetId: EntityId | null
  timeSinceRetarget: number

  disabledFor: number

  attackMultiplier: number
  hasteBonus: number
}

/** A Chime can fire only with at least one whole charge banked. */
export function canFire(chime: ChimeInstance): boolean {
  return chime.charge >= 1 && chime.cooldownRemaining <= 0 && chime.disabledFor <= 0
}
