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

/**
 * Live state.
 *
 * **Chimes cannot currently be damaged.** They are mounted on the rim, outside
 * the field of fire — Slack spawn at that radius and move inward, and Slack
 * projectiles travel inward toward the Mainspring, so nothing ever reaches a
 * mount. That is deliberate: a Chime's cost is contributing *no defence at all*
 * (it has no block arc) and being gated by Charge, not fragility.
 *
 * `hp`, `maxHp` and `disabledFor` are therefore inert today. They are kept
 * because level scaling already writes `maxHp` and because Phase 25 may
 * introduce durability; the recovery path in ai.ts is the mechanism that would
 * carry it. Documented rather than deleted so the state is not silently a lie.
 */
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
