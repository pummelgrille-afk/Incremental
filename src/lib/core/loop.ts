import { MAX_PIERCE_MEMORY, type Projectile } from '../entities/Projectile'
import { BUDGETS } from '../content/budgets'
import { FLARE, CONJUNCTION, RINGS } from '../content/field'
import { patternById } from '../systems/patterns'
import { updateProjectiles } from '../systems/collision'
import {
  computeDamage,
  damageContact,
  reapContact,
  resolvePlatformAttacks,
} from '../systems/combat'
import { updateBuffs } from '../systems/buffs'
import {
  checkThresholds,
  rerollWaveArc,
  updateObjective,
  updateStageProgress,
} from '../systems/objectiveRules'
import { grantShield, repair } from '../entities/Sun'
import { repairCost } from '../progression/currencies'
import {
  arrayPosition,
  updateArrays,
  updatePlatforms,
  type ArrayShot,
} from '../systems/ai'
import {
  updateContactMotion,
  updateWards,
  updateSpawning,
  waveSpawnDuration,
} from '../systems/spawn'
import { spawnBoss, updateBoss } from '../systems/boss'
import { bossById } from '../content/bosses'
import { isBossWave } from '../entities/Wave'
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
  contactKilled: number
  salvageDropped: number
  sunHits: number
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
  /** Output thresholds crossed downward, e.g. [0.5]. */
  thresholdsCrossed: number[]
}

