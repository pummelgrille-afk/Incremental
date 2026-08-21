import type { Projectile } from '../entities/Projectile'
import type { ContactInstance } from '../entities/Contact'
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
      if (resolveArrayProjectile(sim, p, dead, dt)) pool.releaseAt(i)
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

/**
 * Fraction of a burst shot's damage carried to everything other than the
 * Contact actually struck.
 *
 * Not 1: a burst that splashed at full strength would be strictly better than
 * a single shot of the same damage in every situation, and the roster's whole
 * case for shot shapes is that each one is better *somewhere*.
 *
 * Measured at 0.6, in damage per second of charge against the Long Baseline
 * anchor's flat 2.67: Corona reads 1.67 against a single Contact, 2.67 against
 * two — an exact tie — and 3.67 against three. So it loses alone, breaks even
 * at a pair, and only pays from three upward.
 */
const BURST_FALLOFF = 0.6

/** Apply an Array's damage to one Contact, with the shared bookkeeping. */
function hitContact(
  sim: SimulationState,
  p: Projectile,
  contact: ContactInstance,
  scale: number,
  dead: Set<number>,
): void {
  const before = contact.hp
  // Friendly projectiles go through the same formula as every other damage
  // source. Applying raw damage here would make "Arrays are always Resonant"
  // (combat-spec.md section 4) meaningless — the whole reason they counter
  // Erratic and struggle against Seized is the type multiplier — and would let
  // them ignore armour entirely.
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
  )
  if (died) dead.add(contact.id)
}

/**
 * Squared distance from a circle's centre to the segment a projectile swept
 * through this tick.
 *
 * **Point tests tunnel.** The simulation runs at 20 Hz, so a shot at 260 px/s
 * jumps 13 px per tick while the smallest hit window — a 10 px hurtbox plus the
 * 4 px projectile — is 14 px across. Add the Contact's own inbound speed and
 * the closing distance passes the window, at which case the projectile is
 * simply on one side of the target before the tick and the other side after,
 * and never registers.
 *
 * That was already reachable before this phase; Phase 30's faster Arrays would
 * have made it routine. Testing the swept segment instead of the end point
 * costs a handful of arithmetic per projectile and removes the failure mode
 * rather than tuning around it.
 *
 * The Contact is treated as stationary at its post-move position. That is an
 * approximation — both moved — but it is strictly closer than the point test
 * it replaces, and a full relative-motion sweep would be solving for an
 * accuracy nothing here can perceive.
 */
function sweptDistanceSq(p: Projectile, cx: number, cy: number, dt: number): number {
  // Where the projectile was before this tick's integration.
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
  // Silently drops past capacity. `targets` is authored well under
  // MAX_PIERCE_MEMORY, and a shot that somehow exceeded it would re-hit rather
  // than crash — the lesser of the two failures.
  if (p.hitCount < p.hitIds.length) p.hitIds[p.hitCount++] = id
}

/** Returns true if the projectile should despawn. */
function resolveArrayProjectile(
  sim: SimulationState,
  p: Projectile,
  dead: Set<number>,
  dt: number,
): boolean {
  for (const contact of sim.contact) {
    if (dead.has(contact.id)) continue
    // A piercing shot overlaps what it hit for several ticks, and with packed
    // Contacts it can come back around to an earlier one. Every Contact it has
    // already damaged is remembered, not just the most recent.
    if (alreadyHit(p, contact.id)) continue

    // Authored per Contact, and generous relative to the sprite — the same
    // fairness principle as the Sun's deliberately small hitbox.
    const radius = p.radius + contact.def.hurtboxRadius

    if (
      sweptDistanceSq(p, contact.position.x, contact.position.y, dt) <=
      radius * radius
    ) {
      hitContact(sim, p, contact, 1, dead)

      // Burst: everything else inside the radius, at reduced damage. Measured
      // from the Contact struck rather than from the projectile, so the splash
      // is centred on the impact a player actually sees.
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

      // Pierce: keep going, one fewer target left. A burst shot never pierces
      // — the two are alternatives in ShotProfile, not flags to combine.
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
