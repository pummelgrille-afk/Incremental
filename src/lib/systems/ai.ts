import type { ArrayInstance } from '../entities/Array'
import type { PlatformInstance } from '../entities/Platform'
import type { ContactInstance } from '../entities/Contact'
import type { RingIndex, TargetingPolicy, Vec2 } from '../entities/types'
import { INNERMOST_RING, OUTERMOST_RING, RIM_RADIUS, ringByIndex, slotAngle } from '../content/field'
import type { SimulationState } from '../core/simulation'
import { attackIntervalOf } from './buffs'

/**
 * Targeting and attack timing for Platforms and Arrays.
 *
 * Implements combat-spec.md §2 and §4. Damage application lives in combat.ts —
 * this module decides *who* and *when*, never *how much*.
 *
 * **Why Arrays are not in a separate `supportAi.ts`** (PLAN.md Phase 14 offers
 * the split): they share the scoring function, the retarget interval, and the
 * overall update shape. What differs is roughly fifty lines — Charge, target
 * leading, and unrestricted reach. Splitting now would separate two functions
 * that are read against each other and duplicate the shared scorer's import for
 * no gain.
 *
 * Revisit when Arrays need targeting policies Platforms do not have, or an
 * update shape that is genuinely different (Phase 25 could bring either, if
 * ammo types or multi-target fire arrive).
 */

const RETARGET_INTERVAL = 0.75
const THREAT_DISTANCE_WEIGHT = 2

/** Where a Platform currently is, derived from its ring's phase. */
export function platformPosition(sim: SimulationState, platform: PlatformInstance): Vec2 {
  const ring = ringByIndex(platform.slot.ring)
  if (!ring) return { x: 0, y: 0 }

  const ringState = sim.rings[ring.index - 1]
  const angle = slotAngle(ring, platform.slot.slot, ringState?.phase ?? 0)

  return { x: Math.cos(angle) * ring.radius, y: Math.sin(angle) * ring.radius }
}

/** Where a Array is. Rim mounts are static — this never changes during a stage. */
export function arrayPosition(array: ArrayInstance): Vec2 {
  const angle = (array.mount / 8) * Math.PI * 2
  return { x: Math.cos(angle) * RIM_RADIUS, y: Math.sin(angle) * RIM_RADIUS }
}

/**
 * Threat score. A weak Contact about to reach the centre outranks a strong one
 * still at the rim — combat-spec.md §2.
 */
export function threatOf(contact: ContactInstance): number {
  const distance = Math.hypot(contact.position.x, contact.position.y)
  const normalized = Math.min(1, distance / RIM_RADIUS)
  const dps = contact.scaledAttack / Math.max(0.1, contact.def.patternInterval)
  return dps * contact.def.threatWeight * (1 + THREAT_DISTANCE_WEIGHT * (1 - normalized))
}

/** Radial contact either side of a unit's band, in pixels. */
const RADIAL_MARGIN = 40

