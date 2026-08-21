import type { Projectile } from '../entities/Projectile'
import { isBossWave } from '../entities/Wave'
import { CONJUNCTION, NUDGE, RINGS, ringByIndex } from '../content/field'
import { patternById } from '../systems/patterns'
import { updateProjectiles } from '../systems/collision'
import {
  resolveMovementAttacks,
  updateBuffs,
  updateMainspring,
} from '../systems/combat'
import {
  chimePosition,
  updateChimes,
  updateMovements,
  type ChimeShot,
} from '../systems/ai'
import { updateSlackMotion, updateSpawning, waveSpawnDuration } from '../systems/spawn'
import { createCooldowns, updateSynergy } from '../systems/synergy'
import { Pool } from '../utils/pool'
import type { Rng } from './rng'
import { isOverwhelmed } from '../entities/Mainspring'
import type { RingIndex } from '../entities/types'
import type { SimulationState } from './simulation'

/**
 * The simulation tick.
 *
 * Fixed timestep at 20 Hz. Rendering interpolates between states and runs at
 * whatever rate the display allows — a dropped frame must never change the
 * simulation (docs/architecture.md, "Layer boundaries").
 *
 * Step order is fixed by combat-spec.md §8 and must not drift. Each numbered
 * comment below maps to a numbered step in that document.
 */

export const TICK_RATE = 20
export const TICK_SECONDS = 1 / TICK_RATE

/** Never simulate more than this per frame; a stalled tab must not fast-forward. */
export const MAX_CATCHUP_SECONDS = 0.5

export const PROJECTILE_BUDGET = 600

export interface TickEvents {
  slackKilled: number
  filingsDropped: number
  mainspringHits: number
  conjunctionsFired: number
  stageCleared: boolean
  stageLost: boolean
}

const NO_EVENTS: TickEvents = {
  slackKilled: 0,
  filingsDropped: 0,
  mainspringHits: 0,
  conjunctionsFired: 0,
  stageCleared: false,
  stageLost: false,
}

export class Simulation {
  readonly projectiles: Pool<Projectile>
  private readonly cooldowns = createCooldowns()

  /** Leftover real time not yet consumed by a whole tick. */
  private accumulator = 0

  /** Cumulative counters, read by the store projection. */
  totalSlackKilled = 0
  totalConjunctions = 0
  tickCount = 0

  constructor(
    public state: SimulationState,
    private readonly rng: Rng,
    budget = PROJECTILE_BUDGET,
  ) {
    this.projectiles = new Pool<Projectile>(budget, (index) => ({
      id: index,
      active: false,
      faction: 'slack',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      damage: 0,
      damageType: 'percussive',
      radius: 3.5,
      lifetime: 0,
      angularVelocity: 0,
      sourceId: -1,
    }))
    state.projectiles = this.projectiles.items
  }

  /**
   * Advance by real elapsed time, running as many fixed ticks as it covers.
   *
   * Returns the merged events from every tick that ran, so a caller polling at
   * 60 Hz never misses a kill that happened in a tick it did not observe.
   */
  advance(elapsedSeconds: number): TickEvents {
    this.accumulator += Math.min(elapsedSeconds, MAX_CATCHUP_SECONDS)

    const merged: TickEvents = { ...NO_EVENTS }

    while (this.accumulator >= TICK_SECONDS) {
      const events = this.tick(TICK_SECONDS)
      this.accumulator -= TICK_SECONDS

      merged.slackKilled += events.slackKilled
      merged.filingsDropped += events.filingsDropped
      merged.mainspringHits += events.mainspringHits
      merged.conjunctionsFired += events.conjunctionsFired
      merged.stageCleared ||= events.stageCleared
      merged.stageLost ||= events.stageLost
    }

    return merged
  }

  /** Fraction of the way to the next tick, for render interpolation. */
  get alpha(): number {
    return this.accumulator / TICK_SECONDS
  }

