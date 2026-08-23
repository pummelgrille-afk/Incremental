import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { createDefaultSave, type SaveData } from '../src/lib/core/saveSchema'
import { syncFieldToSave } from '../src/lib/core/fieldSync'
import { supportStats, buyTrack } from '../src/lib/progression/support'
import { levelUp, unlock } from '../src/lib/progression/roster'
import { arrayById } from '../src/lib/content/arrays'
import { platformById } from '../src/lib/content/platforms'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

let sim: Simulation
let save: SaveData

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  sim.state.platforms.length = 0
  sim.state.arrays.length = 0

  save = createDefaultSave()
  save.run.formation = {}
  save.run.mounts = {}
  save.meta.clearance = 500
})

function fieldSpotter() {
  unlock(save, 'array', 'spotter')
  save.run.mounts['0'] = 'spotter'
  syncFieldToSave(sim.state, save)
  return sim.state.arrays.find((a) => a.mount === 0)!
}

describe('an upgrade reaches a unit that is already fielded', () => {
  it('raises the charge capacity of a mounted Array', () => {
    const spotter = fieldSpotter()
    const before = spotter.maxCharge

    buyTrack(save, 'spotter', 'capacity')
    syncFieldToSave(sim.state, save)

    expect(spotter.maxCharge).toBeGreaterThan(before)
    expect(spotter.maxCharge).toBe(supportStats(save, arrayById('spotter')!).maxCharge)
  })

  it('shortens the recharge interval', () => {
    unlock(save, 'array', 'long-baseline')
    save.run.mounts['1'] = 'long-baseline'
    syncFieldToSave(sim.state, save)

    const array = sim.state.arrays.find((a) => a.mount === 1)!
    const before = array.chargeInterval

    buyTrack(save, 'long-baseline', 'recharge')
    syncFieldToSave(sim.state, save)

    expect(array.chargeInterval).toBeLessThan(before)
  })

  it('raises the attack multiplier', () => {
    const spotter = fieldSpotter()
    expect(spotter.attackScale).toBeCloseTo(1, 6)

    buyTrack(save, 'spotter', 'resonance')
    syncFieldToSave(sim.state, save)

    expect(spotter.attackScale).toBeGreaterThan(1)
  })

  it('is the same instance, not a replacement', () => {
    const spotter = fieldSpotter()
    const id = spotter.id

    buyTrack(save, 'spotter', 'capacity')
    syncFieldToSave(sim.state, save)

    expect(sim.state.arrays).toHaveLength(1)
    expect(sim.state.arrays[0].id).toBe(id)
    expect(sim.state.arrays[0]).toBe(spotter)
  })

  it('raises a fielded Platform when its level goes up', () => {
    unlock(save, 'platform', 'bolt')
    save.run.formation['2:0'] = 'bolt'
    syncFieldToSave(sim.state, save)

    const bolt = sim.state.platforms[0]
    const before = bolt.levelScale

    levelUp(save, 'platform', 'bolt')
    syncFieldToSave(sim.state, save)

    expect(sim.state.platforms[0]).toBe(bolt)
    expect(bolt.level).toBe(2)
    expect(bolt.levelScale).toBeGreaterThan(before)
    expect(bolt.maxHp).toBeCloseTo(platformById('bolt')!.maxHp * bolt.levelScale, 6)
  })
})

describe('what an upgrade does not do', () => {
  it('does not heal a damaged unit', () => {
    unlock(save, 'platform', 'bolt')
    save.run.formation['2:0'] = 'bolt'
    syncFieldToSave(sim.state, save)

    const bolt = sim.state.platforms[0]
    bolt.hp = 3

    levelUp(save, 'platform', 'bolt')
    syncFieldToSave(sim.state, save)

    expect(bolt.hp).toBe(3)
    expect(bolt.maxHp).toBeGreaterThan(3)
  })

  it('does not fill the capacity it just bought', () => {
    const spotter = fieldSpotter()
    spotter.charge = 0.5

    buyTrack(save, 'spotter', 'capacity')
    syncFieldToSave(sim.state, save)

    expect(spotter.charge).toBe(0.5)
  })

  it('leaves the cooldown, the target and a running disable alone', () => {
    const spotter = fieldSpotter()
    spotter.cooldownRemaining = 1.5
    spotter.targetId = 42
    spotter.timeSinceRetarget = 0.7
    spotter.disabledFor = 2

    buyTrack(save, 'spotter', 'capacity')
    syncFieldToSave(sim.state, save)

    expect(spotter.cooldownRemaining).toBe(1.5)
    expect(spotter.targetId).toBe(42)
    expect(spotter.timeSinceRetarget).toBe(0.7)
    expect(spotter.disabledFor).toBe(2)
  })

  it('clamps hp down when a maximum somehow falls', () => {
    unlock(save, 'platform', 'bolt')
    save.run.formation['2:0'] = 'bolt'
    levelUp(save, 'platform', 'bolt')
    syncFieldToSave(sim.state, save)

    const bolt = sim.state.platforms[0]
    bolt.hp = bolt.maxHp

    save.meta.platforms.bolt = 1
    syncFieldToSave(sim.state, save)

    expect(bolt.hp).toBeLessThanOrEqual(bolt.maxHp)
  })
})

describe('reconciliation still does what it did', () => {
  it('places what the save has and the field does not', () => {
    unlock(save, 'platform', 'bolt')
    save.run.formation['2:0'] = 'bolt'
    save.run.formation['2:1'] = 'bolt'

    syncFieldToSave(sim.state, save)

    expect(sim.state.platforms).toHaveLength(2)
  })

  it('removes what the field has and the save does not', () => {
    unlock(save, 'platform', 'bolt')
    save.run.formation['2:0'] = 'bolt'
    syncFieldToSave(sim.state, save)
    expect(sim.state.platforms).toHaveLength(1)

    delete save.run.formation['2:0']
    syncFieldToSave(sim.state, save)

    expect(sim.state.platforms).toHaveLength(0)
  })

  it('replaces a slot whose occupant changed', () => {
    unlock(save, 'platform', 'bolt')
    unlock(save, 'platform', 'anchor')
    save.run.formation['2:0'] = 'bolt'
    syncFieldToSave(sim.state, save)

    save.run.formation['2:0'] = 'anchor'
    syncFieldToSave(sim.state, save)

    expect(sim.state.platforms).toHaveLength(1)
    expect(sim.state.platforms[0].def.id).toBe('anchor')
  })

  it('bumps the formation version so the synergy preview refreshes', () => {
    const before = sim.state.formationVersion
    syncFieldToSave(sim.state, save)
    expect(sim.state.formationVersion).toBeGreaterThan(before)
  })
})
