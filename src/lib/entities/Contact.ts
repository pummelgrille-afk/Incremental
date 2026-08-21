import type { ArmourClass, ContentDef, EntityId, Vec2 } from './types'

/**
 * Contact — the creatures of the Approach. Not an invading faction; condensed
 * lost output, moving down the output gradient toward the Sun
 * (docs/design/narrative.md).
 *
 * Unlike Platforms and Arrays, Contact are free-moving and carry a resolved
 * cartesian position rather than a slot reference.
 */

/**
 * Roster tier — Phase 31.
 *
 * Not a label. The tier a Contact carries changes how the wave director treats
 * it: the over-level bonus adds **basic** Contacts only. Pressure on a player
 * who has out-levelled a stage should arrive as more bodies, never as more set
 * pieces, or over-levelling would change a stage's character instead of its
 * difficulty — and a stage whose two Shells quietly became five is a different
 * puzzle, not a harder one. See systems/scaling.ts.
 */
export type ContactTier =
  /** Fills waves. Cheap, numerous, individually unthreatening. */
  | 'basic'
  /** A step up in body and bite. Arrives escorted or in small groups. */
  | 'elite'
  /** Demands a specific answer rather than more damage. */
  | 'specialist'

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

  /**
   * Other Contacts within `radius` take `1 - reduction` of incoming damage.
   *
   * The roster's one Contact that punishes *ignoring* it rather than
   * mispositioning against it. Everything else can be answered by killing it
   * in whatever order it arrives; a Warden has to be killed **first**, which is
   * the only reason `highestThreat` targeting is a real choice rather than a
   * synonym for "closest big thing".
   *
   * **This was a heal first, and the heal did not work.** Measured across a
   * full stage-3 clear it put back 4 HP in total: Contacts here die in one or
   * two hits, so almost nothing survives damaged long enough to be repaired,
   * and the trait was decorative. Damage reduction cannot be no-opped by
   * killing quickly — it applies to the very first hit — so the aura is felt
   * whether the wave is being deleted or ground down.
   *
   * Never applies to the Warden itself. A self-warding Contact is just one with
   * more effective HP, and the decision it exists to create would disappear.
   */
  readonly wardsNearby?: { radius: number; reduction: number }
}

export interface ContactDef extends ContentDef {
  readonly tier: ContactTier
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

  /**
   * Multiplier on incoming damage from nearby Wardens. 1 when unwarded.
   *
   * Recomputed once per tick by `updateWards` rather than looked up inside
   * `damageContact`. Damage is applied from four call sites and several times
   * per Contact per tick; scanning for Wardens at each one would turn an O(n)
   * pass into an O(n·hits) one for a number that cannot change between them.
   */
  damageScale: number
}

/** Distance from the Sun, which sits at the origin. */
export function distanceToCentre(contact: ContactInstance): number {
  const { x, y } = contact.position
  return Math.sqrt(x * x + y * y)
}
