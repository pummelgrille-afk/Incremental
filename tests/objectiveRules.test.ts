import { beforeEach, describe, expect, it } from 'vitest'
import {createMainspring,
  grantShield,
  isOverwhelmed,
  REPAIR_FRACTION,
  repair,
  tensionFraction,
  TENSION_THRESHOLDS} from '../src/lib/entities/Mainspring'
import { repairCost } from '../src/lib/progression/currencies'
import {
  checkThresholds,
  clearedUntouched,
  isFinalWave,
  isWaveComplete,
  updateObjective,
  updateStageProgress,
} from '../src/lib/systems/objectiveRules'
import { damageMainspring } from '../src/lib/systems/combat'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { createSlack } from '../src/lib/systems/spawn'
import { slackById } from '../src/lib/content/enemies'
import type { StageAddress } from '../src/lib/entities/Zone'
import type { SimulationState } from '../src/lib/core/simulation'

const STAGE: StageAddress = 'escapement-floor:first-shift'

let sim: Simulation
let state: SimulationState

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  state = sim.state
})

describe('the Mainspring', () => {
  it('starts at full Tension', () => {
    const m = createMainspring(1000)
    expect(m.tension).toBe(1000)
    expect(m.maxTension).toBe(1000)
    expect(tensionFraction(m)).toBe(1)
    expect(isOverwhelmed(m)).toBe(false)
  })

  it('keeps Tension aliased to hp', () => {
    const m = createMainspring(1000)
    m.hp -= 250
    expect(m.tension).toBe(750)
  })

  it('is overwhelmed only at zero, not merely low', () => {
    const m = createMainspring(1000)
    m.hp = 1
    expect(isOverwhelmed(m)).toBe(false)
    m.hp = 0
    expect(isOverwhelmed(m)).toBe(true)
  })

  it('never drops below zero', () => {
    damageMainspring(state, 99_999)
    expect(state.mainspring.hp).toBe(0)
  })
})

describe('shields', () => {
  it('absorbs damage before Tension', () => {
    grantShield(state.mainspring, 100, 5)
    damageMainspring(state, 60)
    expect(state.mainspring.shield).toBe(40)
    expect(state.mainspring.hp).toBe(state.mainspring.maxHp)
  })

  it('spills over into Tension once exhausted', () => {
    grantShield(state.mainspring, 50, 5)
    const full = state.mainspring.maxHp
    damageMainspring(state, 80)
    expect(state.mainspring.shield).toBe(0)
    expect(state.mainspring.hp).toBe(full - 30)
  })

  it('lapses when its duration expires', () => {
    grantShield(state.mainspring, 100, 1)
    for (let i = 0; i < 25; i++) updateObjective(state, TICK_SECONDS)
    expect(state.mainspring.shield).toBe(0)
    expect(state.mainspring.shieldRemaining).toBe(0)
  })

  it('replaces rather than stacks, so conjunctions cannot be banked', () => {
    // Stacking would let a player accumulate an invulnerability window.
    grantShield(state.mainspring, 50, 5)
    grantShield(state.mainspring, 80, 5)
    expect(state.mainspring.shield).toBe(80)

    grantShield(state.mainspring, 20, 5)
    expect(state.mainspring.shield).toBe(80)
  })

  it('lets a weaker grant extend an existing shield instead of weakening it', () => {
    grantShield(state.mainspring, 80, 2)
    grantShield(state.mainspring, 20, 9)
    expect(state.mainspring.shield).toBe(80)
    expect(state.mainspring.shieldRemaining).toBe(9)
  })
})

