import type { ArrayInstance } from '../entities/Array'
import type { PlatformInstance } from '../entities/Platform'
import type { ContactInstance } from '../entities/Contact'
import type { RingIndex, TargetingPolicy, Vec2 } from '../entities/types'
import { INNERMOST_RING, OUTERMOST_RING, RIM_RADIUS, ringByIndex, slotAngle } from '../content/field'
import type { SimulationState } from '../core/simulation'
import { attackIntervalOf } from './buffs'

const RETARGET_INTERVAL = 0.75
const THREAT_DISTANCE_WEIGHT = 2

export function platformPosition(sim: SimulationState, platform: PlatformInstance): Vec2 {
  const ring = ringByIndex(platform.slot.ring)
  if (!ring) return { x: 0, y: 0 }

  const ringState = sim.rings[ring.index - 1]
  const angle = slotAngle(ring, platform.slot.slot, ringState?.phase ?? 0)

  return { x: Math.cos(angle) * ring.radius, y: Math.sin(angle) * ring.radius }
}

export function arrayPosition(array: ArrayInstance): Vec2 {
  const angle = (array.mount / 8) * Math.PI * 2
  return { x: Math.cos(angle) * RIM_RADIUS, y: Math.sin(angle) * RIM_RADIUS }
}

export function threatOf(contact: ContactInstance): number {
  const distance = Math.hypot(contact.position.x, contact.position.y)
  const normalized = Math.min(1, distance / RIM_RADIUS)
  const dps = contact.scaledAttack / Math.max(0.1, contact.def.patternInterval)
  return dps * contact.def.threatWeight * (1 + THREAT_DISTANCE_WEIGHT * (1 - normalized))
}

const RADIAL_MARGIN = 40

interface Reach {
  unitAngle: number
  origin: Vec2
  innerBound: number
  outerBound: number
  angularReach: number

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

export function angleDelta(a: number, b: number): number {
  let delta = b - a
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta <= -Math.PI) delta += Math.PI * 2
  return delta
}

function score(policy: TargetingPolicy, contact: ContactInstance, origin: Vec2): number {
  switch (policy) {
    case 'nearest': {
      const dx = contact.position.x - origin.x
      const dy = contact.position.y - origin.y

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

export function deepestContactPoint(sim: SimulationState): Vec2 | null {
  let best: ContactInstance | null = null
  let bestScore = -Infinity

  for (const contact of sim.contact) {
    if (contact.hp <= 0) continue
    const s = score('deepest', contact, ORIGIN)
    if (s > bestScore) {
      bestScore = s
      best = contact
    }
  }

  return best === null ? null : { x: best.position.x, y: best.position.y }
}

const ORIGIN: Vec2 = { x: 0, y: 0 }

export interface PlatformAttack {
  platform: PlatformInstance
  target: ContactInstance
}

export function updatePlatforms(sim: SimulationState, dt: number): PlatformAttack[] {
  const attacks: PlatformAttack[] = []

  for (const platform of sim.platforms) {
    if (platform.hitFlash > 0) platform.hitFlash = Math.max(0, platform.hitFlash - dt)

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

  aimPoint: Vec2
  target: ContactInstance
}

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

    array.charge = Math.min(array.maxCharge, array.charge + dt / array.chargeInterval)
    if (array.cooldownRemaining > 0) array.cooldownRemaining -= dt
    array.timeSinceRetarget += dt

    if (array.charge < 1 || array.cooldownRemaining > 0) continue
    if (sim.contact.length === 0) continue

    const origin = arrayPosition(array)

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
