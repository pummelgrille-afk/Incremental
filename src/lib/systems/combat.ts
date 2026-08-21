import type { MovementInstance } from '../entities/Movement'
import type { SlackInstance } from '../entities/Slack'
import type { ArmourClass, DamageType } from '../entities/types'
import { typeMultiplier } from '../content/damageTypes'
import type { SimulationState } from '../core/simulation'
import type { MovementAttack } from './ai'

/**
 * Damage resolution and death handling.
 *
 * The single place damage is applied — ai.ts decides who attacks whom, this
 * decides what it does. Implements combat-spec.md §6.
 */

/** Defence is diminishing, never immunising. 100 halves, 300 quarters. */
const DEFENCE_CONSTANT = 100

/** Seconds a Movement stays disabled. Movements are never permanently lost. */
const RECOVERY_TIME = 12

export function mitigate(raw: number, defence: number): number {
  return raw * (DEFENCE_CONSTANT / (DEFENCE_CONSTANT + Math.max(0, defence)))
}

export function computeDamage(
  attack: number,
  attackMultiplier: number,
  damageType: DamageType,
  armour: ArmourClass,
  defence: number,
): number {
  const raw = attack * attackMultiplier * typeMultiplier(damageType, armour)
  return mitigate(raw, defence)
}

/**
 * Apply damage to a Slack. Returns true if it died.
 *
 * Damage stays a float — combat-spec.md §6. Rounding here would compound badly
 * across thousands of small hits.
 */
export function damageSlack(slack: SlackInstance, amount: number): boolean {
  if (slack.shieldHitsRemaining > 0) {
    slack.shieldHitsRemaining--
    slack.hitFlash = 0.12
    return false
  }

  slack.hp -= amount
  slack.hitFlash = 0.12
  return slack.hp <= 0
}

/** Apply damage to a Movement. Disables rather than destroys. */
export function damageMovement(movement: MovementInstance, amount: number): void {
  const effectiveDefence = movement.def.defence * (1 + movement.bonuses.defence)

  let remaining = mitigate(amount, effectiveDefence)

  if (movement.shield > 0) {
    const absorbed = Math.min(movement.shield, remaining)
    movement.shield -= absorbed
    remaining -= absorbed
  }

  movement.hp -= remaining

  if (movement.hp <= 0) {
    movement.hp = 0
    movement.disabledFor = RECOVERY_TIME
    movement.targetId = null
  }
}

/** Damage the Mainspring. Shield absorbs first, then Tension. */
export function damageMainspring(sim: SimulationState, amount: number): void {
  let remaining = amount

  if (sim.mainspring.shield > 0) {
    const absorbed = Math.min(sim.mainspring.shield, remaining)
    sim.mainspring.shield -= absorbed
    remaining -= absorbed
  }

  sim.mainspring.hp = Math.max(0, sim.mainspring.hp - remaining)
  sim.mainspring.hitFlash = 0.2
}

export interface CombatResult {
  slackKilled: number
  filingsDropped: number
}

/**
 * Resolve the Movement attacks ai.ts collected, and remove the dead.
 */
export function resolveMovementAttacks(
  sim: SimulationState,
  attacks: MovementAttack[],
): CombatResult {
  const dead = new Set<number>()

  for (const { movement, target } of attacks) {
    if (dead.has(target.id)) continue

    const damage = computeDamage(
      movement.def.attack,
      movement.attackMultiplier * (1 + movement.bonuses.attack),
      movement.def.damageType,
      target.def.armour,
      target.def.defence,
    )

    if (damageSlack(target, damage)) dead.add(target.id)
  }

  return reapSlack(sim, dead)
}

/** Remove dead Slack and award their Filings. */
export function reapSlack(sim: SimulationState, dead: Set<number>): CombatResult {
  if (dead.size === 0) return { slackKilled: 0, filingsDropped: 0 }

  let filings = 0
  // Zone drop scaling — economy-spec.md §1.
  const zoneBonus = 1 + sim.zone.index * 0.35

  sim.slack = sim.slack.filter((slack) => {
    if (!dead.has(slack.id)) return true
    filings += slack.def.baseDrop * zoneBonus
    return false
  })

  sim.filingsEarned += filings
  return { slackKilled: dead.size, filingsDropped: filings }
}

/** Regeneration and decaying visual state. */
export function updateMainspring(sim: SimulationState, dt: number): void {
  if (sim.mainspring.regenPerSecond > 0 && sim.mainspring.hp > 0) {
    sim.mainspring.hp = Math.min(
      sim.mainspring.maxHp,
      sim.mainspring.hp + sim.mainspring.regenPerSecond * dt,
    )
  }
  if (sim.mainspring.hitFlash > 0) {
    sim.mainspring.hitFlash = Math.max(0, sim.mainspring.hitFlash - dt)
  }
}

/** Decay transient buffs granted by conjunctions. */
export function updateBuffs(sim: SimulationState, dt: number): void {
  for (const movement of sim.movements) {
    if (movement.hasteBonus > 0) {
      movement.hasteBonus = Math.max(0, movement.hasteBonus - dt * 0.25)
    }
    if (movement.attackMultiplier > 1) {
      movement.attackMultiplier = Math.max(1, movement.attackMultiplier - dt * 0.2)
    }
  }
}
