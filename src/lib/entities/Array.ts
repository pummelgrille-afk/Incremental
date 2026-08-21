import type { ContentDef, EntityId, TargetingPolicy, UnitRole } from './types'

/**
 * A Array — ranged support mounted on the static rim.
 *
 * Arrays differ from Platforms on five axes, and all five must survive
 * balancing or one will collapse into the other (combat-spec.md §4):
 *
 *   1. Position   static rim mount, not a rotating slot
 *   2. Range      whole field, any ring
 *   3. Resource   consumes Charge, which regenerates
 *   4. Conjunction  never participates
 *   5. Targeting  predictive — leads moving targets
 *
 * Because they do not rotate, Arrays are the player's stable reference frame
 * while everything else turns.
 */

export interface ArrayDef extends ContentDef {
  readonly role: UnitRole

  readonly maxHp: number
  readonly attack: number
  readonly defence: number
  readonly baseInterval: number

  /** Arrays are always Resonant — see combat-spec.md §7. Not configurable. */
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
 * **Arrays cannot currently be damaged.** They are mounted on the rim, outside
 * the field of fire — Contact spawn at that radius and move inward, and Contact
 * projectiles travel inward toward the Sun, so nothing ever reaches a
 * mount. That is deliberate: a Array's cost is contributing *no defence at all*
 * (it has no block arc) and being gated by Charge, not fragility.
 *
 * `hp`, `maxHp` and `disabledFor` are therefore inert today. They are kept
 * because level scaling already writes `maxHp` and because Phase 25 may
 * introduce durability; the recovery path in ai.ts is the mechanism that would
 * carry it. Documented rather than deleted so the state is not silently a lie.
 */
export interface ArrayInstance {
  readonly id: EntityId
  readonly def: ArrayDef

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

  /**
   * Permanent multiplier from this unit's level. Arrays carry no timed buffs:
   * they do not participate in conjunctions (combat-spec.md §4), and nothing
   * else grants one. A `hasteBonus` field sat here unwritten until Phase 18.
   * Phase 25's support upgrades are where transient Array modifiers belong.
   */
  levelScale: number

  /**
   * Stats after the Array's upgrade tracks (progression/support.ts).
   *
   * Carried on the instance rather than read from the def, because a def is
   * immutable shared content — a save that has bought upgrades must never be
   * able to write into the roster every other save reads.
   */
  maxCharge: number
  chargeInterval: number
  /** Multiplier on `def.attack`, from the Resonance track. */
  attackScale: number
}

/** A Array can fire only with at least one whole charge banked. */
export function canFire(array: ArrayInstance): boolean {
  return array.charge >= 1 && array.cooldownRemaining <= 0 && array.disabledFor <= 0
}
