import type { Projectile } from '../entities/Projectile'
import type { ContactInstance } from '../entities/Contact'
import { ringByIndex, slotAngle } from '../content/field'
import { BLOCK_BURST, IMPACT_BURST, TYPE_COLOURS } from '../content/effects'
import type { SimulationState } from '../core/simulation'
import type { Pool } from '../utils/pool'
import { angleDelta } from './ai'
import {
  computeDamage,
  damageSun,
  damagePlatform,
  damageContact,
  reapContact,
} from './combat'

const BLOCK_BAND = 10

export interface CollisionResult {
  sunHits: number
  platformHits: number

  contactHits: number
  contactKilled: number
  salvageDropped: number
}

export function updateProjectiles(
  sim: SimulationState,
  pool: Pool<Projectile>,
  dt: number,
): CollisionResult {
  const result: CollisionResult = {
    sunHits: 0,
    platformHits: 0,
    contactHits: 0,
    contactKilled: 0,
    salvageDropped: 0,
  }

  const dead = new Set<number>()
  const items = pool.items

  for (let i = 0; i < items.length; i++) {
    const p = items[i]
    if (!p.active) continue

    if (p.angularVelocity !== 0) {
      const cos = Math.cos(p.angularVelocity * dt)
      const sin = Math.sin(p.angularVelocity * dt)
      const vx = p.velocity.x
      p.velocity.x = vx * cos - p.velocity.y * sin
      p.velocity.y = vx * sin + p.velocity.y * cos
    }

    p.position.x += p.velocity.x * dt
    p.position.y += p.velocity.y * dt

    p.lifetime -= dt
    if (p.lifetime <= 0) {
      pool.releaseAt(i)
      continue
    }

    const distanceSq = p.position.x * p.position.x + p.position.y * p.position.y

    if (distanceSq > 700 * 700) {
      pool.releaseAt(i)
      continue
    }

    if (p.faction === 'contact') {
      if (resolveContactProjectile(sim, p, distanceSq, result)) pool.releaseAt(i)
    } else {
      if (resolveArrayProjectile(sim, p, dead, dt, result)) pool.releaseAt(i)
    }
  }

  if (dead.size > 0) {
    const reaped = reapContact(sim, dead)
    result.contactKilled += reaped.contactKilled
    result.salvageDropped += reaped.salvageDropped
  }

  return result
}

function resolveContactProjectile(
  sim: SimulationState,
  p: Projectile,
  distanceSq: number,
  result: CollisionResult,
): boolean {
  const hitRadius = sim.sun.hitboxRadius + p.radius
  if (distanceSq <= hitRadius * hitRadius) {
    damageSun(sim, p.damage)

    result.sunHits++
    return true
  }

  const projectileRadius = Math.sqrt(distanceSq)
  const projectileAngle = Math.atan2(p.position.y, p.position.x)

  for (const platform of sim.platforms) {
    if (platform.disabledFor > 0) continue

    const ring = ringByIndex(platform.slot.ring)
    if (!ring) continue

    if (Math.abs(projectileRadius - ring.radius) > BLOCK_BAND + p.radius) continue

    const ringState = sim.rings[ring.index - 1]
    const unitAngle = slotAngle(ring, platform.slot.slot, ringState?.phase ?? 0)

    const arc = platform.def.blockArc + sim.effects.blockArc
    if (Math.abs(angleDelta(unitAngle, projectileAngle)) <= arc) {
      damagePlatform(platform, p.damage, sim.telemetry, sim.effects)
      sim.feed.emit('block', p.position.x, p.position.y, p.damage)

      sim.particles.burst({
        x: p.position.x,
        y: p.position.y,
        angle: projectileAngle + Math.PI,
        count: BLOCK_BURST.count,
        spread: BLOCK_BURST.spread,
        speed: BLOCK_BURST.speed,
        life: BLOCK_BURST.life,
        size: BLOCK_BURST.size,
        drag: BLOCK_BURST.drag,
        colour: TYPE_COLOURS[platform.def.damageType],
      })
      result.platformHits++
      return true
    }
  }

  return false
}

const BURST_FALLOFF = 0.6

function hitContact(
  sim: SimulationState,
  p: Projectile,
  contact: ContactInstance,
  scale: number,
  dead: Set<number>,
): void {
  const before = contact.hp

  const damage = computeDamage(
    p.damage * scale,
    1,
    p.damageType,
    contact.def.armour,
    contact.def.defence,
  )
  const died = damageContact(contact, damage)
  sim.telemetry?.damage(p.sourceDefId, before - contact.hp, died)
  sim.feed.emit(
    died ? 'kill' : 'damage',
    contact.position.x,
    contact.position.y,
    before - contact.hp,
    died ? (contact.def.assetKey ?? '') : '',
  )

  sim.particles.burst({
    x: contact.position.x,
    y: contact.position.y,
    angle: 0,
    count: IMPACT_BURST.count,
    spread: IMPACT_BURST.spread,
    speed: IMPACT_BURST.speed,
    life: IMPACT_BURST.life,
    size: IMPACT_BURST.size,
    drag: IMPACT_BURST.drag,
    colour: TYPE_COLOURS[p.damageType],
  })
  if (died) dead.add(contact.id)
}

function sweptDistanceSq(p: Projectile, cx: number, cy: number, dt: number): number {
  const dx = p.velocity.x * dt
  const dy = p.velocity.y * dt
  const fromX = p.position.x - dx
  const fromY = p.position.y - dy

  const lengthSq = dx * dx + dy * dy
  let t = 0
  if (lengthSq > 0) {
    t = ((cx - fromX) * dx + (cy - fromY) * dy) / lengthSq
    t = t < 0 ? 0 : t > 1 ? 1 : t
  }

  const nearestX = fromX + dx * t
  const nearestY = fromY + dy * t
  const ox = cx - nearestX
  const oy = cy - nearestY
  return ox * ox + oy * oy
}

function alreadyHit(p: Projectile, id: number): boolean {
  for (let i = 0; i < p.hitCount; i++) if (p.hitIds[i] === id) return true
  return false
}

function remember(p: Projectile, id: number): void {
  if (p.hitCount < p.hitIds.length) p.hitIds[p.hitCount++] = id
}

function resolveArrayProjectile(
  sim: SimulationState,
  p: Projectile,
  dead: Set<number>,
  dt: number,
  result: CollisionResult,
): boolean {
  for (const contact of sim.contact) {
    if (dead.has(contact.id)) continue

    if (alreadyHit(p, contact.id)) continue

    const radius = p.radius + contact.def.hurtboxRadius

    if (
      sweptDistanceSq(p, contact.position.x, contact.position.y, dt) <=
      radius * radius
    ) {
      hitContact(sim, p, contact, 1, dead)
      result.contactHits++

      if (p.burstRadius > 0) {
        const splashSq = p.burstRadius * p.burstRadius
        for (const other of sim.contact) {
          if (other.id === contact.id || dead.has(other.id)) continue
          const ox = other.position.x - contact.position.x
          const oy = other.position.y - contact.position.y
          if (ox * ox + oy * oy <= splashSq) {
            hitContact(sim, p, other, BURST_FALLOFF, dead)
          }
        }
      }

      if (p.pierceRemaining > 0) {
        p.pierceRemaining--
        remember(p, contact.id)
        return false
      }

      return true
    }
  }
  return false
}
