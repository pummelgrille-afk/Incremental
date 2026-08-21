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
} from '../systems/combat'
import { updateBuffs } from '../systems/buffs'
import {
  checkThresholds,
  rerollWaveArc,
  updateObjective,
  updateStageProgress,
} from '../systems/objectiveRules'
import { grantShield, repair } from '../entities/Mainspring'
import { repairCost } from '../progression/currencies'
import {
  chimePosition,
  updateChimes,
  updateMovements,
  type ChimeShot,
} from '../systems/ai'
import { updateSlackMotion, updateSpawning, waveSpawnDuration } from '../systems/spawn'
import { createCooldowns, updateSynergy } from '../systems/synergy'
import { directWave } from '../systems/scaling'
import { TELEMETRY_SOURCES } from '../systems/telemetry'
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
  /**
   * Participants in the largest conjunction this tick, or 0 for none.
   *
   * The count alone cannot distinguish a pair from a triple, and the
   * achievement for a triple needs to. Merged with `max`, not `+`.
   */
  largestConjunction: number
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
    largestConjunction: 0,
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

  /** Per-wave telemetry accumulators. Dev-only; unread in a production build. */
  private waveSeconds = 0
  private waveSpawned = 0
  private waveKilled = 0
  private waveStartTension = 0
  private lastSlackCount = 0

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
      sourceDefId: '',
    }))
    state.projectiles = this.projectiles.items
    this.waveStartTension = state.mainspring.hp
    // Wave 0 never fires waveStarted, so seed its bearing here. Its *content*
    // is directed lazily on the first tick instead: the formation is slotted
    // after construction, so measuring power now would read an empty field.
    rerollWaveArc(state, rng)
  }

  /**
   * Ask the director for the wave that will actually run, and cache it.
   *
   * Cached rather than recomputed because spawning, the wave total and the
   * spawn duration must agree — a wave whose total moved underneath the clear
   * check would never complete.
   */
  private directCurrentWave(): void {
    const authored = this.state.stage.waves[this.state.waveIndex]
    this.state.activeWave = authored ? directWave(this.state, authored) : null
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
      merged.largestConjunction = Math.max(
        merged.largestConjunction,
        events.largestConjunction,
      )
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

    // The opening wave is directed on the first tick that runs, once the
    // formation exists. Later waves are directed as they start (step 10).
    if (sim.activeWave === null) this.directCurrentWave()

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
      for (const fired of synergy.fired) {
        events.largestConjunction = Math.max(
          events.largestConjunction,
          fired.participants.length,
        )
      }
      events.slackKilled += synergy.slackKilled
      events.filingsDropped += synergy.filingsDropped
    }

    // 10. Threshold crossings, then win/loss and wave progression.
    //     Thresholds are checked here, after damage, not at step 2.
    const thresholds = checkThresholds(sim)
    if (thresholds.length > 0) events.thresholdsCrossed.push(...thresholds)

    const objective = updateStageProgress(sim, dt)
    if (objective.waveStarted) {
      rerollWaveArc(sim, this.rng)
      this.directCurrentWave()
    }
    events.stageCleared = objective.stageCleared
    events.stageLost = objective.stageLost
    events.waveCleared = objective.waveCleared
    events.waveStarted = objective.waveStarted

    this.totalSlackKilled += events.slackKilled
    this.totalConjunctions += events.conjunctionsFired

    this.recordTelemetry(dt, events)

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
  /**
   * Feed the dev-only telemetry sink.
   *
   * Gathered here rather than inside each system so the per-tick cost is one
   * pass over units that already exist, and so the tick order stays readable —
   * everything above this line is the simulation, this line is instrumentation.
   */
  private recordTelemetry(dt: number, events: TickEvents): void {
    const telemetry = this.state.telemetry
    if (!telemetry) return

    const sim = this.state
    telemetry.elapsed += dt

    // Unit-seconds, the denominator that makes DPS comparable between a unit
    // slotted from the start and one added halfway through.
    const present: string[] = []
    for (const m of sim.movements) if (m.disabledFor <= 0) present.push(m.def.id)
    for (const c of sim.chimes) if (c.disabledFor <= 0) present.push(c.def.id)
    telemetry.present(present, dt)

    this.waveSeconds += dt
    this.waveSpawned += Math.max(0, sim.slack.length - this.lastSlackCount + events.slackKilled)
    this.waveKilled += events.slackKilled
    this.lastSlackCount = sim.slack.length

    if (events.waveCleared || events.stageCleared || events.stageLost) {
      const maxTension = sim.mainspring.maxHp || 1
      telemetry.wave({
        index: sim.waveIndex,
        seconds: this.waveSeconds,
        spawned: this.waveSpawned,
        killed: this.waveKilled,
        tensionLost: (this.waveStartTension - sim.mainspring.hp) / maxTension,
      })
      this.waveSeconds = 0
      this.waveSpawned = 0
      this.waveKilled = 0
      this.waveStartTension = sim.mainspring.hp
    }

    telemetry.tensionLost = sim.mainspring.maxHp - sim.mainspring.hp

    if (events.stageCleared || events.stageLost) {
      telemetry.stageSeconds = sim.elapsed
      telemetry.outcome = events.stageCleared ? 'cleared' : 'lost'
    }
  }

  strike(x: number, y: number): boolean {
    const sim = this.state
    if (sim.phase !== 'wave-active' && sim.phase !== 'wave-gap') return false

    const beat = sim.beat
    if (beat.charge < 1 || beat.cooldown > 0) return false

    beat.charge -= 1
    beat.cooldown = BEAT.cooldown
    beat.struck++
    if (sim.telemetry) sim.telemetry.beatsStruck++

    const dead = new Set<number>()
    const radius = BEAT.radius + sim.effects.beatRadius
    const radiusSq = radius * radius

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
      sim.telemetry?.damage(TELEMETRY_SOURCES.beat, Math.min(before, damage), died)
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
   * Emergency repair the objective. Phase 21 owns the Filings
   * transaction — this returns the cost so the caller can charge for it, and
   * refuses at full Tension so nobody is charged for nothing.
   */
  repairMainspring(): { repaired: boolean; cost: number } {
    const cost = repairCost(this.state.mainspring.repairsThisStage, this.state.effects.repairCost)
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
          p.sourceDefId = slack.def.id
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
      p.damage = shot.chime.def.attack * shot.chime.levelScale * shot.chime.attackScale
      p.sourceDefId = shot.chime.def.id
      p.damageType = 'resonant'
      p.radius = 4
      p.lifetime = 4
      p.angularVelocity = 0
      p.sourceId = shot.chime.id
    }
  }

}

export { RINGS }
