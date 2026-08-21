import type { Projectile } from '../entities/Projectile'
import { BUDGETS } from '../content/budgets'
import { BEAT, CONJUNCTION, RINGS } from '../content/field'
import { patternById } from '../systems/patterns'
import { updateProjectiles } from '../systems/collision'
import {
  computeDamage,
  damageSlack,
  reapSlack,
  resolveMovementAttacks,
  updateBuffs,
} from '../systems/combat'
import { checkThresholds, updateObjective, updateStageProgress } from '../systems/objectiveRules'
import { grantShield, repair, repairCost } from '../entities/Mainspring'
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

export const PROJECTILE_BUDGET = BUDGETS.projectiles

export interface TickEvents {
  slackKilled: number
  filingsDropped: number
  mainspringHits: number
  conjunctionsFired: number
  stageCleared: boolean
  stageLost: boolean
  /** True on the tick a wave finished / a new one began. */
  waveCleared: boolean
  waveStarted: boolean
  /** Tension thresholds crossed downward, e.g. [0.5]. */
  thresholdsCrossed: number[]
}

function noTickEvents(): TickEvents {
  return {
    slackKilled: 0,
    filingsDropped: 0,
    mainspringHits: 0,
    conjunctionsFired: 0,
    stageCleared: false,
    stageLost: false,
    waveCleared: false,
    waveStarted: false,
    // Fresh array per tick: a shared one would accumulate across ticks.
    thresholdsCrossed: [],
  }
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

  /** Most recent strike, for the render layer. Cleared after a short age. */
  lastStrike: { x: number; y: number; age: number } | null = null

  /** Filings from a strike, banked into the next tick's events. */
  private pendingFilings = 0

  /** Peak concurrent Slack this stage. Phase 11 budget instrumentation. */
  peakSlack = 0
  /** Ticks spent over the Slack budget. Non-zero means content overruns it. */
  ticksOverSlackBudget = 0

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

    const merged: TickEvents = noTickEvents()

    while (this.accumulator >= TICK_SECONDS) {
      const events = this.tick(TICK_SECONDS)
      this.accumulator -= TICK_SECONDS

      merged.slackKilled += events.slackKilled
      merged.filingsDropped += events.filingsDropped
      merged.mainspringHits += events.mainspringHits
      merged.conjunctionsFired += events.conjunctionsFired
      merged.stageCleared ||= events.stageCleared
      merged.stageLost ||= events.stageLost
      merged.waveCleared ||= events.waveCleared
      merged.waveStarted ||= events.waveStarted
      if (events.thresholdsCrossed.length > 0) {
        merged.thresholdsCrossed.push(...events.thresholdsCrossed)
      }
    }

    return merged
  }

  /** Fraction of the way to the next tick, for render interpolation. */
  get alpha(): number {
    return this.accumulator / TICK_SECONDS
  }

  tick(dt: number): TickEvents {
    const sim = this.state
    const events: TickEvents = noTickEvents()

    if (sim.phase === 'cleared' || sim.phase === 'overwhelmed') return events

    this.tickCount++
    const previousWaveElapsed = sim.waveElapsed
    sim.elapsed += dt

    // 1. Ring phases.
    this.advanceRings(dt)

    // 2. Cooldowns, charge, buffs, objective recovery.
    this.advanceBeat(dt)
    sim.feed.update(dt)
    updateBuffs(sim, dt)
    updateObjective(sim, dt)

    if (this.pendingFilings > 0) {
      events.filingsDropped += this.pendingFilings
      this.pendingFilings = 0
    }

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

    // 10. Threshold crossings, then win/loss and wave progression.
    //     Thresholds are checked here, after damage, not at step 2.
    const thresholds = checkThresholds(sim)
    if (thresholds.length > 0) events.thresholdsCrossed.push(...thresholds)

    const objective = updateStageProgress(sim, dt)
    events.stageCleared = objective.stageCleared
    events.stageLost = objective.stageLost
    events.waveCleared = objective.waveCleared
    events.waveStarted = objective.waveStarted

    this.totalSlackKilled += events.slackKilled
    this.totalConjunctions += events.conjunctionsFired

    // Budget instrumentation. Never clamps — an overrun is a content bug to
    // surface, not something to silently truncate (content/budgets.ts).
    if (sim.slack.length > this.peakSlack) this.peakSlack = sim.slack.length
    if (sim.slack.length > BUDGETS.slack) this.ticksOverSlackBudget++

    // Step 11 (publishing to stores) is the caller's job — the simulation never
    // reaches into Svelte.
    return events
  }

  /**
   * Advance every ring's phase.
   *
   * This is the entire rotation system: one write per ring, and every unit on
   * it moves. Rotation is O(rings), not O(units) — ADR-001.
   *
   * Rotation is constant and has no player input. See combat-spec.md §1.
   */
  private advanceRings(dt: number): void {
    const rings = this.state.rings
    for (let i = 0; i < rings.length; i++) {
      rings[i].phase += rings[i].angularVelocity * dt
    }
  }

  /**
   * The player's one live input: strike a point on the floor.
   *
   * Instant and area-based — nothing to lead, nothing to miss with. Returns
   * false when out of charge or still cooling, so the UI can react without
   * duplicating the rules.
   */
  strike(x: number, y: number): boolean {
    const sim = this.state
    if (sim.phase !== 'wave-active' && sim.phase !== 'wave-gap') return false

    const beat = sim.beat
    if (beat.charge < 1 || beat.cooldown > 0) return false

    beat.charge -= 1
    beat.cooldown = BEAT.cooldown
    beat.struck++

    const dead = new Set<number>()
    const radiusSq = BEAT.radius * BEAT.radius

    for (const slack of sim.slack) {
      const dx = slack.position.x - x
      const dy = slack.position.y - y
      if (dx * dx + dy * dy > radiusSq) continue

      const damage = computeDamage(
        BEAT.baseDamage,
        1,
        'percussive',
        slack.def.armour,
        slack.def.defence,
      )
      const before = slack.hp
      const died = damageSlack(slack, damage)
      sim.feed.emit(
        died ? 'kill' : 'damage',
        slack.position.x,
        slack.position.y,
        before - slack.hp,
      )
      if (died) dead.add(slack.id)
    }

    if (dead.size > 0) {
      const reaped = reapSlack(sim, dead)
      this.totalSlackKilled += reaped.slackKilled
      this.pendingFilings += reaped.filingsDropped
    }

    // Surfaced to the render layer so the strike is visible even when it hits
    // nothing — an input with no feedback reads as a broken input.
    this.lastStrike = { x, y, age: 0 }
    return true
  }

  /**
   * Emergency repair the objective. Hook for Phase 21, which owns the Filings
   * transaction — this returns the cost so the caller can charge for it, and
   * refuses at full Tension so nobody is charged for nothing.
   */
  repairMainspring(): { repaired: boolean; cost: number } {
    const cost = repairCost(this.state.mainspring)
    return { repaired: repair(this.state.mainspring), cost }
  }

  /** Grant the objective a temporary shield. Hook for conjunctions and upgrades. */
  shieldMainspring(amount: number, duration: number): void {
    grantShield(this.state.mainspring, amount, duration)
  }

  /** Advance Beat charge and cooldown on simulation time. */
  private advanceBeat(dt: number): void {
    const beat = this.state.beat
    if (beat.cooldown > 0) beat.cooldown = Math.max(0, beat.cooldown - dt)
    if (beat.charge < beat.maxCharge) {
      beat.charge = Math.min(beat.maxCharge, beat.charge + dt / BEAT.rechargeInterval)
    }
    if (this.lastStrike) {
      this.lastStrike.age += dt
      if (this.lastStrike.age > 0.35) this.lastStrike = null
    }
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

}

export { RINGS }