describe('regeneration', () => {
  it('does not regenerate during a live wave', () => {
    // Continuous regen would let sustained pressure be out-healed, eroding the
    // wave-to-wave carry-over game-loop.md depends on.
    state.mainspring.regenPerSecond = 50
    state.mainspring.hp = 500
    state.phase = 'wave-active'

    for (let i = 0; i < 40; i++) updateObjective(state, TICK_SECONDS)
    expect(state.mainspring.hp).toBe(500)
  })

  it('regenerates in the gap between waves', () => {
    state.mainspring.regenPerSecond = 50
    state.mainspring.hp = 500
    state.phase = 'wave-gap'

    for (let i = 0; i < 20; i++) updateObjective(state, TICK_SECONDS)
    expect(state.mainspring.hp).toBeCloseTo(550, 4)
  })

  it('never regenerates past maximum', () => {
    state.mainspring.regenPerSecond = 500
    state.mainspring.hp = state.mainspring.maxHp - 10
    state.phase = 'wave-gap'
    for (let i = 0; i < 40; i++) updateObjective(state, TICK_SECONDS)
    expect(state.mainspring.hp).toBe(state.mainspring.maxHp)
  })

  it('never revives a Mainspring that already hit zero', () => {
    state.mainspring.regenPerSecond = 100
    state.mainspring.hp = 0
    state.phase = 'wave-gap'
    for (let i = 0; i < 40; i++) updateObjective(state, TICK_SECONDS)
    expect(state.mainspring.hp).toBe(0)
  })
})

describe('tension thresholds', () => {
  it('fires when crossed downward', () => {
    state.phase = 'wave-active'
    state.mainspring.hp = state.mainspring.maxHp * 0.55
    checkThresholds(state) // establish the baseline

    damageMainspring(state, state.mainspring.maxHp * 0.1)
    expect(checkThresholds(state)).toContain(0.5)
  })

  it('does not fire again while hovering below a threshold', () => {
    state.phase = 'wave-active'
    state.mainspring.hp = state.mainspring.maxHp * 0.4
    checkThresholds(state)

    damageMainspring(state, 1)
    checkThresholds(state)
    damageMainspring(state, 1)

    expect(checkThresholds(state)).not.toContain(0.5)
  })

  it('does not fire on the way back up', () => {
    // A Mainspring hovering at 50% would otherwise spam events.
    state.phase = 'wave-gap'
    state.mainspring.hp = state.mainspring.maxHp * 0.45
    checkThresholds(state)

    state.mainspring.regenPerSecond = 200
    updateObjective(state, TICK_SECONDS)

    expect(checkThresholds(state)).toEqual([])
  })

  it('can cross several thresholds in one hit', () => {
    state.phase = 'wave-active'
    checkThresholds(state)

    damageMainspring(state, state.mainspring.maxHp * 0.95)
    const crossed = checkThresholds(state)

    expect(crossed.length).toBeGreaterThan(1)
    expect(crossed).toEqual([...TENSION_THRESHOLDS])
  })

  it('records the lowest fraction reached at the moment of damage', () => {
    damageMainspring(state, state.mainspring.maxHp * 0.7)
    expect(state.mainspring.lowestFraction).toBeCloseTo(0.3, 4)

    // Recovering must not raise the recorded low-water mark.
    state.phase = 'wave-gap'
    state.mainspring.regenPerSecond = 500
    for (let i = 0; i < 40; i++) updateObjective(state, TICK_SECONDS)
    expect(state.mainspring.lowestFraction).toBeCloseTo(0.3, 4)
  })
})

describe('emergency repair', () => {
  it('restores a fixed fraction of maximum Tension', () => {
    state.mainspring.hp = 100
    repair(state.mainspring)
    expect(state.mainspring.hp).toBeCloseTo(100 + state.mainspring.maxHp * REPAIR_FRACTION, 4)
  })

  it('refuses at full Tension, so nobody is charged for nothing', () => {
    expect(repair(state.mainspring)).toBe(false)
    expect(state.mainspring.repairsThisStage).toBe(0)
  })

  it('escalates hard, keeping it a panic button not a strategy', () => {
    // economy-spec.md invariant 6.
    const first = repairCost(state.mainspring.repairsThisStage)
    state.mainspring.repairsThisStage = 3
    const fourth = repairCost(state.mainspring.repairsThisStage)
    expect(fourth).toBeGreaterThan(first * 3)
  })

  it('is exposed as a hook that reports its cost', () => {
    state.mainspring.hp = 100
    const result = sim.repairMainspring()
    expect(result.repaired).toBe(true)
    expect(result.cost).toBeGreaterThan(0)
  })
})

