import type { ContactDef, ContactInstance } from '../entities/Contact'
import { isBossWave, type SpawnGroup } from '../entities/Wave'
import { contactById } from '../content/contacts'
import { SPAWN_RADIUS } from '../content/field'
import { allocateId, type SimulationState } from '../core/simulation'
import type { Rng } from '../core/rng'
import { scaleDamage, scaleHp } from './scaling'

/**
 * Wave spawning and enemy motion.
 *
 * Reads schedules from wave data — never hardcodes a spawn (CLAUDE.md). Contact
 * appear at the rim and move down the output gradient toward the Sun,
 * which is the fiction's explanation for why everything converges on the centre
 * (narrative.md, "The Approach").
 */

/**
 * How much of the gap between neighbours a spawn may wander, either way.
 *
 * Zero gives a comb of perfectly even spacing, which a player memorises after
 * two attempts. One would smear the group into noise and destroy the shape the
 * wave exists to pose. Half keeps it legibly a wall or a pincer while making
 * the individual positions unguessable.
 */
const ARC_JITTER = 0.5

function spawnPosition(
  group: SpawnGroup,
  index: number,
  count: number,
  rng: Rng,
  arcOffset: number,
) {
  let angle: number
  if (group.arc) {
    // Spread across the arc so a concentrated wave reads as a wall, then jitter
    // each spawn within its own slot and rotate the whole arc per wave.
    const t = count > 1 ? index / (count - 1) : 0.5
    const spacing = group.arc.width / Math.max(1, count - 1)
    const jitter = (rng.next() - 0.5) * spacing * ARC_JITTER

    angle = group.arc.centre + arcOffset + (t - 0.5) * group.arc.width + jitter
  } else {
    angle = rng.next() * Math.PI * 2
  }

  return {
    x: Math.cos(angle) * SPAWN_RADIUS,
    y: Math.sin(angle) * SPAWN_RADIUS,
  }
}

/**
 * Build a Contact instance.
 *
 * `rng` is **optional and opting in to jitter**, not the reverse. Omitting it
 * gives a fixed stagger, so a caller can never introduce nondeterminism by
 * forgetting to thread a generator through — which is exactly how a stray
 * `Math.random()` survived here until Phase 12.
 */
export function createContact(
  sim: SimulationState,
  def: ContactDef,
  position: { x: number; y: number },
  rng?: Rng,
): ContactInstance {
  const scalingIndex = sim.stage.scalingIndex
  const zoneMultiplier = sim.zone.scalingMultiplier

  const maxHp = scaleHp(def.maxHp, scalingIndex, zoneMultiplier)

  return {
    id: allocateId(sim),
    def,
    position,
    velocity: { x: 0, y: 0 },
    hp: maxHp,
    maxHp,
    scaledAttack: scaleDamage(def.attack, scalingIndex, zoneMultiplier),
    // Stagger the first emission so a group does not fire in perfect unison.
    // Deterministic midpoint when no generator is supplied.
    patternCooldown: def.patternInterval * (rng ? 0.4 + rng.next() * 0.6 : 0.7),
    telegraphRemaining: 0,
    shieldHitsRemaining: def.traits?.shieldHits ?? 0,
    hitFlash: 0,
  }
}

/**
 * Spawn anything the current wave's schedule says is due.
 *
 * Driven by `waveElapsed` rather than by a per-group timer, so the schedule is
 * declarative and a wave can be restarted by resetting one number.
 */
/**
 * The wave in play — the directed one when the director has produced it,
 * otherwise what the stage authored.
 *
 * One accessor rather than three call sites reaching for `stage.waves[i]`,
 * because spawning, the wave total and the spawn duration disagreeing about a
 * count is a wave that never completes.
 */
export function currentWave(sim: SimulationState, waveIndex: number) {
  if (waveIndex === sim.waveIndex && sim.activeWave) return sim.activeWave
  return sim.stage.waves[waveIndex]
}

export function updateSpawning(sim: SimulationState, rng: Rng, previousElapsed: number): void {
  if (sim.phase !== 'wave-active') return

  const wave = currentWave(sim, sim.waveIndex)
  if (!wave || isBossWave(wave)) return

  for (const group of wave.groups) {
    const def = contactById(group.defId)
    if (!def) continue

    for (let i = 0; i < group.count; i++) {
      const due = group.delay + group.interval * i
      // Fire exactly once, on the tick that crosses the due time.
      if (due > previousElapsed && due <= sim.waveElapsed) {
        sim.contact.push(
          createContact(
            sim,
            def,
            spawnPosition(group, i, group.count, rng, sim.waveArcOffset),
            rng,
          ),
        )
      }
    }
  }
}

