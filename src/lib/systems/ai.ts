import type { ChimeInstance } from '../entities/Chime'
import type { MovementInstance } from '../entities/Movement'
import type { SlackInstance } from '../entities/Slack'
import type { RingIndex, TargetingPolicy, Vec2 } from '../entities/types'
import { RIM_RADIUS, RINGS, ringByIndex, slotAngle } from '../content/field'
import type { SimulationState } from '../core/simulation'
import { attackIntervalOf } from './buffs'

/**
 * Targeting and attack timing for Movements and Chimes.
 *
 * Implements combat-spec.md §2 and §4. Damage application lives in combat.ts —
 * this module decides *who* and *when*, never *how much*.
 *
 * **Why Chimes are not in a separate `supportAi.ts`** (PLAN.md Phase 14 offers
 * the split): they share the scoring function, the retarget interval, and the
 * overall update shape. What differs is roughly fifty lines — Charge, target
 * leading, and unrestricted reach. Splitting now would separate two functions
 * that are read against each other and duplicate the shared scorer's import for
 * no gain.
 *
 * Revisit when Chimes need targeting policies Movements do not have, or an
 * update shape that is genuinely different (Phase 25 could bring either, if
 * ammo types or multi-target fire arrive).
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

/** Radial slack either side of a unit's band, in pixels. */
const RADIAL_MARGIN = 40

/**
 * The annular band a Movement can strike, precomputed once per unit per tick.
 *
 * Hoisted out of the per-Slack check because it involves trigonometry and ring
 * lookups that do not vary across candidates. Previously this ran once per
 * (Movement x Slack) pair — 6000 times a tick at full budget.
 */
interface Reach {
  unitAngle: number
  origin: Vec2
  innerBound: number
  outerBound: number
  angularReach: number
  /** The unit's own ring radius — the radius `angularReach` was authored at. */
  ringRadius: number
}

function reachOf(sim: SimulationState, movement: MovementInstance): Reach | null {
  const ring = ringByIndex(movement.slot.ring)
  if (!ring) return null

  const origin = movementPosition(sim, movement)

  const outerIndex = Math.min(
    RINGS[RINGS.length - 1].index,
    movement.slot.ring + movement.def.radialReach,
  ) as RingIndex
  const outerRing = ringByIndex(outerIndex) ?? ring

  /*
   * The innermost ring is the last line, so it defends everything inside it —
   * otherwise a Slack that reaches the Mainspring would be unreachable by
   * anything at all.
   *
   * Every other ring is bounded inward. combat-spec.md §2 says reach extends
   * `radialReach` rings *outward*; without an inner bound an outer unit could
   * strike a Slack that had already penetrated to the centre, which would make
   * ring assignment nearly meaningless and undercut pillar P2.
   */
  const isInnermost = ring.index === RINGS[0].index

  return {
    unitAngle: Math.atan2(origin.y, origin.x),
    origin,
    innerBound: isInnermost ? 0 : ring.radius - RADIAL_MARGIN,
    outerBound: outerRing.radius + RADIAL_MARGIN,
    angularReach: movement.def.angularReach * (1 + movement.bonuses.range),
    ringRadius: ring.radius,
  }
}

/**
 * The angle a unit's reach actually subtends at a given radius.
 *
 * `angularReach` is authored as the angle at the unit's **own** ring, and
 * combat-spec.md §2 already frames reach as an arc *length* — "the same angular
 * reach covers more arc length on an outer ring". The same statement read
 * inward says the same length subtends a *wider angle* as the target closes on
 * the centre, which is what this computes.
 *
 * **This is what made the innermost ring's exemption a half-measure.** That
 * exemption drops the inner bound to zero so ring 1 can defend the Mainspring,
 * with a comment saying a Slack at the centre "would be unreachable by anything
 * at all" otherwise. But the angular test stayed fixed, and a bearing at radius
 * zero is arbitrary — so a Detent's 22° window covered 6% of the circle and an
 * enemy parked on the objective was hittable roughly one second in eight.
 *
 * Measured on stage 3, where a shielded Cant reaches the centre in half of all
 * runs: it survived up to 28 s, sat on the Mainspring for up to 18 s, and drove
 * wave 1's duration, which alone explained the stage's outcome variance at
 * r = -0.88. See docs/phases/phase-19.md.
 *
 * Deliberately clamped so reach only ever **widens inward, never narrows
 * outward**. The authored values were tuned as the reach at and beyond a unit's
 * own ring; letting them shrink at range would be an unrequested rebalance of
 * every unit, rather than a fix to the degenerate case at the centre.
 */