describe('stage progression', () => {
  function fillWave(count: number) {
    const def = slackById('burr')!
    for (let i = 0; i < count; i++) {
      state.slack.push(createSlack(state, def, { x: 300, y: 0 }))
    }
  }

  it('treats a wave as complete only once spawning finished and nothing is left', () => {
    // Wave 0 spawns over ~4s, so at t=0 it has not finished spawning.
    expect(isWaveComplete(state)).toBe(false)

    state.waveElapsed = 999
    expect(isWaveComplete(state)).toBe(true)

    fillWave(3)
    expect(isWaveComplete(state)).toBe(false)
  })

  it('knows the final wave', () => {
    expect(isFinalWave(state)).toBe(false)
    state.waveIndex = state.stage.waves.length - 1
    expect(isFinalWave(state)).toBe(true)
  })

  it('opens a gap between waves rather than chaining them', () => {
    state.waveElapsed = 999
    const events = updateStageProgress(state, TICK_SECONDS)
    expect(events.waveCleared).toBe(true)
    expect(state.phase).toBe('wave-gap')
    expect(state.gapRemaining).toBeGreaterThan(0)
  })

  it('starts the next wave when the gap elapses', () => {
    state.phase = 'wave-gap'
    state.gapRemaining = 0.1
    const before = state.waveIndex

    updateStageProgress(state, 0.2)
    expect(state.waveIndex).toBe(before + 1)
    expect(state.phase).toBe('wave-active')
  })

  it('clears the stage after the final wave', () => {
    state.waveIndex = state.stage.waves.length - 1
    state.waveElapsed = 999
    const events = updateStageProgress(state, TICK_SECONDS)
    expect(events.stageCleared).toBe(true)
    expect(state.phase).toBe('cleared')
  })

  it('counts a simultaneous zero-Tension and last-kill as a LOSS', () => {
    // Clearing a stage you did not survive would be incoherent, so loss is
    // checked first.
    state.waveIndex = state.stage.waves.length - 1
    state.waveElapsed = 999
    state.mainspring.hp = 0

    const events = updateStageProgress(state, TICK_SECONDS)
    expect(events.stageLost).toBe(true)
    expect(events.stageCleared).toBe(false)
    expect(state.phase).toBe('overwhelmed')
  })
})

describe('cleared untouched', () => {
  it('is true only when no Tension was ever lost', () => {
    state.phase = 'cleared'
    expect(clearedUntouched(state)).toBe(true)

    state.mainspring.lowestFraction = 0.9
    expect(clearedUntouched(state)).toBe(false)
  })

  it('is false for a stage that was not cleared', () => {
    state.phase = 'overwhelmed'
    expect(clearedUntouched(state)).toBe(false)
  })
})

describe('tick integration', () => {
  it('surfaces wave and threshold events through TickEvents', () => {
    const events = sim.tick(TICK_SECONDS)
    expect(events).toHaveProperty('waveCleared')
    expect(events).toHaveProperty('waveStarted')
    expect(Array.isArray(events.thresholdsCrossed)).toBe(true)
  })

  it('does not accumulate threshold events across ticks', () => {
    // A shared array would leak events from one tick into the next.
    sim.state.phase = 'wave-active'
    damageMainspring(sim.state, sim.state.mainspring.maxHp * 0.6)
    const first = sim.tick(TICK_SECONDS)
    expect(first.thresholdsCrossed.length).toBeGreaterThan(0)

    const second = sim.tick(TICK_SECONDS)
    expect(second.thresholdsCrossed).toEqual([])
  })
})
