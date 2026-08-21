import type { Damageable } from './types'

/**
 * The Mainspring — the defended objective at the centre of the field.
 *
 * Its health stat is Tension. At zero the Orrery stops and the **stage** is
 * lost; the *run* is not (docs/design/game-loop.md). Losing costs time, never
 * progress, which is what keeps failure from reading as punishment (P5).
 *
 * This entity holds state and the rules that are intrinsic to it (what damage
 * does, what a repair costs). Rules about *the stage* — when it is lost, when it
 * is cleared, how waves advance — live in systems/objectiveRules.ts, because
 * they depend on the whole simulation rather than on this object alone.
 */

export interface MainspringState extends Damageable {
  /** Alias of hp, in the game's own vocabulary. */
  readonly tension: number
  readonly maxTension: number

  /**
   * Collision radius — deliberately smaller than the rendered sprite so near
   * misses read as misses. See combat-spec.md §5.
   */
  readonly hitboxRadius: number

  /** Tension per second while recovering. See `REGEN_IN_COMBAT`. */
  regenPerSecond: number

  /** Absorbs damage before Tension. Granted by conjunctions and upgrades. */
  shield: number
  /** Seconds until the shield lapses. Zero means no active shield. */
  shieldRemaining: number

  /** Set on hit so the render layer can react without polling the sim. */
  hitFlash: number

  /** Emergency repairs used this stage. Drives the escalating cost. */
  repairsThisStage: number

  /** Lowest Tension fraction reached. Feeds achievements and telemetry. */
  lowestFraction: number

  /**
   * Tension fraction at the end of the previous tick.
   *
   * Threshold crossings are detected against this rather than within a single
   * function, because damage lands at steps 6-8 of the tick while recovery runs
   * at step 2 (combat-spec.md section 8). Comparing inside one step would
   * compare a value to itself.
   */
  previousFraction: number
}

export const MAINSPRING_HITBOX_RADIUS = 28

/**
 * Regeneration is paused while a wave is live.
 *
 * Decided in Phase 12. `game-loop.md` says damage carries into the next wave as
 * reduced Tension — continuous regeneration would erode that, letting sustained
 * pressure be out-healed rather than survived. Confining recovery to the gap
 * between waves keeps the carry-over meaningful and turns the gap into a real
 * beat instead of dead time.
 */
export const REGEN_IN_COMBAT = false

/** Fraction of max Tension an emergency repair restores. economy-spec.md §1. */
export const REPAIR_FRACTION = 0.25

/** Thresholds that fire an event when crossed downward. */
export const TENSION_THRESHOLDS = [0.5, 0.25, 0.1] as const

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
    shieldRemaining: 0,
    hitFlash: 0,
    repairsThisStage: 0,
    lowestFraction: 1,
    previousFraction: 1,
  }
}

/** The stage-loss condition. The only thing that ends a stage unsuccessfully. */
export function isOverwhelmed(m: MainspringState): boolean {
  return m.hp <= 0
}

export function tensionFraction(m: MainspringState): number {
  return m.maxHp > 0 ? m.hp / m.maxHp : 0
}

/**
 * Grant a shield. A stronger shield replaces a weaker one rather than stacking;
 * stacking would let a player bank conjunctions into an invulnerability window,
 * which fights the "no wall" principle in economy-spec.md §5.
 */
export function grantShield(m: MainspringState, amount: number, duration: number): void {
  if (amount >= m.shield) {
    m.shield = amount
    m.shieldRemaining = duration
  } else {
    // A weaker grant only extends an existing shield's life.
    m.shieldRemaining = Math.max(m.shieldRemaining, duration)
  }
}

/*
 * The cost of a repair lives in `progression/currencies.ts` with the other
 * three Filings sinks, not here. It had its curve inline as default parameters
 * — the drift CLAUDE.md's convention exists to prevent — and an entity reaching
 * into `content/` to fix that would have inverted the layering instead.
 */

/**
 * Emergency repair: restore a fixed fraction of maximum Tension.
 *
 * Returns false when already at full, so the caller never charges for nothing.
 * The escalating cost is what keeps this a panic button rather than a strategy
 * (economy-spec.md invariant 6).
 */
export function repair(m: MainspringState): boolean {
  if (m.hp >= m.maxHp) return false
  m.hp = Math.min(m.maxHp, m.hp + m.maxHp * REPAIR_FRACTION)
  m.repairsThisStage++
  return true
}
