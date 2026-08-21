import type { ChimeInstance } from '../entities/Chime'
import type { MovementInstance } from '../entities/Movement'
import type { SlackInstance } from '../entities/Slack'
import type { TargetingPolicy, Vec2 } from '../entities/types'
import { RIM_RADIUS, ringByIndex, slotAngle } from '../content/field'
import type { SimulationState } from '../core/simulation'

/**
 * Targeting and attack timing for Movements and Chimes.
 *
 * Implements combat-spec.md §2 and §4. Damage application lives in combat.ts —
 * this module decides *who* and *when*, never *how much*.
 */

const RETARGET_INTERVAL = 0.75
const THREAT_DISTANCE_WEIGHT = 2

/** Where a Movement currently is, derived from its ring's phase. */
export function movementPosition(sim: SimulationState, movement: MovementInstance): Vec2 {
  const ring = ringByIndex(movement.slot.ring)
  if (!ring) return { x: 0, y: 0 }

  const ringState = sim.rings[ring.index - 1]
  const angle = slotAngle(ring, movement.slot.slot, ringState?.phase ?? 0)

  return { x: Math.cos(angle) * ring.radius, y: Math.sin(angle) * ring.radius }
}

/** Where a Chime is. Rim mounts are static — this never changes during a stage. */
export function chimePosition(chime: ChimeInstance): Vec2 {
  const angle = (chime.mount / 8) * Math.PI * 2
  return { x: Math.cos(angle) * RIM_RADIUS, y: Math.sin(angle) * RIM_RADIUS }
}

/**
 * Threat score. A weak Slack about to reach the centre outranks a strong one
 * still at the rim — combat-spec.md §2.
 */
export function threatOf(slack: SlackInstance): number {
  const distance = Math.hypot(slack.position.x, slack.position.y)
  const normalized = Math.min(1, distance / RIM_RADIUS)
  const dps = slack.scaledAttack / Math.max(0.1, slack.def.patternInterval)
  return dps * slack.def.threatWeight * (1 + THREAT_DISTANCE_WEIGHT * (1 - normalized))
}

/**
 * Is this Slack inside a Movement's annular arc?
 *
 * Range is an arc, not a circle: `angularReach` along the unit's own ring plus
 * `radialReach` rings outward. This is what makes ring assignment matter — the
 * same angular reach covers more arc length on a bigger ring.
 */
function withinReach(
  sim: SimulationState,
  movement: MovementInstance,
  slack: SlackInstance,
): boolean {
  const ring = ringByIndex(movement.slot.ring)
  if (!ring) return false

  const slackRadius = Math.hypot(slack.position.x, slack.position.y)

  // Radial band: from the Mainspring out to radialReach rings beyond this one.
  const outerRing = ringByIndex(Math.min(3, movement.slot.ring + movement.def.radialReach) as 1 | 2 | 3)
  const outerBound = (outerRing?.radius ?? ring.radius) + 40
  if (slackRadius > outerBound) return false

  const position = movementPosition(sim, movement)
  const unitAngle = Math.atan2(position.y, position.x)
  const slackAngle = Math.atan2(slack.position.y, slack.position.x)

  const reach = movement.def.angularReach * (1 + movement.bonuses.range)
  return Math.abs(angleDelta(unitAngle, slackAngle)) <= reach
}

/** Shortest signed angle from a to b, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let delta = b - a
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta <= -Math.PI) delta += Math.PI * 2
  return delta
}

function selectTarget(
  policy: TargetingPolicy,
  candidates: SlackInstance[],
): SlackInstance | null {
  if (policy === 'none' || candidates.length === 0) return null

  let best: SlackInstance | null = null
  let bestScore = -Infinity

  for (const slack of candidates) {
    let score: number
    switch (policy) {
      case 'lowestHp':
        score = -slack.hp
        break
      case 'highestThreat':
        score = threatOf(slack)
        break
      case 'deepest':
        score = -Math.hypot(slack.position.x, slack.position.y)
        break
      case 'nearest':
      default:
        score = 0
        break
    }
    if (score > bestScore) {
      bestScore = score
      best = slack
    }
  }

  return best
}

function nearestTo(origin: Vec2, candidates: SlackInstance[]): SlackInstance | null {
  let best: SlackInstance | null = null
  let bestDistance = Infinity
  for (const slack of candidates) {
    const d = (slack.position.x - origin.x) ** 2 + (slack.position.y - origin.y) ** 2
    if (d < bestDistance) {
      bestDistance = d
      best = slack
    }
  }
  return best
}

export interface MovementAttack {
  movement: MovementInstance
  target: SlackInstance
}

/**
 * Advance Movement cooldowns and collect the attacks that fire this tick.
 *
 * Returns rather than applies, so combat.ts owns all damage in one place and
 * the ordering in combat-spec.md §8 stays observable.
 */
