import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage, validateStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { mountArray, placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { arrayById } from '../src/lib/content/arrays'
import { ZONES } from '../src/lib/content/zones'
import { OVER_LEVEL, SCALING } from '../src/lib/content/scaling'
import { BUDGETS } from '../src/lib/content/budgets'
import {
  bossDamage,
  bossHp,
  directWave,
  formationPower,
  isBossStage,
  overLevelBonus,
  pressure,
  scaleDamage,
  scaledCount,
  scaleHp,
  stagesToNextBoss,
  waveHpRate,
} from '../src/lib/systems/scaling'
import { waveTotal } from '../src/lib/systems/spawn'
import { isBossWave, type WaveDef } from '../src/lib/entities/Wave'
import type { SimulationState } from '../src/lib/core/simulation'
import type { StageAddress } from '../src/lib/entities/Zone'

const FIRST: StageAddress = 'service-floor:first-shift'
const LAST: StageAddress = 'service-floor:noted-in-the-log'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(FIRST), createRng(1))
})

function referenceFormation(state: SimulationState, level = 1) {
  placePlatform(state, platformById('anchor')!, 1, 0, level)
  placePlatform(state, platformById('anchor')!, 1, 3, level)
  placePlatform(state, platformById('bolt')!, 2, 0, level)
  placePlatform(state, platformById('bolt')!, 2, 5, level)
  placePlatform(state, platformById('rake')!, 3, 0, level)
  placePlatform(state, platformById('rake')!, 3, 7, level)
  mountArray(state, arrayById('long-baseline')!, 0, level)
  mountArray(state, arrayById('long-baseline')!, 4, level)
}

const simpleWave: WaveDef = {
  groups: [{ defId: 'skiff', count: 10, delay: 0, interval: 0.5 }],
  gapAfter: 4,
}

describe('the authored curve', () => {
  it('grows HP faster than damage, so stalls precede walls', () => {
    expect(SCALING.enemyHpGrowth).toBeGreaterThan(SCALING.enemyDamageGrowth)

    const hp = scaleHp(100, 10, 1) / 100
    const damage = scaleDamage(100, 10, 1) / 100
    expect(hp).toBeGreaterThan(damage)
  })

  it('adds one enemy every N stages', () => {
    const n = SCALING.enemyCountStageDivisor
    expect(scaledCount(10, 0)).toBe(10)
    expect(scaledCount(10, n - 1)).toBe(10)
    expect(scaledCount(10, n)).toBe(11)
    expect(scaledCount(10, n * 4)).toBe(14)
  })

  it('applies the zone multiplier on top of the stage curve', () => {
    expect(scaleHp(100, 3, 2)).toBeCloseTo(scaleHp(100, 3, 1) * 2, 10)
  })
})

describe('boss milestones', () => {
  it('falls on the authored interval', () => {
    expect(isBossStage(SCALING.bossInterval)).toBe(true)
    expect(isBossStage(SCALING.bossInterval * 3)).toBe(true)
    expect(isBossStage(SCALING.bossInterval - 1)).toBe(false)
  })

  it('does not call the very first stage a boss', () => {
    expect(isBossStage(0)).toBe(false)
  })

  it('counts down to the next one', () => {
    expect(stagesToNextBoss(SCALING.bossInterval)).toBe(0)
    expect(stagesToNextBoss(SCALING.bossInterval - 1)).toBe(1)
    expect(stagesToNextBoss(1)).toBe(SCALING.bossInterval - 1)
  })

  it('multiplies boss stats over the stage curve, not instead of it', () => {
    expect(bossHp(100, 4, 1)).toBeCloseTo(scaleHp(100, 4, 1) * SCALING.bossHpMultiplier, 6)
    expect(bossDamage(100, 4, 1)).toBeCloseTo(
      scaleDamage(100, 4, 1) * SCALING.bossDamageMultiplier,
      6,
    )
  })

  it('gives a boss far more HP than damage', () => {
    expect(SCALING.bossHpMultiplier).toBeGreaterThan(SCALING.bossDamageMultiplier * 4)
  })

  it('fails validation for a stage on the interval with no boss wave', () => {
    const problems = validateStage({
      id: 'milestone',
      name: 'Milestone',
      scalingIndex: SCALING.bossInterval,
      baseOutput: 1000,
      clearanceReward: 1,
      waves: [simpleWave],
    })
    expect(problems.join(' ')).toContain('boss wave')
  })

  it('passes a boss-interval stage that has one', () => {
    const problems = validateStage({
      id: 'milestone',
      name: 'Milestone',
      scalingIndex: SCALING.bossInterval,
      baseOutput: 1000,
      clearanceReward: 1,
      waves: [{ bossId: 'the-backlog', gapAfter: 4 }],
    })
    expect(problems).toEqual([])
  })
})

