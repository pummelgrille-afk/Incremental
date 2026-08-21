import type {
  ContentDef,
  DamageType,
  EntityId,
  SlotRef,
  TargetingPolicy,
  UnitRole,
  ConjunctionScale,
  TimedBonus,
} from './types'

/**
 * A Movement — a wound automaton slotted onto a rotating ring. The front line.
 * Lore in docs/design/narrative.md; rules in docs/design/combat-spec.md §2.
 *
 * Naming note: in this codebase the noun "Movement" always means this entity,
 * never positional change. Use motion/velocity/advance for that. See CLAUDE.md.
 */

/**
 * What a conjunction does when this unit participates.
 *
 * `repair` was declared here for a phase and a half with no ally using it.
 * Untested configuration is where this project keeps finding bugs, so it is
 * gone until Phase 29's roster is large enough to carry a healer; re-adding a
 * case to one switch is cheap, and a dead branch is not.
 */
export interface ConjunctionEffect {
  kind: 'damagePulse' | 'shield' | 'haste'
  /** Base magnitude, scaled by the conjunction's scale and type pairing. */
  magnitude: number
  /**
   * Seconds the buff lasts. Required for everything except `damagePulse`,
   * which resolves instantly — enforced by test rather than by the type, so
   * content reads plainly.
   */
  duration?: number
}

/**
 * Immutable blueprint. Lives in content/allies.ts, never mutated at runtime.
 */
export interface MovementDef extends ContentDef {
  readonly role: UnitRole
  readonly damageType: DamageType

  readonly maxHp: number
  readonly attack: number
  readonly defence: number
  /** Seconds between attacks before haste. */
  readonly baseInterval: number

  /**
   * Reach along the unit's own ring, in radians. Note that the same angular
   * reach covers more arc *length* on an outer ring — see combat-spec.md §2.
   */
  readonly angularReach: number
  /** How many rings outward this unit can strike. 0 = own ring only. */
  readonly radialReach: number

  readonly targeting: TargetingPolicy
  /** Radians within which this unit absorbs a crossing projectile. */
  readonly blockArc: number

  readonly conjunctionEffect: ConjunctionEffect

  /** Keys unlock cost. Levelling multiplies stats — see progression/. */
  readonly unlockCost: number
}

/**
 * Live state. One per slotted unit, created by the stage loader and mutated by
 * systems. Never serialized directly — saves store the def id plus level.
 */
export interface MovementInstance {
  readonly id: EntityId
  readonly def: MovementDef

  slot: SlotRef
  level: number

  hp: number
  maxHp: number

  /** Counts down in seconds; the unit attacks when it crosses zero. */
  cooldownRemaining: number
  /** Set on kill/out-of-range, and every retargetInterval. */
  targetId: EntityId | null
  timeSinceRetarget: number

  /**
   * Disabled units are inert for recoveryTime, then restored at full HP.
   * Movements are never permanently lost — see combat-spec.md §5.
   */
  disabledFor: number

  /** Cached formation bonuses. Recomputed on formation change, not per tick. */
  bonuses: FormationBonuses

  /**
   * Permanent multiplier from this unit's level. **Never decays** — it shared a
   * field with transient buffs until Phase 18, which meant a levelled unit lost
   * its damage bonus within seconds of combat starting.
   */
  levelScale: number

  /** Transient modifiers. Stacking rules live in systems/buffs.ts. */
  buffs: UnitBuffs
}

/**
 * The timed modifiers a unit can carry.
 *
 * `shield` is the odd one: its magnitude is a live pool that damage depletes,
 * not a cached strength. The others are read-only multipliers.
 */
export interface UnitBuffs {
  /** Attack speed: interval is divided by (1 + magnitude). */
  haste: TimedBonus
  /** Damage: attack is multiplied by (1 + magnitude). */
  attack: TimedBonus
  /** Absorbs damage before HP. Depleted by hits as well as by time. */
  shield: TimedBonus
}

/** Additive bonuses from slot placement. See combat-spec.md §2. */
export interface FormationBonuses {
  attack: number
  defence: number
  range: number
}

export const NO_FORMATION_BONUSES: Readonly<FormationBonuses> = Object.freeze({
  attack: 0,
  defence: 0,
  range: 0,
})

/** Multiplier applied to a conjunction effect, by participant count. */
export function conjunctionScaleOf(participants: number): ConjunctionScale {
  if (participants >= 4) return 'grand'
  if (participants === 3) return 'major'
  return 'minor'
}