/**
 * The annular band a Platform can strike, precomputed once per unit per tick.
 *
 * Hoisted out of the per-Contact check because it involves trigonometry and ring
 * lookups that do not vary across candidates. Previously this ran once per
 * (Platform x Contact) pair — 6000 times a tick at full budget.
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

function reachOf(sim: SimulationState, platform: PlatformInstance): Reach | null {
  const ring = ringByIndex(platform.slot.ring)
  if (!ring) return null

  const origin = platformPosition(sim, platform)

  const outerIndex = Math.min(
    OUTERMOST_RING,
    platform.slot.ring + platform.def.radialReach,
  ) as RingIndex
  const outerRing = ringByIndex(outerIndex) ?? ring

  /*
   * The innermost ring is the last line, so it defends everything inside it —
   * otherwise a Contact that reaches the Sun would be unreachable by
   * anything at all.
   *
   * Every other ring is bounded inward. combat-spec.md §2 says reach extends
   * `radialReach` rings *outward*; without an inner bound an outer unit could
   * strike a Contact that had already penetrated to the centre, which would make
   * ring assignment nearly meaningless and undercut pillar P2.
   */
  const isInnermost = ring.index === INNERMOST_RING

  return {
    unitAngle: Math.atan2(origin.y, origin.x),
    origin,
    innerBound: isInnermost ? 0 : ring.radius - RADIAL_MARGIN,
    outerBound: outerRing.radius + RADIAL_MARGIN,
    angularReach: platform.def.angularReach * (1 + platform.bonuses.range),
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
 * exemption drops the inner bound to zero so ring 1 can defend the Sun,
 * with a comment saying a Contact at the centre "would be unreachable by anything
 * at all" otherwise. But the angular test stayed fixed, and a bearing at radius
 * zero is arbitrary — so a Detent's 22° window covered 6% of the circle and an
 * enemy parked on the objective was hittable roughly one second in eight.
 *
 * Measured on stage 3, where a shielded Shell reaches the centre in half of all
 * runs: it survived up to 28 s, sat on the Sun for up to 18 s, and drove
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

function inReach(reach: Reach, contact: ContactInstance): boolean {
  const radius = Math.hypot(contact.position.x, contact.position.y)
  if (radius < reach.innerBound || radius > reach.outerBound) return false

  const contactAngle = Math.atan2(contact.position.y, contact.position.x)
  return Math.abs(angleDelta(reach.unitAngle, contactAngle)) <= subtendedReach(reach, radius)
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
function score(policy: TargetingPolicy, contact: ContactInstance, origin: Vec2): number {
  switch (policy) {
    case 'nearest': {
      const dx = contact.position.x - origin.x
      const dy = contact.position.y - origin.y
      // Negated squared distance: no square root needed to rank.
      return -(dx * dx + dy * dy)
    }
    case 'lowestHp':
      return -contact.hp
    case 'highestThreat':
      return threatOf(contact)
    case 'deepest':
      return -Math.hypot(contact.position.x, contact.position.y)
    case 'none':
    default:
      return -Infinity
  }
}

export interface PlatformAttack {
  platform: PlatformInstance
  target: ContactInstance
}

/**
 * Advance Platform cooldowns and collect the attacks that fire this tick.
 *
 * Returns rather than applies, so combat.ts owns all damage in one place and
 * the ordering in combat-spec.md §8 stays observable.
 */
export function updatePlatforms(sim: SimulationState, dt: number): PlatformAttack[] {
  const attacks: PlatformAttack[] = []

  for (const platform of sim.platforms) {
    if (platform.disabledFor > 0) {
      platform.disabledFor -= dt
      if (platform.disabledFor <= 0) {
        platform.disabledFor = 0
        platform.hp = platform.maxHp
      }
      continue
    }

    if (platform.cooldownRemaining > 0) platform.cooldownRemaining -= dt
    platform.timeSinceRetarget += dt

    if (platform.def.targeting === 'none') continue

    const reach = reachOf(sim, platform)
    if (!reach) continue

    // One pass over the candidates: find the best under this unit's policy and
    // notice whether the existing target is still valid, without allocating.
    let best: ContactInstance | null = null
    let bestScore = -Infinity
    let current: ContactInstance | null = null

    for (const contact of sim.contact) {
      if (!inReach(reach, contact)) continue
      if (contact.id === platform.targetId) current = contact

      const value = score(platform.def.targeting, contact, reach.origin)
      if (value > bestScore) {
        bestScore = value
        best = contact
      }
    }

    // Re-target only when the current target is gone or out of range, or the
    // interval has elapsed — combat-spec.md §2.
    let target = current
    if (!target || platform.timeSinceRetarget >= RETARGET_INTERVAL) {
      target = best
      platform.targetId = target?.id ?? null
      platform.timeSinceRetarget = 0
    }

    if (!target || platform.cooldownRemaining > 0) continue

    attacks.push({ platform, target })
    platform.cooldownRemaining = attackIntervalOf(platform, sim.effects)
  }

  return attacks
}

export interface ArrayShot {
  array: ArrayInstance
  /** Lead-corrected aim point, not the target's current position. */
  aimPoint: Vec2
  target: ContactInstance
}

/**
 * Advance Array charge and collect shots.
 *
 * Arrays lead their targets — combat-spec.md §4. Platforms do not, because at
 * melee range it would not read.
 */
export function updateArrays(sim: SimulationState, dt: number): ArrayShot[] {
  const shots: ArrayShot[] = []

  for (const array of sim.arrays) {
    if (array.disabledFor > 0) {
      array.disabledFor -= dt
      if (array.disabledFor <= 0) {
        array.disabledFor = 0
        array.hp = array.maxHp
      }
      continue
    }

    // Charge regenerates continuously; firing costs one whole unit.
    array.charge = Math.min(array.maxCharge, array.charge + dt / array.chargeInterval)
    if (array.cooldownRemaining > 0) array.cooldownRemaining -= dt
    array.timeSinceRetarget += dt

    if (array.charge < 1 || array.cooldownRemaining > 0) continue
    if (sim.contact.length === 0) continue

    const origin = arrayPosition(array)

    // Arrays reach the whole field, so every Contact is a candidate. Single pass,
    // same as Platforms — no intermediate array.
    let best: ContactInstance | null = null
    let bestScore = -Infinity
    let current: ContactInstance | null = null

    for (const contact of sim.contact) {
      if (contact.id === array.targetId) current = contact
      const value = score(array.def.targeting, contact, origin)
      if (value > bestScore) {
        bestScore = value
        best = contact
      }
    }

    let target = current
    if (!target || array.timeSinceRetarget >= RETARGET_INTERVAL) {
      target = best
      array.targetId = target?.id ?? null
      array.timeSinceRetarget = 0
    }
    if (!target) continue
    const distance = Math.hypot(target.position.x - origin.x, target.position.y - origin.y)
    const flightTime = distance / array.def.projectileSpeed

    shots.push({
      array,
      target,
      aimPoint: {
        x: target.position.x + target.velocity.x * flightTime,
        y: target.position.y + target.velocity.y * flightTime,
      },
    })

    array.charge -= 1
    array.cooldownRemaining = array.def.baseInterval
  }

  return shots
}
