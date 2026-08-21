import type { MovementInstance, UnitBuffs } from '../entities/Movement'
import type { TimedBonus } from '../entities/types'
import type { SimulationState } from '../core/simulation'
import { noUpgradeEffects } from '../entities/Upgrade'

/** Neutral aggregate, so a caller without a run still gets sensible numbers. */
const NO_EFFECTS = noUpgradeEffects()

/**
 * Timed buffs, and the one rule that governs all of them.
 *
 * **The stronger grant wins; an equal-or-weaker grant only extends the life of
 * what is already there.** Nothing accumulates.
 *
 * This is not a new decision — combat-spec.md §5 already states it for the
 * Mainspring's shield, with the reasoning that stacking would let a player bank
 * conjunctions into an invulnerability window and defeat the no-wall principle
 * (economy-spec.md §5). The same argument applies to a Movement, which is why
 * one rule now covers both rather than two similar-looking pieces of code
 * drifting apart. `Mainspring.grantShield` implements it directly for the
 * objective's own fields; a test asserts the two behave identically.
 *
 * Conjunctions fire on a 6 s cooldown and buffs last 4–5 s, so stacking would
 * have been close to permanent uptime rather than an occasional window.
 */

export type { TimedBonus }

export function createBonus(): TimedBonus {
  return { magnitude: 0, remaining: 0 }
}

export function createBuffs(): UnitBuffs {
  return { haste: createBonus(), attack: createBonus(), shield: createBonus() }
}

/**
 * Grant a bonus under the replace-or-extend rule.
 *
 * Magnitudes are **non-negative by contract**. Debuffs need a sign-aware
 * comparison — "stronger" for a penalty means *more* negative — and no content
 * authors one yet, so the rule is not guessed at here. Phase 31's Slack roster
 * is where a debuff would first appear; it owns designing that half.
 */
export function grantBonus(bonus: TimedBonus, magnitude: number, duration: number): void {
  if (magnitude < 0) throw new RangeError('buff magnitudes are non-negative')

  if (magnitude >= bonus.magnitude) {
    bonus.magnitude = magnitude
    bonus.remaining = duration
  } else {
    bonus.remaining = Math.max(bonus.remaining, duration)
  }
}

/**
 * Age one bonus. Expiry zeroes the magnitude as well as the clock, so a lapsed
 * buff can never be read as a live one.
 */
export function tickBonus(bonus: TimedBonus, dt: number): void {
  if (bonus.remaining <= 0) return

  bonus.remaining -= dt
  if (bonus.remaining <= 0) {
    bonus.remaining = 0
    bonus.magnitude = 0
  }
}

/**
 * Spend a shield pool.
 *
 * A shield is the one bonus that depletes through use as well as through time,
 * so its `magnitude` is the live pool rather than a cached strength. Draining
 * it to zero also clears the clock — otherwise a spent shield would keep
 * blocking weaker re-grants until its original duration ran out.
 */
export function absorb(bonus: TimedBonus, amount: number): number {
  const absorbed = Math.min(bonus.magnitude, amount)
  bonus.magnitude -= absorbed
  if (bonus.magnitude <= 0) {
    bonus.magnitude = 0
    bonus.remaining = 0
  }
  return absorbed
}

/** Drop everything transient. Used when a unit is disabled. */
export function clearBuffs(buffs: UnitBuffs): void {
  for (const bonus of [buffs.haste, buffs.attack, buffs.shield]) {
    bonus.magnitude = 0
    bonus.remaining = 0
  }
}

/**
 * Age every Movement's buffs.
 *
 * Replaces a placeholder that decayed magnitudes at fixed rates unrelated to
 * anything authored — and which, because level scaling shared the
 * `attackMultiplier` field, quietly eroded a levelled unit's damage back to
 * base within a few seconds of combat. Level scaling now lives on its own
 * `levelScale` field, which nothing decays.
 */
export function updateBuffs(sim: SimulationState, dt: number): void {
  for (const movement of sim.movements) {
    tickBonus(movement.buffs.haste, dt)
    tickBonus(movement.buffs.attack, dt)
    tickBonus(movement.buffs.shield, dt)
  }
}

/**
 * Total attack multiplier: level scaling, formation, tree, then buffs.
 *
 * Four independent sources multiplied rather than summed, because each answers
 * a different question — how levelled, how well placed, how invested, how
 * buffed right now. Summing them would let a formation bonus substitute for a
 * level, which is not the trade any of them is offering.
 */
export function attackScaleOf(movement: MovementInstance, effects = NO_EFFECTS): number {
  return (
    movement.levelScale *
    (1 + movement.bonuses.attack) *
    (1 + effects.attack) *
    (1 + movement.buffs.attack.magnitude)
  )
}

/** Seconds between attacks after haste, from the tree and from buffs alike. */
export function attackIntervalOf(movement: MovementInstance, effects = NO_EFFECTS): number {
  return movement.def.baseInterval / (1 + effects.haste + movement.buffs.haste.magnitude)
}
