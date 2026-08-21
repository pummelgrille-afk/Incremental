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

/**
 * The rules that govern the defended objective and the stage around it.
 *
 * Separated from `Sun.ts` because these depend on the whole simulation —
 * what is still alive, which wave is running — rather than on the objective
 * alone. Separated from `loop.ts` because win and loss conditions are the thing
 * most likely to be argued about, and they should be readable and testable
 * without reading a tick function.
 *
 * PLAN.md Phase 12 asks for exactly this file.
 */

export interface ObjectiveEvents {
  /** Output thresholds crossed downward this tick, e.g. [0.5]. */
  thresholdsCrossed: number[]
  stageCleared: boolean
  stageLost: boolean
  /** True on the tick a wave is finished and the gap begins. */
  waveCleared: boolean
  /** True on the tick a new wave starts. */
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

/**
 * Regeneration, shield expiry and hit-flash decay.
 *
 * Regeneration is confined to `wave-gap` (see `REGEN_IN_COMBAT`): letting it run
 * during a wave would allow sustained pressure to be out-healed, eroding the
 * carry-over between waves that game-loop.md depends on.
 */
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

/**
 * Detect Output thresholds crossed downward, and reset the baseline.
 *
 * **Must run late in the tick**, after damage has been applied — damage lands at
 * steps 6-8 while recovery runs at step 2 (combat-spec.md section 8), so a check
 * folded into `updateObjective` would compare a value to itself and never fire.
 * That was a real bug, caught by test.
 *
 * Only downward crossings fire. Regenerating back through a threshold is not an
 * event, or a Sun hovering at 50% would spam them.
 */
export function checkThresholds(sim: SimulationState): number[] {
  const m = sim.sun
  const now = outputFraction(m)
  const before = m.previousFraction
  m.previousFraction = now

  if (now >= before) return []
  return OUTPUT_THRESHOLDS.filter((t) => before > t && now <= t)
}

/** Has the current wave finished spawning and been fully destroyed? */
export function isWaveComplete(sim: SimulationState): boolean {
  const wave = sim.stage.waves[sim.waveIndex]
  if (!wave) return false
  if (sim.contact.length > 0) return false
  return sim.waveElapsed >= waveSpawnDuration(sim, sim.waveIndex)
}

/** Is this the last wave of the stage? */
export function isFinalWave(sim: SimulationState): boolean {
  return sim.waveIndex >= sim.stage.waves.length - 1
}

/**
 * Advance stage state: loss, wave completion, gap countdown, stage clear.
 *
 * Ordered so that loss is checked first. A Sun that hits zero on the same
 * tick the last Contact dies is a **loss**, not a clear — the machine stopped, and
 * clearing a stage you did not survive would be incoherent.
 */
/**
 * Reroll the arc bearing for a new wave.
 *
 * Taken from the run's seeded generator, so a stage still plays identically
 * from the same seed while no longer being memorisable by bearing.
 */
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
    /*
     * Drop the encounter with the stage. `Simulation.tick` returns early once a
     * stage resolves, so `updateBoss` never runs again to clear this itself —
     * the runtime would sit pointing at an entity that no longer exists for as
     * long as the state is kept. Stale cached state that nothing invalidates is
     * the failure this codebase keeps rediscovering.
     */
    sim.boss = null
    events.stageCleared = true
    events.waveCleared = true
    return events
  }

  sim.phase = 'wave-gap'
  sim.gapRemaining = wave.gapAfter
  events.waveCleared = true

  // Boss waves reset their counter so a retry starts the encounter clean
  // rather than mid-phase (game-loop.md, "Per boss stage").
  if (isBossWave(wave)) sim.waveElapsed = 0

  return events
}

/**
 * Was this stage cleared without losing any Output?
 *
 * Backs the "Within Tolerance" achievement (narrative.md) and is a useful
 * telemetry signal in Phase 20 — a stage that is routinely cleared untouched is
 * under-tuned.
 */
export function clearedUntouched(sim: SimulationState): boolean {
  return sim.phase === 'cleared' && sim.sun.lowestFraction >= 1
}
