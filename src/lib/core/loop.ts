import { MAX_PIERCE_MEMORY, type Projectile } from '../entities/Projectile'
import { BUDGETS } from '../content/budgets'
import { FLARE, CONJUNCTION, RINGS } from '../content/field'
import { FLARE_BURST, FLARE_COLOUR } from '../content/effects'
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

export const TICK_RATE = 20
export const TICK_SECONDS = 1 / TICK_RATE

export const MAX_CATCHUP_SECONDS = 0.5

export const PROJECTILE_BUDGET = BUDGETS.projectiles

export interface TickEvents {
  contactKilled: number
  salvageDropped: number
  sunHits: number

  contactHits: number
  conjunctionsFired: number

  largestConjunction: number
  stageCleared: boolean
  stageLost: boolean

  waveCleared: boolean
  waveStarted: boolean

  thresholdsCrossed: number[]
}

export function noTickEvents(): TickEvents {
  return {
    contactKilled: 0,
    salvageDropped: 0,
    sunHits: 0,
    contactHits: 0,
    conjunctionsFired: 0,
    largestConjunction: 0,
    stageCleared: false,
    stageLost: false,
    waveCleared: false,
    waveStarted: false,

    thresholdsCrossed: [],
  }
}

export class Simulation {
  readonly projectiles: Pool<Projectile>
  private readonly cooldowns = createCooldowns()

  private accumulator = 0

  totalContactKilled = 0
  totalConjunctions = 0
  tickCount = 0

  lastStrike: { x: number; y: number; age: number } | null = null

  private pendingSalvage = 0

  peakContact = 0

  ticksOverContactBudget = 0

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

    rerollWaveArc(state, rng)
  }

  private directCurrentWave(): void {
    const authored = this.state.stage.waves[this.state.waveIndex]
    this.state.activeWave = authored ? directWave(this.state, authored) : null
  }

  advance(elapsedSeconds: number): TickEvents {
    this.accumulator += Math.min(elapsedSeconds, MAX_CATCHUP_SECONDS)

    const merged: TickEvents = noTickEvents()

    while (this.accumulator >= TICK_SECONDS) {
      const events = this.tick(TICK_SECONDS)
      this.accumulator -= TICK_SECONDS

      merged.contactKilled += events.contactKilled
      merged.salvageDropped += events.salvageDropped
      merged.sunHits += events.sunHits
      merged.contactHits += events.contactHits
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

  get alpha(): number {
    return this.accumulator / TICK_SECONDS
  }

  tick(dt: number): TickEvents {
    const sim = this.state
    const events: TickEvents = noTickEvents()

    if (sim.phase === 'cleared' || sim.phase === 'overwhelmed' || sim.phase === 'standby') {
      return events
    }

    if (sim.activeWave === null) this.directCurrentWave()

    this.tickCount++
    const previousWaveElapsed = sim.waveElapsed
    sim.elapsed += dt

    this.advanceRings(dt)

    this.advanceFlare(dt)
    sim.feed.update(dt)
    sim.tracers.update(dt)
    sim.particles.update(dt)
    updateBuffs(sim, dt)
    updateObjective(sim, dt)

    if (this.pendingSalvage > 0) {
      events.salvageDropped += this.pendingSalvage
      this.pendingSalvage = 0
    }

    if (sim.phase === 'wave-active') {
      sim.waveElapsed += dt

      const wave = sim.stage.waves[sim.waveIndex]
      if (wave && isBossWave(wave) && sim.bossSpawnedFor !== sim.waveIndex) {
        const def = bossById(wave.bossId)
        if (def) spawnBoss(sim, def, this.rng)

        sim.bossSpawnedFor = sim.waveIndex
      }

      updateSpawning(sim, this.rng, previousWaveElapsed)
    }

    updateWards(sim)
    updateBoss(sim, dt)
    updateContactMotion(sim, dt)
    this.emitPatterns(dt)

    const attacks = updatePlatforms(sim, dt)
    const shots = updateArrays(sim, dt)
    this.spawnArrayProjectiles(shots)

    const collisions = updateProjectiles(sim, this.projectiles, dt)
    events.sunHits += collisions.sunHits
    events.contactHits += collisions.contactHits
    events.contactKilled += collisions.contactKilled
    events.salvageDropped += collisions.salvageDropped

    const melee = resolvePlatformAttacks(sim, attacks)
    events.contactKilled += melee.contactKilled
    events.salvageDropped += melee.salvageDropped

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

    if (sim.contact.length > this.peakContact) this.peakContact = sim.contact.length
    if (sim.contact.length > BUDGETS.contact) this.ticksOverContactBudget++

    return events
  }

  private advanceRings(dt: number): void {
    const rings = this.state.rings
    for (let i = 0; i < rings.length; i++) {
      rings[i].phase += rings[i].angularVelocity * dt
    }
  }

  private recordTelemetry(dt: number, events: TickEvents): void {
    const telemetry = this.state.telemetry
    if (!telemetry) return

    const sim = this.state
    telemetry.elapsed += dt

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

    sim.particles.burst({
      x,
      y,
      angle: 0,
      count: FLARE_BURST.count,
      spread: FLARE_BURST.spread,
      speed: FLARE_BURST.speed * (radius / FLARE.radius),
      life: FLARE_BURST.life,
      size: FLARE_BURST.size,
      drag: FLARE_BURST.drag,
      colour: FLARE_COLOUR,
    })

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
        died ? (contact.def.assetKey ?? '') : '',
      )
      if (died) dead.add(contact.id)
    }

    if (dead.size > 0) {
      const reaped = reapContact(sim, dead)
      this.totalContactKilled += reaped.contactKilled
      this.pendingSalvage += reaped.salvageDropped
    }

    this.lastStrike = { x, y, age: 0 }
    return true
  }

  repairSun(): { repaired: boolean; cost: number } {
    const cost = repairCost(this.state.sun.repairsThisStage, this.state.effects.repairCost)
    return { repaired: repair(this.state.sun), cost }
  }

  shieldSun(amount: number, duration: number): void {
    grantShield(this.state.sun, amount, duration)
  }

  private advanceFlare(dt: number): void {
    const flare = this.state.flare
    if (flare.cooldown > 0) flare.cooldown = Math.max(0, flare.cooldown - dt)
    if (flare.charge < flare.maxCharge) {
      const interval = Math.max(
        1,
        FLARE.rechargeInterval * (1 - Math.min(0.75, this.state.effects.flareRecharge)),
      )
      flare.charge = Math.min(flare.maxCharge, flare.charge + dt / interval)
    }
    if (this.lastStrike) {
      this.lastStrike.age += dt
      if (this.lastStrike.age > 0.35) this.lastStrike = null
    }
  }

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

      const profile = shot.array.def.shot
      p.pierceRemaining = profile.kind === 'pierce' ? profile.targets - 1 : 0
      p.burstRadius = profile.kind === 'burst' ? profile.radius : 0
      p.hitCount = 0
    }
  }
}

export { RINGS }
