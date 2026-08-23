import { beforeEach, describe, expect, it } from 'vitest'
import {createSun,
  grantShield,
  isOverwhelmed,
  REPAIR_FRACTION,
  repair,
  outputFraction,
  OUTPUT_THRESHOLDS} from '../src/lib/entities/Sun'
import { repairCost } from '../src/lib/progression/currencies'
import {
  checkThresholds,
  clearedUntouched,
  isFinalWave,
  isWaveComplete,
  updateObjective,
  updateStageProgress,
} from '../src/lib/systems/objectiveRules'
import { damageSun } from '../src/lib/systems/combat'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { createContact } from '../src/lib/systems/spawn'
import { contactById } from '../src/lib/content/contacts'
import type { StageAddress } from '../src/lib/entities/Zone'
import type { SimulationState } from '../src/lib/core/simulation'

const STAGE: StageAddress = 'service-floor:first-shift'

let sim: Simulation
let state: SimulationState

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  state = sim.state
})

describe('the Sun', () => {
  it('starts at full Output', () => {
    const m = createSun(1000)
    expect(m.output).toBe(1000)
    expect(m.maxOutput).toBe(1000)
    expect(outputFraction(m)).toBe(1)
    expect(isOverwhelmed(m)).toBe(false)
  })

  it('keeps Output aliased to hp', () => {
    const m = createSun(1000)
    m.hp -= 250
    expect(m.output).toBe(750)
  })

  it('is overwhelmed only at zero, not merely low', () => {
    const m = createSun(1000)
    m.hp = 1
    expect(isOverwhelmed(m)).toBe(false)
    m.hp = 0
    expect(isOverwhelmed(m)).toBe(true)
  })

  it('never drops below zero', () => {
    damageSun(state, 99_999)
    expect(state.sun.hp).toBe(0)
  })
})

describe('shields', () => {
  it('absorbs damage before Output', () => {
    grantShield(state.sun, 100, 5)
    damageSun(state, 60)
    expect(state.sun.shield).toBe(40)
    expect(state.sun.hp).toBe(state.sun.maxHp)
  })

  it('spills over into Output once exhausted', () => {
    grantShield(state.sun, 50, 5)
    const full = state.sun.maxHp
    damageSun(state, 80)
    expect(state.sun.shield).toBe(0)
    expect(state.sun.hp).toBe(full - 30)
  })

  it('lapses when its duration expires', () => {
    grantShield(state.sun, 100, 1)
    for (let i = 0; i < 25; i++) updateObjective(state, TICK_SECONDS)
    expect(state.sun.shield).toBe(0)
    expect(state.sun.shieldRemaining).toBe(0)
  })

  it('replaces rather than stacks, so conjunctions cannot be banked', () => {
    grantShield(state.sun, 50, 5)
    grantShield(state.sun, 80, 5)
    expect(state.sun.shield).toBe(80)

    grantShield(state.sun, 20, 5)
    expect(state.sun.shield).toBe(80)
  })

  it('lets a weaker grant extend an existing shield instead of weakening it', () => {
    grantShield(state.sun, 80, 2)
    grantShield(state.sun, 20, 9)
    expect(state.sun.shield).toBe(80)
    expect(state.sun.shieldRemaining).toBe(9)
  })
})

describe('regeneration', () => {
  it('does not regenerate during a live wave', () => {
    state.sun.regenPerSecond = 50
    state.sun.hp = 500
    state.phase = 'wave-active'

    for (let i = 0; i < 40; i++) updateObjective(state, TICK_SECONDS)
    expect(state.sun.hp).toBe(500)
  })

  it('regenerates in the gap between waves', () => {
    state.sun.regenPerSecond = 50
    state.sun.hp = 500
    state.phase = 'wave-gap'

    for (let i = 0; i < 20; i++) updateObjective(state, TICK_SECONDS)
    expect(state.sun.hp).toBeCloseTo(550, 4)
  })

  it('never regenerates past maximum', () => {
    state.sun.regenPerSecond = 500
    state.sun.hp = state.sun.maxHp - 10
    state.phase = 'wave-gap'
    for (let i = 0; i < 40; i++) updateObjective(state, TICK_SECONDS)
    expect(state.sun.hp).toBe(state.sun.maxHp)
  })

  it('never revives a Sun that already hit zero', () => {
    state.sun.regenPerSecond = 100
    state.sun.hp = 0
    state.phase = 'wave-gap'
    for (let i = 0; i < 40; i++) updateObjective(state, TICK_SECONDS)
    expect(state.sun.hp).toBe(0)
  })
})

