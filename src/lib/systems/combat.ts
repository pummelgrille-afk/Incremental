import type { MovementInstance } from '../entities/Movement'
import type { SlackInstance } from '../entities/Slack'
import { slackById } from '../content/enemies'
import { createSlack } from './spawn'
import type { ArmourClass, DamageType } from '../entities/types'
import { typeMultiplier } from '../content/damageTypes'
import type { SimulationState } from '../core/simulation'
import { absorb, attackScaleOf, clearBuffs } from './buffs'
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

/** How far children appear from a splitter, and across how wide an arc. */
const SPLIT_OFFSET = 14
const SPLIT_ARC = Math.PI / 2

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

  // A telegraphing Slack may be more vulnerable. This rewards a player for
  // *acting* on a read telegraph rather than only for dodging it.
  const vulnerability = slack.def.traits?.vulnerableWhileTelegraphing
  const scaled =
    vulnerability && slack.telegraphRemaining > 0 ? amount * vulnerability : amount

  slack.hp -= scaled
  slack.hitFlash = 0.12
  return slack.hp <= 0
}

/** Apply damage to a Movement. Disables rather than destroys. */
export function damageMovement(movement: MovementInstance, amount: number): void {
  const effectiveDefence = movement.def.defence * (1 + movement.bonuses.defence)

  let remaining = mitigate(amount, effectiveDefence)

  remaining -= absorb(movement.buffs.shield, remaining)

  movement.hp -= remaining

  if (movement.hp <= 0) {
    movement.hp = 0
    movement.disabledFor = RECOVERY_TIME
    movement.targetId = null
    // A disabled unit comes back at full HP after RECOVERY_TIME; letting a
    // shield or haste window survive that would make being disabled partly
    // free.
    clearBuffs(movement.buffs)
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

  // The only path by which Tension falls, so the low-water mark belongs here.
  const fraction = sim.mainspring.maxHp > 0 ? sim.mainspring.hp / sim.mainspring.maxHp : 0
  if (fraction < sim.mainspring.lowestFraction) sim.mainspring.lowestFraction = fraction
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
      attackScaleOf(movement),
      movement.def.damageType,
      target.def.armour,
      target.def.defence,
    )

    const before = target.hp
    const died = damageSlack(target, damage)
    sim.feed.emit(
      died ? 'kill' : 'damage',
      target.position.x,
      target.position.y,
      before - target.hp,
    )
    if (died) dead.add(target.id)
  }

  return reapSlack(sim, dead)
}

/**
 * Remove dead Slack, award their Filings, and spawn anything they split into.
 *
 * Splitting happens here because this is where death is handled, and because a
 * splitter's children must exist before the next system reads `sim.slack` —
 * spawning them a step later would let a wave read as cleared for one tick.
 */
export function reapSlack(sim: SimulationState, dead: Set<number>): CombatResult {
  if (dead.size === 0) return { slackKilled: 0, filingsDropped: 0 }

  let filings = 0
  // Zone drop scaling — economy-spec.md §1.
  const zoneBonus = 1 + sim.zone.index * 0.35

  const offspring: SlackInstance[] = []

  sim.slack = sim.slack.filter((slack) => {
    if (!dead.has(slack.id)) return true

    filings += slack.def.baseDrop * zoneBonus

    const split = slack.def.traits?.splitsInto
    if (split) {
      const childDef = slackById(split.defId)
      if (childDef) {
        // Fan the children out around the parent so they do not stack into a
        // single unhittable point, and inherit its heading.
        const heading = Math.atan2(slack.velocity.y, slack.velocity.x)
        for (let i = 0; i < split.count; i++) {
          const spread = ((i / Math.max(1, split.count - 1)) - 0.5) * SPLIT_ARC
          const angle = heading + (split.count > 1 ? spread : 0)
          offspring.push(
            createSlack(sim, childDef, {
              x: slack.position.x + Math.cos(angle) * SPLIT_OFFSET,
              y: slack.position.y + Math.sin(angle) * SPLIT_OFFSET,
            }),
          )
        }
      }
    }

    return false
  })

  if (offspring.length > 0) sim.slack.push(...offspring)

  sim.filingsEarned += filings
  return { slackKilled: dead.size, filingsDropped: filings }
}