/** Total Contact a wave will produce. Used to decide when it is cleared. */
export function waveTotal(sim: SimulationState, waveIndex: number): number {
  const wave = currentWave(sim, waveIndex)
  if (!wave || isBossWave(wave)) return 0
  return wave.groups.reduce((n, g) => n + g.count, 0)
}

/** Seconds until a wave has finished spawning everything. */
export function waveSpawnDuration(sim: SimulationState, waveIndex: number): number {
  const wave = currentWave(sim, waveIndex)
  if (!wave || isBossWave(wave)) return 0
  return wave.groups.reduce(
    (max, g) => Math.max(max, g.delay + g.interval * Math.max(0, g.count - 1)),
    0,
  )
}

/** Where an `orbit` Contact settles if its content does not say. */
const DEFAULT_ORBIT_RADIUS = 210

/**
 * Move Contact toward the Sun according to their motion archetype.
 *
 * Four archetypes, each meant to demand a different answer from the player:
 *
 * - `swarm`   weaves inward; hard to catch with a narrow arc, easy in bulk
 * - `drift`   straight and slow; the anvil a front line grinds down
 * - `charge`  accelerates once inside the outer ring; punishes a thin ring 1
 * - `orbit`   settles at a radius and circles, firing — cannot be out-waited,
 *             and is the one archetype a static Array answers better than a
 *             rotating Platform
 */
export function updateContactMotion(sim: SimulationState, dt: number): void {
  for (const contact of sim.contact) {
    const { x, y } = contact.position
    const distance = Math.hypot(x, y) || 1

    // Unit vector pointing inward.
    const towardCentreX = -x / distance
    const towardCentreY = -y / distance

    let speed = contact.def.speed

    switch (contact.def.motion) {
      case 'charge':
        // Accelerates inside the outer ring — the Manual's stated concern.
        if (distance < 240) speed *= 1.9
        break
      case 'swarm': {
        // Slight tangential weave so a group does not collapse into one line.
        const weave = Math.sin(sim.elapsed * 2.2 + contact.id) * 0.35
        contact.velocity.x = (towardCentreX - towardCentreY * weave) * speed
        contact.velocity.y = (towardCentreY + towardCentreX * weave) * speed
        contact.position.x += contact.velocity.x * dt
        contact.position.y += contact.velocity.y * dt
        if (contact.hitFlash > 0) contact.hitFlash = Math.max(0, contact.hitFlash - dt)
        continue
      }
      case 'orbit': {
        const target = contact.def.traits?.orbitRadius ?? DEFAULT_ORBIT_RADIUS

        if (distance > target + 4) break // still closing; fall through to inward

        // Settled: circle instead of closing. Tangential is the inward vector
        // rotated a quarter turn, so this needs no extra trigonometry.
        const direction = contact.id % 2 === 0 ? 1 : -1
        contact.velocity.x = -towardCentreY * speed * direction
        contact.velocity.y = towardCentreX * speed * direction
        contact.position.x += contact.velocity.x * dt
        contact.position.y += contact.velocity.y * dt

        /*
         * Pin the radius.
         *
         * A tangential step leaves the circle (the tangent lies outside it), so
         * Euler integration walks the orbit outward until the re-close check
         * yanks it back — an oscillating band rather than the fixed radius the
         * archetype promises. Renormalising costs one square root and makes
         * "settles at a radius" literally true.
         */
        const drifted = Math.hypot(contact.position.x, contact.position.y) || 1
        contact.position.x = (contact.position.x / drifted) * target
        contact.position.y = (contact.position.y / drifted) * target

        if (contact.hitFlash > 0) contact.hitFlash = Math.max(0, contact.hitFlash - dt)
        continue
      }
      case 'drift':
      default:
        break
    }

    contact.velocity.x = towardCentreX * speed
    contact.velocity.y = towardCentreY * speed
    contact.position.x += contact.velocity.x * dt
    contact.position.y += contact.velocity.y * dt

    if (contact.hitFlash > 0) contact.hitFlash = Math.max(0, contact.hitFlash - dt)
  }
}