describe('output thresholds', () => {
  it('fires when crossed downward', () => {
    state.phase = 'wave-active'
    state.sun.hp = state.sun.maxHp * 0.55
    checkThresholds(state)

    damageSun(state, state.sun.maxHp * 0.1)
    expect(checkThresholds(state)).toContain(0.5)
  })

  it('does not fire again while hovering below a threshold', () => {
    state.phase = 'wave-active'
    state.sun.hp = state.sun.maxHp * 0.4
    checkThresholds(state)

    damageSun(state, 1)
    checkThresholds(state)
    damageSun(state, 1)

    expect(checkThresholds(state)).not.toContain(0.5)
  })

  it('does not fire on the way back up', () => {
    state.phase = 'wave-gap'
    state.sun.hp = state.sun.maxHp * 0.45
    checkThresholds(state)

    state.sun.regenPerSecond = 200
    updateObjective(state, TICK_SECONDS)

    expect(checkThresholds(state)).toEqual([])
  })

  it('can cross several thresholds in one hit', () => {
    state.phase = 'wave-active'
    checkThresholds(state)

    damageSun(state, state.sun.maxHp * 0.95)
    const crossed = checkThresholds(state)

    expect(crossed.length).toBeGreaterThan(1)
    expect(crossed).toEqual([...OUTPUT_THRESHOLDS])
  })

  it('records the lowest fraction reached at the moment of damage', () => {
    damageSun(state, state.sun.maxHp * 0.7)
    expect(state.sun.lowestFraction).toBeCloseTo(0.3, 4)

    state.phase = 'wave-gap'
    state.sun.regenPerSecond = 500
    for (let i = 0; i < 40; i++) updateObjective(state, TICK_SECONDS)
    expect(state.sun.lowestFraction).toBeCloseTo(0.3, 4)
  })
})

describe('emergency repair', () => {
  it('restores a fixed fraction of maximum Output', () => {
    state.sun.hp = 100
    repair(state.sun)
    expect(state.sun.hp).toBeCloseTo(100 + state.sun.maxHp * REPAIR_FRACTION, 4)
  })

  it('refuses at full Output, so nobody is charged for nothing', () => {
    expect(repair(state.sun)).toBe(false)
    expect(state.sun.repairsThisStage).toBe(0)
  })

  it('escalates hard, keeping it a panic button not a strategy', () => {
    const first = repairCost(state.sun.repairsThisStage)
    state.sun.repairsThisStage = 3
    const fourth = repairCost(state.sun.repairsThisStage)
    expect(fourth).toBeGreaterThan(first * 3)
  })

  it('is exposed as a hook that reports its cost', () => {
    state.sun.hp = 100
    const result = sim.repairSun()
    expect(result.repaired).toBe(true)
    expect(result.cost).toBeGreaterThan(0)
  })
})

describe('stage progression', () => {
  function fillWave(count: number) {
    const def = contactById('skiff')!
    for (let i = 0; i < count; i++) {
      state.contact.push(createContact(state, def, { x: 300, y: 0 }))
    }
  }

  it('treats a wave as complete only once spawning finished and nothing is left', () => {
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

  it('counts a simultaneous zero-Output and last-kill as a LOSS', () => {
    state.waveIndex = state.stage.waves.length - 1
    state.waveElapsed = 999
    state.sun.hp = 0

    const events = updateStageProgress(state, TICK_SECONDS)
    expect(events.stageLost).toBe(true)
    expect(events.stageCleared).toBe(false)
    expect(state.phase).toBe('overwhelmed')
  })
})

describe('cleared untouched', () => {
  it('is true only when no Output was ever lost', () => {
    state.phase = 'cleared'
    expect(clearedUntouched(state)).toBe(true)

    state.sun.lowestFraction = 0.9
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
    sim.state.phase = 'wave-active'
    damageSun(sim.state, sim.state.sun.maxHp * 0.6)
    const first = sim.tick(TICK_SECONDS)
    expect(first.thresholdsCrossed.length).toBeGreaterThan(0)

    const second = sim.tick(TICK_SECONDS)
    expect(second.thresholdsCrossed).toEqual([])
  })
})