  tick(dt: number): TickEvents {
    const sim = this.state
    const events: TickEvents = { ...NO_EVENTS }

    if (sim.phase === 'cleared' || sim.phase === 'overwhelmed') return events

    this.tickCount++
    const previousWaveElapsed = sim.waveElapsed
    sim.elapsed += dt

    // 1. Ring phases.
    this.advanceRings(dt)

    // 2. Cooldowns, charge, buffs.
    updateBuffs(sim, dt)
    updateMainspring(sim, dt)

    // 3. Spawning.
    if (sim.phase === 'wave-active') {
      sim.waveElapsed += dt
      updateSpawning(sim, this.rng, previousWaveElapsed)
    }

    // 4. Enemy motion and pattern emission.
    updateSlackMotion(sim, dt)
    this.emitPatterns(dt)

    // 5. Movement and Chime targeting.
    const attacks = updateMovements(sim, dt)
    const shots = updateChimes(sim, dt)
    this.spawnChimeProjectiles(shots)

    // 6 & 7. Projectile integration and collision.
    const collisions = updateProjectiles(sim, this.projectiles, dt)
    events.mainspringHits += collisions.mainspringHits
    events.slackKilled += collisions.slackKilled
    events.filingsDropped += collisions.filingsDropped

    // 8. Damage from melee attacks and death handling.
    const melee = resolveMovementAttacks(sim, attacks)
    events.slackKilled += melee.slackKilled
    events.filingsDropped += melee.filingsDropped

    // 9. Conjunction, on its own 100 ms cadence.
    sim.synergyAccumulator += dt * 1000
    while (sim.synergyAccumulator >= CONJUNCTION.evalInterval) {
      sim.synergyAccumulator -= CONJUNCTION.evalInterval
      const synergy = updateSynergy(sim, this.cooldowns)
      events.conjunctionsFired += synergy.fired.length
      events.slackKilled += synergy.slackKilled
      events.filingsDropped += synergy.filingsDropped
    }

    // 10. Win/loss and wave progression.
    this.updateStageProgress(sim, dt, events)

    this.totalSlackKilled += events.slackKilled
    this.totalConjunctions += events.conjunctionsFired

    // Step 11 (publishing to stores) is the caller's job — the simulation never
    // reaches into Svelte.
    return events
  }

  /**
   * Advance every ring's phase, applying any in-flight nudge.
   *
   * This is the entire rotation system: one write per ring, and every unit on
   * it moves. Rotation is O(rings), not O(units) — ADR-001.
   */
  private advanceRings(dt: number): void {
    const rings = this.state.rings

    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i]

      if (ring.nudgeCooldown > 0) ring.nudgeCooldown = Math.max(0, ring.nudgeCooldown - dt)

      let delta = ring.angularVelocity * dt

      if (ring.nudgeRemaining > 0) {
        const step = Math.min(dt, ring.nudgeRemaining)
        // Ease-out: most of the travel happens early, so the nudge reads as a
        // decisive shove rather than a slow slide.
        const portion = step / ring.nudgeRemaining
        const applied = ring.nudgeResidual * portion
        delta += applied
        ring.nudgeResidual -= applied
        ring.nudgeRemaining -= step
        if (ring.nudgeRemaining <= 0) {
          delta += ring.nudgeResidual
          ring.nudgeResidual = 0
        }
      }