describe('formation power', () => {
  it('is zero for an empty field', () => {
    expect(formationPower(sim.state)).toBe(0)
  })

  it('rises with each unit added', () => {
    const before = formationPower(sim.state)
    placePlatform(sim.state, platformById('bolt')!, 2, 0)
    expect(formationPower(sim.state)).toBeGreaterThan(before)
  })

  it('rises with level', () => {
    const a = new Simulation(loadStage(FIRST), createRng(1))
    const b = new Simulation(loadStage(FIRST), createRng(1))
    placePlatform(a.state, platformById('bolt')!, 2, 0, 1)
    placePlatform(b.state, platformById('bolt')!, 2, 0, 5)
    expect(formationPower(b.state)).toBeGreaterThan(formationPower(a.state))
  })

  it('ignores a disabled unit, which is not fighting', () => {
    const unit = placePlatform(sim.state, platformById('bolt')!, 2, 0)
    const before = formationPower(sim.state)
    unit.disabledFor = 5
    expect(formationPower(sim.state)).toBeLessThan(before)
  })

  it('rates a Array by its Charge, not its fire rate', () => {
    const array = mountArray(sim.state, arrayById('long-baseline')!, 0)
    const burst = array.def.attack / array.def.baseInterval
    expect(formationPower(sim.state)).toBeLessThan(burst)
    expect(formationPower(sim.state)).toBeCloseTo(
      array.def.attack / array.def.chargeInterval,
      6,
    )
  })

  it('does not count the Flare', () => {
    placePlatform(sim.state, platformById('bolt')!, 2, 0)
    const before = formationPower(sim.state)
    sim.strike(200, 0)
    expect(formationPower(sim.state)).toBe(before)
  })
})

describe('over-level pressure is one-sided', () => {
  it('does nothing to an under-levelled formation', () => {
    placePlatform(sim.state, platformById('anchor')!, 1, 0)
    expect(pressure(sim.state, simpleWave)).toBeLessThan(OVER_LEVEL.threshold)
    expect(overLevelBonus(sim.state, simpleWave)).toBe(0)
  })

  it('never returns a negative bonus, however weak the formation', () => {
    expect(overLevelBonus(sim.state, simpleWave)).toBe(0)
  })

  it('leaves the reference formation untouched on every authored stage', () => {
    for (const zone of ZONES) {
      for (const stage of zone.stages) {
        const state = loadStage(`${zone.id}:${stage.id}` as StageAddress)
        referenceFormation(state)
        for (const wave of stage.waves) {
          if (isBossWave(wave)) continue
          expect(overLevelBonus(state, wave), `${zone.id}:${stage.id}`).toBe(0)
        }
      }
    }
  })

  it('adds pressure to a formation far above the curve', () => {
    const state = loadStage(FIRST)
    referenceFormation(state, 12)
    const wave = state.stage.waves[0] as WaveDef

    expect(pressure(state, wave)).toBeGreaterThan(OVER_LEVEL.threshold)
    expect(overLevelBonus(state, wave)).toBeGreaterThan(0)
  })

  it('caps the bonus rather than scaling without limit', () => {
    const state = loadStage(FIRST)
    referenceFormation(state, 40)
    const wave = state.stage.waves[0] as WaveDef

    expect(pressure(state, wave)).toBeGreaterThan(OVER_LEVEL.threshold * 3)
    expect(overLevelBonus(state, wave)).toBe(OVER_LEVEL.maxCountBonus)
  })
})

describe('directing a wave', () => {
  it('applies the stage count curve', () => {
    const state = loadStage(LAST)
    const wave = state.stage.waves[0] as WaveDef
    const directed = directWave(state, wave) as WaveDef

    directed.groups.forEach((group, i) => {
      expect(group.count).toBe(scaledCount(wave.groups[i].count, state.stage.scalingIndex))
    })
  })

  it('keeps a wave dense rather than long when it adds enemies', () => {
    const state = loadStage(FIRST)
    referenceFormation(state, 40)

    const wave = state.stage.waves[0] as WaveDef
    const directed = directWave(state, wave) as WaveDef
    const span = (w: WaveDef) =>
      Math.max(...w.groups.map((g) => g.delay + g.interval * Math.max(0, g.count - 1)))

    expect(directed.groups[0].count).toBeGreaterThan(wave.groups[0].count)
    expect(span(directed)).toBeCloseTo(span(wave), 6)
  })

  it('leaves a boss wave alone', () => {
    const state = loadStage(FIRST)
    const boss = { bossId: 'x', gapAfter: 4 }
    expect(directWave(state, boss)).toBe(boss)
  })

  it('never mutates the content it was given', () => {
    const state = loadStage(LAST)
    referenceFormation(state)
    const wave = state.stage.waves[0] as WaveDef
    const before = JSON.stringify(wave)

    directWave(state, wave)
    expect(JSON.stringify(wave)).toBe(before)
  })

  it('is what spawning and the wave total both read', () => {
    const s = new Simulation(loadStage(LAST), createRng(3))
    referenceFormation(s.state)
    s.tick(TICK_SECONDS)

    const directed = s.state.activeWave as WaveDef
    expect(directed).not.toBeNull()
    const total = directed.groups.reduce((n, g) => n + g.count, 0)
    expect(waveTotal(s.state, 0)).toBe(total)
  })

  it('keeps every authored stage inside the entity budget when directed', () => {
    for (const zone of ZONES) {
      for (const stage of zone.stages) {
        const state = loadStage(`${zone.id}:${stage.id}` as StageAddress)
        referenceFormation(state, 40)

        for (const wave of stage.waves) {
          if (isBossWave(wave)) continue
          const directed = directWave(state, wave) as WaveDef
          const total = directed.groups.reduce((n, g) => n + g.count, 0)
          expect(total, `${zone.id}:${stage.id}`).toBeLessThanOrEqual(BUDGETS.contact)
        }
      }
    }
  })
})

