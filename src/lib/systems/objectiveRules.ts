import {
  isOverwhelmed,
  REGEN_IN_COMBAT,
  outputFraction,
  OUTPUT_THRESHOLDS,
  type SunState,
} from '../entities/Sun'
import { isBossWave } from '../entities/Wave'
import type { SimulationState } from '../core/simulation'
import type { Rng } from '../core/rng'
import { waveSpawnDuration } from './spawn'

export interface ObjectiveEvents {
  thresholdsCrossed: number[]
  stageCleared: boolean
  stageLost: boolean

  waveCleared: boolean

  waveStarted: boolean
}

export function noEvents(): ObjectiveEvents {
  return {
    thresholdsCrossed: [],
    stageCleared: false,
    stageLost: false,
    waveCleared: false,
    waveStarted: false,
  }
}

export function updateObjective(sim: SimulationState, dt: number): void {
  const m = sim.sun

  if (m.shieldRemaining > 0) {
    m.shieldRemaining -= dt
    if (m.shieldRemaining <= 0) {
      m.shieldRemaining = 0
      m.shield = 0
    }
  }

  if (m.hitFlash > 0) m.hitFlash = Math.max(0, m.hitFlash - dt)

  const recovering = REGEN_IN_COMBAT || sim.phase === 'wave-gap'
  if (recovering && m.regenPerSecond > 0 && m.hp > 0 && m.hp < m.maxHp) {
    m.hp = Math.min(m.maxHp, m.hp + m.regenPerSecond * dt)
  }
}

export function checkThresholds(sim: SimulationState): number[] {
  const m = sim.sun
  const now = outputFraction(m)
  const before = m.previousFraction
  m.previousFraction = now

  if (now >= before) return []
  return OUTPUT_THRESHOLDS.filter((t) => before > t && now <= t)
}

export function isWaveComplete(sim: SimulationState): boolean {
  const wave = sim.stage.waves[sim.waveIndex]
  if (!wave) return false
  if (sim.contact.length > 0) return false
  return sim.waveElapsed >= waveSpawnDuration(sim, sim.waveIndex)
}

export function isFinalWave(sim: SimulationState): boolean {
  return sim.waveIndex >= sim.stage.waves.length - 1
}

export function rerollWaveArc(sim: SimulationState, rng: Rng): void {
  sim.waveArcOffset = rng.angle()
}

export function updateStageProgress(sim: SimulationState, dt: number): ObjectiveEvents {
  const events = noEvents()

  if (isOverwhelmed(sim.sun)) {
    sim.phase = 'overwhelmed'
    sim.boss = null
    events.stageLost = true
    return events
  }

  if (sim.phase === 'wave-gap') {
    sim.gapRemaining -= dt
    if (sim.gapRemaining <= 0) {
      sim.waveIndex++
      sim.waveElapsed = 0
      sim.phase = 'wave-active'
      events.waveStarted = true
    }
    return events
  }

  if (sim.phase !== 'wave-active') return events

  const wave = sim.stage.waves[sim.waveIndex]
  if (!wave || !isWaveComplete(sim)) return events

  if (isFinalWave(sim)) {
    sim.phase = 'cleared'

    sim.boss = null
    events.stageCleared = true
    events.waveCleared = true
    return events
  }

  sim.phase = 'wave-gap'
  sim.gapRemaining = wave.gapAfter
  events.waveCleared = true

  if (isBossWave(wave)) sim.waveElapsed = 0

  return events
}

export function clearedUntouched(sim: SimulationState): boolean {
  return sim.phase === 'cleared' && sim.sun.lowestFraction >= 1
}
