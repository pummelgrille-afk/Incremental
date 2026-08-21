import type { ArmourClass, ContentDef, EntityId } from './types'

/**
 * A boss — a milestone encounter, one per boss stage.
 *
 * **A boss is a Contact.** It is spawned as a `ContactInstance` from a
 * synthesized `ContactDef`, so it inherits motion, hurtboxes, the damage
 * formula, armour matchups, telegraphs and pattern emission without a second
 * implementation of any of them. A parallel boss pipeline would be four systems
 * that drift apart, and the first thing to drift would be the damage formula.
 *
 * What a boss adds on top is exactly one thing: **phases**. Nothing else about
 * it is special-cased.
 *
 * Lore in docs/design/narrative.md §Bosses. Every boss there is a *failure of
 * the watch given form* — never a creature, never a person. That rule survived
 * the reskin and is the main thing keeping the bestiary from becoming somebody
 * else's.
 */

/**
 * One phase of an encounter.
 *
 * A phase changes **what the boss fires and how often**, and nothing else. Its
 * armour, speed and hurtbox stay put for the whole fight.
 *
 * That restraint is deliberate. Letting a phase swap armour class would mean a
 * player's counter-pick stops working halfway through a fight they already
 * committed a formation to — and formations cannot be changed mid-stage
 * (game-loop.md). A boss is allowed to get harder to *dodge*; it is not allowed
 * to retroactively invalidate the build brought to it.
 */
export interface BossPhaseDef {
  /** Human-readable, for the phase-change banner. */
  readonly name: string
  /**
   * Enters at or below this fraction of max HP. The first phase must be 1.
   * Ordered high to low; validated by test.
   */
  readonly fromHpFraction: number
  readonly patternId: string
  readonly patternInterval: number
  /**
   * Trash spawned while this phase runs, or nothing.
   *
   * The one place a boss stage stops being a single encounter. Kept off the
   * opening phase of every boss so the fight reads as a duel before it becomes
   * a crowd.
   */
  readonly summons?: {
    readonly defId: string
    readonly count: number
    readonly everySeconds: number
  }
}

export interface BossDef extends ContentDef {
  readonly armour: ArmourClass
  /** Before the stage curve and `bossHpMultiplier`. */
  readonly maxHp: number
  readonly attack: number
  readonly defence: number
  readonly speed: number
  readonly hurtboxRadius: number
  readonly baseDrop: number

  readonly phases: readonly BossPhaseDef[]

  /**
   * Seconds of warning when a phase changes.
   *
   * A phase change is the one moment a boss's behaviour changes underneath a
   * player who has already read it, so it is telegraphed like any other attack
   * — combat-spec.md §5's rule applies to the transition, not just to the
   * pattern that follows it. Held above `MIN_TELEGRAPH_MS` by test.
   */
  readonly phaseTelegraphMs: number

  /** Salvage bounty on the first clear only. Unique per boss. */
  readonly firstClearSalvage: number
}

/**
 * Live encounter state, held on the simulation alongside the boss's Contact.
 *
 * Separate from `ContactInstance` rather than bolted onto it: exactly one boss
 * exists at a time, and putting five boss-only fields on every Skiff to serve
 * it would cost more than it saves.
 */
export interface BossRuntime {
  readonly def: BossDef
  /** The `ContactInstance` carrying the fight. */
  readonly contactId: EntityId
  /** Index into `def.phases`. */
  phaseIndex: number
  /** Counts down while the phase change is telegraphing; no firing meanwhile. */
  transitionRemaining: number
  /** Counts down to the next summon volley in the current phase. */
  summonCooldown: number
  /** Set for one tick when a phase begins, for the banner. */
  announced: string | null
}

/** The phase a boss should be in at a given HP fraction. */
export function phaseAt(def: BossDef, hpFraction: number): number {
  // Walk forward: phases are ordered high to low, so the last one whose
  // threshold the boss has fallen to is the live one.
  let index = 0
  for (let i = 0; i < def.phases.length; i++) {
    if (hpFraction <= def.phases[i].fromHpFraction) index = i
  }
  return index
}