describe('a directed stage still finishes', () => {
  it('clears with the reference formation', () => {
    const s = new Simulation(loadStage(FIRST), createRng(5))
    referenceFormation(s.state)

    let cleared = false
    for (let i = 0; i < 4000 && !cleared; i++) cleared = s.tick(TICK_SECONDS).stageCleared
    expect(cleared).toBe(true)
  })

  it('clears even when the director has added enemies', () => {
    const s = new Simulation(loadStage(FIRST), createRng(5))
    referenceFormation(s.state, 40)
    expect(overLevelBonus(s.state, s.state.stage.waves[0])).toBe(OVER_LEVEL.maxCountBonus)

    let cleared = false
    for (let i = 0; i < 4000 && !cleared; i++) cleared = s.tick(TICK_SECONDS).stageCleared
    expect(cleared).toBe(true)
  })

  it('leaves content byte-identical after a full directed stage', () => {
    const snapshot = () =>
      JSON.stringify(
        ZONES.map((z) => z.stages.map((s) => s.waves.map((w) => (isBossWave(w) ? w.bossId : w.groups)))),
      )
    const before = snapshot()

    const s = new Simulation(loadStage(LAST), createRng(9))
    referenceFormation(s.state)
    for (let i = 0; i < 3000; i++) {
      const e = s.tick(TICK_SECONDS)
      if (e.stageCleared || e.stageLost) break
    }
    expect(snapshot()).toBe(before)
  })
})

describe('the wave yardstick', () => {
  it('rates tougher enemies as a higher HP rate', () => {
    const soft: WaveDef = { groups: [{ defId: 'skiff', count: 10, delay: 0, interval: 0.5 }], gapAfter: 4 }
    const tough: WaveDef = { groups: [{ defId: 'hulk', count: 10, delay: 0, interval: 0.5 }], gapAfter: 4 }
    expect(waveHpRate(sim.state, tough)).toBeGreaterThan(waveHpRate(sim.state, soft))
  })

  it('is a rate, so a longer wave of the same spacing is not a heavier one', () => {
    const short: WaveDef = { groups: [{ defId: 'skiff', count: 4, delay: 0, interval: 0.5 }], gapAfter: 4 }
    const long: WaveDef = { groups: [{ defId: 'skiff', count: 20, delay: 0, interval: 0.5 }], gapAfter: 4 }
    const ratio = waveHpRate(sim.state, long) / waveHpRate(sim.state, short)
    expect(ratio).toBeGreaterThan(0.5)
    expect(ratio).toBeLessThan(1.5)
  })

  it('rates a faster arrival as a higher HP rate', () => {
    const slow: WaveDef = { groups: [{ defId: 'skiff', count: 10, delay: 0, interval: 1 }], gapAfter: 4 }
    const fast: WaveDef = { groups: [{ defId: 'skiff', count: 10, delay: 0, interval: 0.2 }], gapAfter: 4 }
    expect(waveHpRate(sim.state, fast)).toBeGreaterThan(waveHpRate(sim.state, slow))
  })

  it('reports zero for a boss wave, which the count curve ignores', () => {
    expect(waveHpRate(sim.state, { bossId: 'x', gapAfter: 4 })).toBe(0)
    expect(pressure(sim.state, { bossId: 'x', gapAfter: 4 })).toBe(0)
  })

  it('rises across the authored stages', () => {
    const rates = ZONES[0].stages.map((stage) => {
      const state = loadStage(`${ZONES[0].id}:${stage.id}` as StageAddress)
      return waveHpRate(state, state.stage.waves[0])
    })
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1])
    }
  })
})