export function updateMovements(sim: SimulationState, dt: number): MovementAttack[] {
  const attacks: MovementAttack[] = []
  const living = sim.slack

  for (const movement of sim.movements) {
    if (movement.disabledFor > 0) {
      movement.disabledFor -= dt
      if (movement.disabledFor <= 0) {
        movement.disabledFor = 0
        movement.hp = movement.maxHp
      }
      continue
    }

    if (movement.cooldownRemaining > 0) movement.cooldownRemaining -= dt
    movement.timeSinceRetarget += dt

    const inReach = living.filter((s) => withinReach(sim, movement, s))

    let target = inReach.find((s) => s.id === movement.targetId) ?? null

    // Re-target when the current one is gone or the interval has elapsed —
    // never mid-swing, which cooldownRemaining > 0 already guarantees.
    if (!target || movement.timeSinceRetarget >= RETARGET_INTERVAL) {
      target =
        movement.def.targeting === 'nearest'
          ? nearestTo(movementPosition(sim, movement), inReach)
          : selectTarget(movement.def.targeting, inReach)

      movement.targetId = target?.id ?? null
      movement.timeSinceRetarget = 0
    }

    if (!target || movement.cooldownRemaining > 0) continue

    attacks.push({ movement, target })
    movement.cooldownRemaining =
      movement.def.baseInterval / (1 + movement.hasteBonus)
  }

  return attacks
}

export interface ChimeShot {
  chime: ChimeInstance
  /** Lead-corrected aim point, not the target's current position. */
  aimPoint: Vec2
  target: SlackInstance
}

/**
 * Advance Chime charge and collect shots.
 *
 * Chimes lead their targets — combat-spec.md §4. Movements do not, because at
 * melee range it would not read.
 */
export function updateChimes(sim: SimulationState, dt: number): ChimeShot[] {
  const shots: ChimeShot[] = []

  for (const chime of sim.chimes) {
    if (chime.disabledFor > 0) {
      chime.disabledFor -= dt
      if (chime.disabledFor <= 0) {
        chime.disabledFor = 0
        chime.hp = chime.maxHp
      }
      continue
    }

    // Charge regenerates continuously; firing costs one whole unit.
    chime.charge = Math.min(chime.def.maxCharge, chime.charge + dt / chime.def.chargeInterval)
    if (chime.cooldownRemaining > 0) chime.cooldownRemaining -= dt
    chime.timeSinceRetarget += dt

    if (chime.charge < 1 || chime.cooldownRemaining > 0) continue
    if (sim.slack.length === 0) continue

    // Chimes reach the whole field, so every Slack is a candidate.
    let target = sim.slack.find((s) => s.id === chime.targetId) ?? null
    if (!target || chime.timeSinceRetarget >= RETARGET_INTERVAL) {
      target = selectTarget(chime.def.targeting, sim.slack)
      chime.targetId = target?.id ?? null
      chime.timeSinceRetarget = 0
    }
    if (!target) continue

    const origin = chimePosition(chime)
    const distance = Math.hypot(target.position.x - origin.x, target.position.y - origin.y)
    const flightTime = distance / chime.def.projectileSpeed

    shots.push({
      chime,
      target,
      aimPoint: {
        x: target.position.x + target.velocity.x * flightTime,
        y: target.position.y + target.velocity.y * flightTime,
      },
    })

    chime.charge -= 1
    chime.cooldownRemaining = chime.def.baseInterval / (1 + chime.hasteBonus)
  }

  return shots
}
