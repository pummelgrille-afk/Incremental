import type { Projectile } from '../entities/Projectile'
import { ringByIndex, slotAngle } from '../content/field'
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

/**
 * Projectile integration and collision.
 *
 * Hitboxes are decoupled from sprite bounds for fairness (combat-spec.md §5):
 * the Sun's collision radius is deliberately smaller than what is drawn,
 * so near misses read as misses.
 *
 * PLACEHOLDER SCOPE — Phase 17 adds spatial partitioning. At the Phase 10 slice's
 * entity counts a linear scan is measurably fine, and a grid built before the
 * access patterns are known would be guesswork.
 */

/**
 * How far either side of its ring a Platform can intercept, in pixels.
 *
 * A projectile well inside or outside the ring is not passing through the unit,
 * so this bounds the block check radially. Decoupled from any sprite size:
 * changing what a Platform looks like must not change what it blocks.
 */
const BLOCK_BAND = 10

export interface CollisionResult {
  sunHits: number
  platformHits: number
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
    contactKilled: 0,
    salvageDropped: 0,
  }

  const dead = new Set<number>()
  const items = pool.items

  for (let i = 0; i < items.length; i++) {
    const p = items[i]
    if (!p.active) continue

    // Curving projectiles rotate their velocity vector — this is what makes
    // spiral patterns cheap (one rotation, no path recomputation).
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

    // Strays cannot leak out of the world.
    if (distanceSq > 700 * 700) {
      pool.releaseAt(i)
      continue
    }

    if (p.faction === 'contact') {
      if (resolveContactProjectile(sim, p, distanceSq, result)) pool.releaseAt(i)
    } else {
      if (resolveArrayProjectile(sim, p, dead)) pool.releaseAt(i)
    }
  }

  if (dead.size > 0) {
    const reaped = reapContact(sim, dead)
    result.contactKilled += reaped.contactKilled
    result.salvageDropped += reaped.salvageDropped
  }

  return result
}

/** Returns true if the projectile should despawn. */
function resolveContactProjectile(
  sim: SimulationState,
  p: Projectile,
  distanceSq: number,
  result: CollisionResult,
): boolean {
  // The Sun, first — it is the thing being defended.
  const hitRadius = sim.sun.hitboxRadius + p.radius
  if (distanceSq <= hitRadius * hitRadius) {
    damageSun(sim, p.damage)
    // No popup: the white flash and the HUD Output bar already say this, and
    // a third channel at the busiest point on the field only adds noise.
    result.sunHits++
    return true
  }

  // Block arc: a projectile crossing a Platform's slot within blockArc is
  // absorbed, damaging that Platform instead. This is how the front line
  // defends without a separate mechanic — combat-spec.md §5.
  const projectileRadius = Math.sqrt(distanceSq)
  const projectileAngle = Math.atan2(p.position.y, p.position.x)

  for (const platform of sim.platforms) {
    if (platform.disabledFor > 0) continue

    const ring = ringByIndex(platform.slot.ring)
    if (!ring) continue

    // Only intercept near the ring's radius — a projectile well inside or
    // outside is not passing through this unit.
    if (Math.abs(projectileRadius - ring.radius) > BLOCK_BAND + p.radius) continue

    const ringState = sim.rings[ring.index - 1]
    const unitAngle = slotAngle(ring, platform.slot.slot, ringState?.phase ?? 0)

    // The Bracing branch widens every block arc additively — a flat angle,
    // so it is worth proportionally more to a narrow Pallet than a wide Detent.
    const arc = platform.def.blockArc + sim.effects.blockArc
    if (Math.abs(angleDelta(unitAngle, projectileAngle)) <= arc) {
      damagePlatform(platform, p.damage, sim.telemetry, sim.effects)
      sim.feed.emit('block', p.position.x, p.position.y, p.damage)
      result.platformHits++
      return true
    }
  }

  return false
}

/** Returns true if the projectile should despawn. */
function resolveArrayProjectile(
  sim: SimulationState,
  p: Projectile,
  dead: Set<number>,
): boolean {
  for (const contact of sim.contact) {
    if (dead.has(contact.id)) continue

    const dx = contact.position.x - p.position.x
    const dy = contact.position.y - p.position.y
    // Authored per Contact, and generous relative to the sprite — the same
    // fairness principle as the Sun's deliberately small hitbox.
    const radius = p.radius + contact.def.hurtboxRadius

    if (dx * dx + dy * dy <= radius * radius) {
      const before = contact.hp
      // Friendly projectiles go through the same formula as every other damage
      // source. Applying raw damage here would make "Arrays are always
      // Resonant" (combat-spec.md section 4) meaningless — the whole reason
      // they counter Erratic and struggle against Seized is the type
      // multiplier — and would let them ignore armour entirely.
      const damage = computeDamage(
        p.damage,
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
      )
      if (died) dead.add(contact.id)
      return true
    }
  }
  return false
}
