import type { Projectile } from '../entities/Projectile'
import { ringByIndex, slotAngle } from '../content/field'
import type { SimulationState } from '../core/simulation'
import type { Pool } from '../utils/pool'
import { angleDelta } from './ai'
import {
  computeDamage,
  damageMainspring,
  damageMovement,
  damageSlack,
  reapSlack,
} from './combat'

/**
 * Projectile integration and collision.
 *
 * Hitboxes are decoupled from sprite bounds for fairness (combat-spec.md §5):
 * the Mainspring's collision radius is deliberately smaller than what is drawn,
 * so near misses read as misses.
 *
 * PLACEHOLDER SCOPE — Phase 17 adds spatial partitioning. At the Phase 10 slice's
 * entity counts a linear scan is measurably fine, and a grid built before the
 * access patterns are known would be guesswork.
 */

/**
 * How far either side of its ring a Movement can intercept, in pixels.
 *
 * A projectile well inside or outside the ring is not passing through the unit,
 * so this bounds the block check radially. Decoupled from any sprite size:
 * changing what a Movement looks like must not change what it blocks.
 */
const BLOCK_BAND = 10

export interface CollisionResult {
  mainspringHits: number
  movementHits: number
  slackKilled: number
  filingsDropped: number
}

export function updateProjectiles(
  sim: SimulationState,
  pool: Pool<Projectile>,
  dt: number,
): CollisionResult {
  const result: CollisionResult = {
    mainspringHits: 0,
    movementHits: 0,
    slackKilled: 0,
    filingsDropped: 0,
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

    if (p.faction === 'slack') {
      if (resolveSlackProjectile(sim, p, distanceSq, result)) pool.releaseAt(i)
    } else {
      if (resolveChimeProjectile(sim, p, dead)) pool.releaseAt(i)
    }
  }

  if (dead.size > 0) {
    const reaped = reapSlack(sim, dead)
    result.slackKilled += reaped.slackKilled
    result.filingsDropped += reaped.filingsDropped
  }

  return result
}

/** Returns true if the projectile should despawn. */
function resolveSlackProjectile(
  sim: SimulationState,
  p: Projectile,
  distanceSq: number,
  result: CollisionResult,
): boolean {
  // The Mainspring, first — it is the thing being defended.
  const hitRadius = sim.mainspring.hitboxRadius + p.radius
  if (distanceSq <= hitRadius * hitRadius) {
    damageMainspring(sim, p.damage)
    // No popup: the white flash and the HUD Tension bar already say this, and
    // a third channel at the busiest point on the field only adds noise.
    result.mainspringHits++
    return true
  }

  // Block arc: a projectile crossing a Movement's slot within blockArc is
  // absorbed, damaging that Movement instead. This is how the front line
  // defends without a separate mechanic — combat-spec.md §5.
  const projectileRadius = Math.sqrt(distanceSq)
  const projectileAngle = Math.atan2(p.position.y, p.position.x)

  for (const movement of sim.movements) {
    if (movement.disabledFor > 0) continue

    const ring = ringByIndex(movement.slot.ring)
    if (!ring) continue

    // Only intercept near the ring's radius — a projectile well inside or
    // outside is not passing through this unit.
    if (Math.abs(projectileRadius - ring.radius) > BLOCK_BAND + p.radius) continue

    const ringState = sim.rings[ring.index - 1]
    const unitAngle = slotAngle(ring, movement.slot.slot, ringState?.phase ?? 0)

    if (Math.abs(angleDelta(unitAngle, projectileAngle)) <= movement.def.blockArc) {
      damageMovement(movement, p.damage, sim.telemetry)
      sim.feed.emit('block', p.position.x, p.position.y, p.damage)
      result.movementHits++
      return true
    }
  }

  return false
}

/** Returns true if the projectile should despawn. */
function resolveChimeProjectile(
  sim: SimulationState,
  p: Projectile,
  dead: Set<number>,
): boolean {
  for (const slack of sim.slack) {
    if (dead.has(slack.id)) continue

    const dx = slack.position.x - p.position.x
    const dy = slack.position.y - p.position.y
    // Authored per Slack, and generous relative to the sprite — the same
    // fairness principle as the Mainspring's deliberately small hitbox.
    const radius = p.radius + slack.def.hurtboxRadius

    if (dx * dx + dy * dy <= radius * radius) {
      const before = slack.hp
      // Friendly projectiles go through the same formula as every other damage
      // source. Applying raw damage here would make "Chimes are always
      // Resonant" (combat-spec.md section 4) meaningless — the whole reason
      // they counter Erratic and struggle against Seized is the type
      // multiplier — and would let them ignore armour entirely.
      const damage = computeDamage(
        p.damage,
        1,
        p.damageType,
        slack.def.armour,
        slack.def.defence,
      )
      const died = damageSlack(slack, damage)
      sim.telemetry?.damage(p.sourceDefId, before - slack.hp, died)
      sim.feed.emit(
        died ? 'kill' : 'damage',
        slack.position.x,
        slack.position.y,
        before - slack.hp,
      )
      if (died) dead.add(slack.id)
      return true
    }
  }
  return false
}