function subtendedReach(reach: Reach, radius: number): number {
  if (radius <= 0) return Math.PI
  return Math.min(Math.PI, reach.angularReach * Math.max(1, reach.ringRadius / radius))
}

function inReach(reach: Reach, slack: SlackInstance): boolean {
  const radius = Math.hypot(slack.position.x, slack.position.y)
  if (radius < reach.innerBound || radius > reach.outerBound) return false

  const slackAngle = Math.atan2(slack.position.y, slack.position.x)
  return Math.abs(angleDelta(reach.unitAngle, slackAngle)) <= subtendedReach(reach, radius)
}

/** Shortest signed angle from a to b, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let delta = b - a
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta <= -Math.PI) delta += Math.PI * 2
  return delta
}

/**
 * Score a candidate under a targeting policy. Higher wins.
 *
 * Every policy including `nearest` scores through here, so selection is one
 * code path rather than a special case bolted alongside it.
 */
function score(policy: TargetingPolicy, slack: SlackInstance, origin: Vec2): number {
  switch (policy) {
    case 'nearest': {
      const dx = slack.position.x - origin.x
      const dy = slack.position.y - origin.y
      // Negated squared distance: no square root needed to rank.
      return -(dx * dx + dy * dy)
    }
    case 'lowestHp':
      return -slack.hp
    case 'highestThreat':
      return threatOf(slack)
    case 'deepest':
      return -Math.hypot(slack.position.x, slack.position.y)
    case 'none':
    default:
      return -Infinity
  }
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

    if (movement.def.targeting === 'none') continue

    const reach = reachOf(sim, movement)
    if (!reach) continue

    // One pass over the candidates: find the best under this unit's policy and
    // notice whether the existing target is still valid, without allocating.
    let best: SlackInstance | null = null
    let bestScore = -Infinity
    let current: SlackInstance | null = null

    for (const slack of sim.slack) {
      if (!inReach(reach, slack)) continue
      if (slack.id === movement.targetId) current = slack

      const value = score(movement.def.targeting, slack, reach.origin)
      if (value > bestScore) {
        bestScore = value
        best = slack
      }
    }

    // Re-target only when the current target is gone or out of range, or the
    // interval has elapsed — combat-spec.md §2.
    let target = current
    if (!target || movement.timeSinceRetarget >= RETARGET_INTERVAL) {
      target = best
      movement.targetId = target?.id ?? null
      movement.timeSinceRetarget = 0
    }

    if (!target || movement.cooldownRemaining > 0) continue

    attacks.push({ movement, target })
    movement.cooldownRemaining = attackIntervalOf(movement, sim.effects)
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
    chime.charge = Math.min(chime.maxCharge, chime.charge + dt / chime.chargeInterval)
    if (chime.cooldownRemaining > 0) chime.cooldownRemaining -= dt
    chime.timeSinceRetarget += dt

    if (chime.charge < 1 || chime.cooldownRemaining > 0) continue
    if (sim.slack.length === 0) continue

    const origin = chimePosition(chime)

    // Chimes reach the whole field, so every Slack is a candidate. Single pass,
    // same as Movements — no intermediate array.
    let best: SlackInstance | null = null
    let bestScore = -Infinity
    let current: SlackInstance | null = null

    for (const slack of sim.slack) {
      if (slack.id === chime.targetId) current = slack
      const value = score(chime.def.targeting, slack, origin)
      if (value > bestScore) {
        bestScore = value
        best = slack
      }
    }

    let target = current
    if (!target || chime.timeSinceRetarget >= RETARGET_INTERVAL) {
      target = best
      chime.targetId = target?.id ?? null
      chime.timeSinceRetarget = 0
    }
    if (!target) continue
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
    chime.cooldownRemaining = chime.def.baseInterval
  }

  return shots
}