function noTickEvents(): TickEvents {
  return {
    contactKilled: 0,
    salvageDropped: 0,
    sunHits: 0,
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
  totalContactKilled = 0
  totalConjunctions = 0
  tickCount = 0

  /** Most recent strike, for the render layer. Cleared after a short age. */
  lastStrike: { x: number; y: number; age: number } | null = null

  /** Salvage from a strike, banked into the next tick's events. */
  private pendingSalvage = 0

  /** Peak concurrent Contact this stage. Phase 11 budget instrumentation. */
  peakContact = 0
  /** Ticks spent over the Contact budget. Non-zero means content overruns it. */
  ticksOverContactBudget = 0

  /** Per-wave telemetry accumulators. Dev-only; unread in a production build. */
  private waveSeconds = 0
  private waveSpawned = 0
  private waveKilled = 0
  private waveStartOutput = 0
  private lastContactCount = 0

  constructor(
    public state: SimulationState,
    private readonly rng: Rng,
    budget = PROJECTILE_BUDGET,
  ) {
    this.projectiles = new Pool<Projectile>(budget, (index) => ({
      id: index,
      active: false,
      faction: 'contact',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      damage: 0,
      damageType: 'percussive',
      radius: 3.5,
      lifetime: 0,
      angularVelocity: 0,
      pierceRemaining: 0,
      burstRadius: 0,
      hitIds: new Array<number>(MAX_PIERCE_MEMORY).fill(-1),
      hitCount: 0,
      sourceId: -1,
      sourceDefId: '',
    }))
    state.projectiles = this.projectiles.items
    this.waveStartOutput = state.sun.hp
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

      merged.contactKilled += events.contactKilled
      merged.salvageDropped += events.salvageDropped
      merged.sunHits += events.sunHits
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
    this.advanceFlare(dt)
    sim.feed.update(dt)
    updateBuffs(sim, dt)
    updateObjective(sim, dt)

    if (this.pendingSalvage > 0) {
      events.salvageDropped += this.pendingSalvage
      this.pendingSalvage = 0
    }

    // 3. Spawning.
    if (sim.phase === 'wave-active') {
      sim.waveElapsed += dt

      /*
       * A boss wave has no spawn groups, so `updateSpawning` skips it and the
       * encounter has to be placed here. Keyed on the wave index rather than on
       * `sim.boss` being null, because a defeated boss clears its own runtime —
       * without the marker the same encounter would respawn on the very next
       * tick and the wave could never complete.
       */
      const wave = sim.stage.waves[sim.waveIndex]
      if (wave && isBossWave(wave) && sim.bossSpawnedFor !== sim.waveIndex) {
        const def = bossById(wave.bossId)
        if (def) spawnBoss(sim, def, this.rng)
        // Marked even when the id does not resolve, so a bad reference costs an
        // empty wave rather than an attempt every tick forever. stageLoader
        // rejects the stage before this is reachable.
        sim.bossSpawnedFor = sim.waveIndex
      }

      updateSpawning(sim, this.rng, previousWaveElapsed)
    }

    // 4. Enemy motion and pattern emission.
    updateWards(sim)
    updateBoss(sim, dt)
    updateContactMotion(sim, dt)
    this.emitPatterns(dt)

    // 5. Platform and Array targeting.
    const attacks = updatePlatforms(sim, dt)
    const shots = updateArrays(sim, dt)
    this.spawnArrayProjectiles(shots)

    // 6 & 7. Projectile integration and collision.
    const collisions = updateProjectiles(sim, this.projectiles, dt)
    events.sunHits += collisions.sunHits
    events.contactKilled += collisions.contactKilled
    events.salvageDropped += collisions.salvageDropped

    // 8. Damage from melee attacks and death handling.
    const melee = resolvePlatformAttacks(sim, attacks)
    events.contactKilled += melee.contactKilled
    events.salvageDropped += melee.salvageDropped

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
      events.contactKilled += synergy.contactKilled
      events.salvageDropped += synergy.salvageDropped
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

    this.totalContactKilled += events.contactKilled
    this.totalConjunctions += events.conjunctionsFired

    this.recordTelemetry(dt, events)

    // Budget instrumentation. Never clamps — an overrun is a content bug to
    // surface, not something to silently truncate (content/budgets.ts).
    if (sim.contact.length > this.peakContact) this.peakContact = sim.contact.length
    if (sim.contact.length > BUDGETS.contact) this.ticksOverContactBudget++

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
   * The player's one live input: strike a point on the field.
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
    for (const m of sim.platforms) if (m.disabledFor <= 0) present.push(m.def.id)
    for (const c of sim.arrays) if (c.disabledFor <= 0) present.push(c.def.id)
    telemetry.present(present, dt)

    this.waveSeconds += dt
    this.waveSpawned += Math.max(0, sim.contact.length - this.lastContactCount + events.contactKilled)
    this.waveKilled += events.contactKilled
    this.lastContactCount = sim.contact.length

    if (events.waveCleared || events.stageCleared || events.stageLost) {
      const maxOutput = sim.sun.maxHp || 1
      telemetry.wave({
        index: sim.waveIndex,
        seconds: this.waveSeconds,
        spawned: this.waveSpawned,
        killed: this.waveKilled,
        outputLost: (this.waveStartOutput - sim.sun.hp) / maxOutput,
      })
      this.waveSeconds = 0
      this.waveSpawned = 0
      this.waveKilled = 0
      this.waveStartOutput = sim.sun.hp
    }

    telemetry.outputLost = sim.sun.maxHp - sim.sun.hp

    if (events.stageCleared || events.stageLost) {
      telemetry.stageSeconds = sim.elapsed
      telemetry.outcome = events.stageCleared ? 'cleared' : 'lost'
    }
  }

  strike(x: number, y: number): boolean {
    const sim = this.state
    if (sim.phase !== 'wave-active' && sim.phase !== 'wave-gap') return false

    const flare = sim.flare
    if (flare.charge < 1 || flare.cooldown > 0) return false

    flare.charge -= 1
    flare.cooldown = FLARE.cooldown
    flare.struck++
    if (sim.telemetry) sim.telemetry.flaresStruck++

    const dead = new Set<number>()
    const radius = FLARE.radius + sim.effects.flareRadius
    const radiusSq = radius * radius

    for (const contact of sim.contact) {
      const dx = contact.position.x - x
      const dy = contact.position.y - y
      if (dx * dx + dy * dy > radiusSq) continue

      const damage = computeDamage(
        FLARE.baseDamage,
        1,
        'percussive',
        contact.def.armour,
        contact.def.defence,
      )
      const before = contact.hp
      const died = damageContact(contact, damage)
      sim.telemetry?.damage(TELEMETRY_SOURCES.flare, Math.min(before, damage), died)
      sim.feed.emit(
        died ? 'kill' : 'damage',
        contact.position.x,
        contact.position.y,
        before - contact.hp,
      )
      if (died) dead.add(contact.id)
    }

    if (dead.size > 0) {
      const reaped = reapContact(sim, dead)
      this.totalContactKilled += reaped.contactKilled
      this.pendingSalvage += reaped.salvageDropped
    }

    // Surfaced to the render layer so the strike is visible even when it hits
    // nothing — an input with no feedback reads as a broken input.
    this.lastStrike = { x, y, age: 0 }
    return true
  }

  /**
   * Emergency repair the objective. Phase 21 owns the Salvage
   * transaction — this returns the cost so the caller can charge for it, and
   * refuses at full Output so nobody is charged for nothing.
   */
  repairSun(): { repaired: boolean; cost: number } {
    const cost = repairCost(this.state.sun.repairsThisStage, this.state.effects.repairCost)
    return { repaired: repair(this.state.sun), cost }
  }

  /** Grant the objective a temporary shield. Hook for conjunctions and upgrades. */
  shieldSun(amount: number, duration: number): void {
    grantShield(this.state.sun, amount, duration)
  }

  /** Advance Flare charge and cooldown on simulation time. */
  private advanceFlare(dt: number): void {
    const flare = this.state.flare
    if (flare.cooldown > 0) flare.cooldown = Math.max(0, flare.cooldown - dt)
    if (flare.charge < flare.maxCharge) {
      flare.charge = Math.min(flare.maxCharge, flare.charge + dt / FLARE.rechargeInterval)
    }
    if (this.lastStrike) {
      this.lastStrike.age += dt
      if (this.lastStrike.age > 0.35) this.lastStrike = null
    }
  }

  /** Contact telegraph, then emit. A pattern that kills without warning is a bug. */
  private emitPatterns(dt: number): void {
    const sim = this.state

    for (const contact of sim.contact) {
      if (contact.telegraphRemaining > 0) {
        contact.telegraphRemaining -= dt
        if (contact.telegraphRemaining > 0) continue

        const pattern = patternById(contact.def.patternId)
        if (!pattern) continue

        const spawns = pattern.build({
          origin: { x: contact.position.x, y: contact.position.y },
          target: { x: 0, y: 0 },
          damage: contact.scaledAttack,
          damageType: 'percussive',
          emitterPhase: sim.elapsed * 1.7,
        })

        for (const spawn of spawns) {
          const p = this.projectiles.acquire()
          // Budget exhausted: simply do not spawn. Running out is information,
          // not an error — Phase 11 reads pool.exhausted to validate the budget.
          if (!p) break

          p.faction = 'contact'
          p.position.x = spawn.position.x
          p.position.y = spawn.position.y
          p.velocity.x = spawn.velocity.x
          p.velocity.y = spawn.velocity.y
          p.damage = spawn.damage
          p.damageType = spawn.damageType
          p.radius = spawn.radius
          p.lifetime = spawn.lifetime
          p.angularVelocity = spawn.angularVelocity
          p.sourceId = contact.id
          p.sourceDefId = contact.def.id
        }
        continue
      }

      contact.patternCooldown -= dt
      if (contact.patternCooldown <= 0) {
        const pattern = patternById(contact.def.patternId)
        contact.patternCooldown = contact.def.patternInterval
        contact.telegraphRemaining = (pattern?.telegraphMs ?? 400) / 1000
      }
    }
  }

  private spawnArrayProjectiles(shots: ArrayShot[]): void {
    for (const shot of shots) {
      const p = this.projectiles.acquire()
      if (!p) break

      const origin = arrayPosition(shot.array)
      const angle = Math.atan2(shot.aimPoint.y - origin.y, shot.aimPoint.x - origin.x)
      const speed = shot.array.def.projectileSpeed

      p.faction = 'array'
      p.position.x = origin.x
      p.position.y = origin.y
      p.velocity.x = Math.cos(angle) * speed
      p.velocity.y = Math.sin(angle) * speed
      p.damage = shot.array.def.attack * shot.array.levelScale * shot.array.attackScale
      p.sourceDefId = shot.array.def.id
      p.damageType = 'resonant'
      p.radius = 4
      p.lifetime = 4
      p.angularVelocity = 0
      p.sourceId = shot.array.id

      // Translate the authored shot shape into the pooled projectile's flat
      // fields. The union stays in content, where it reads well; the hot path
      // sees two numbers.
      const profile = shot.array.def.shot
      p.pierceRemaining = profile.kind === 'pierce' ? profile.targets - 1 : 0
      p.burstRadius = profile.kind === 'burst' ? profile.radius : 0
      p.hitCount = 0
    }
  }

}

export { RINGS }