      ring.phase += delta
    }
  }

  /**
   * The player's one live input: shove a ring by a slot-width.
   *
   * Returns false when the ring is still on cooldown, so the UI can react.
   */
  nudge(ringIndex: RingIndex, direction: 1 | -1): boolean {
    const config = ringByIndex(ringIndex)
    if (!config) return false

    const ring = this.state.rings[config.index - 1]
    if (!ring || ring.nudgeCooldown > 0) return false

    // A slot-width, so the input means the same thing on every ring.
    const impulse = ((Math.PI * 2) / config.slots) * NUDGE.impulseSlots * direction

    ring.nudgeResidual = impulse
    ring.nudgeRemaining = NUDGE.duration
    ring.nudgeCooldown = NUDGE.cooldown
    return true
  }

  /** Slack telegraph, then emit. A pattern that kills without warning is a bug. */
  private emitPatterns(dt: number): void {
    const sim = this.state

    for (const slack of sim.slack) {
      if (slack.telegraphRemaining > 0) {
        slack.telegraphRemaining -= dt
        if (slack.telegraphRemaining > 0) continue

        const pattern = patternById(slack.def.patternId)
        if (!pattern) continue

        const spawns = pattern.build({
          origin: { x: slack.position.x, y: slack.position.y },
          target: { x: 0, y: 0 },
          damage: slack.scaledAttack,
          damageType: 'percussive',
          emitterPhase: sim.elapsed * 1.7,
        })

        for (const spawn of spawns) {
          const p = this.projectiles.acquire()
          // Budget exhausted: simply do not spawn. Running out is information,
          // not an error — Phase 11 reads pool.exhausted to validate the budget.
          if (!p) break

          p.faction = 'slack'
          p.position.x = spawn.position.x
          p.position.y = spawn.position.y
          p.velocity.x = spawn.velocity.x
          p.velocity.y = spawn.velocity.y
          p.damage = spawn.damage
          p.damageType = spawn.damageType
          p.radius = spawn.radius
          p.lifetime = spawn.lifetime
          p.angularVelocity = spawn.angularVelocity
          p.sourceId = slack.id
        }
        continue
      }

      slack.patternCooldown -= dt
      if (slack.patternCooldown <= 0) {
        const pattern = patternById(slack.def.patternId)
        slack.patternCooldown = slack.def.patternInterval
        slack.telegraphRemaining = (pattern?.telegraphMs ?? 400) / 1000
      }
    }
  }

  private spawnChimeProjectiles(shots: ChimeShot[]): void {
    for (const shot of shots) {
      const p = this.projectiles.acquire()
      if (!p) break

      const origin = chimePosition(shot.chime)
      const angle = Math.atan2(shot.aimPoint.y - origin.y, shot.aimPoint.x - origin.x)
      const speed = shot.chime.def.projectileSpeed

      p.faction = 'chime'
      p.position.x = origin.x
      p.position.y = origin.y
      p.velocity.x = Math.cos(angle) * speed
      p.velocity.y = Math.sin(angle) * speed
      p.damage = shot.chime.def.attack * shot.chime.attackMultiplier
      p.damageType = 'resonant'
      p.radius = 4
      p.lifetime = 4
      p.angularVelocity = 0
      p.sourceId = shot.chime.id
    }
  }

  /** Wave progression, stage clear, and the loss condition. */
  private updateStageProgress(sim: SimulationState, dt: number, events: TickEvents): void {
    if (isOverwhelmed(sim.mainspring)) {
      sim.phase = 'overwhelmed'
      events.stageLost = true
      return
    }

    if (sim.phase === 'wave-gap') {
      sim.gapRemaining -= dt
      if (sim.gapRemaining <= 0) {
        sim.waveIndex++
        sim.waveElapsed = 0
        sim.phase = 'wave-active'
      }
      return
    }

    if (sim.phase !== 'wave-active') return

    const wave = sim.stage.waves[sim.waveIndex]
    if (!wave) return

    // A wave is cleared once everything has spawned and nothing is left.
    const finishedSpawning = sim.waveElapsed >= waveSpawnDuration(sim, sim.waveIndex)
    if (!finishedSpawning || sim.slack.length > 0) return

    if (sim.waveIndex >= sim.stage.waves.length - 1) {
      sim.phase = 'cleared'
      events.stageCleared = true
      return
    }

    sim.phase = 'wave-gap'
    sim.gapRemaining = isBossWave(wave) ? wave.gapAfter : wave.gapAfter
  }
}

export { RINGS }
