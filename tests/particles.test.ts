import { beforeEach, describe, expect, it } from 'vitest'
import { ParticleField } from '../src/lib/systems/particles'
import { BUDGETS } from '../src/lib/content/budgets'
import {
  CONJUNCTION_BURST,
  IMPACT_BURST,
  TYPE_COLOURS,
} from '../src/lib/content/effects'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { mountArray, placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { arrayById, ARRAYS } from '../src/lib/content/arrays'
import { RIM_MOUNTS, RINGS } from '../src/lib/content/field'
import { ZONES } from '../src/lib/content/zones'
import { stageOrder } from '../src/lib/core/stageLoader'
import { ALL_DAMAGE_TYPES } from '../src/lib/content/damageTypes'
import type { RingIndex } from '../src/lib/entities/types'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

describe('the particle field', () => {
  let field: ParticleField

  beforeEach(() => {
    field = new ParticleField(20)
  })

  it('holds what it is given', () => {
    field.emit({ x: 1, y: 2, vx: 3, vy: 4, life: 0.5, size: 2, colour: 0xff0000 })

    const live = field.items.filter((p) => p.active)
    expect(live).toHaveLength(1)
    expect(live[0]).toMatchObject({ x: 1, y: 2, life: 0.5, maxLife: 0.5 })
  })

  it('moves and expires', () => {
    field.emit({ x: 0, y: 0, vx: 100, vy: 0, life: 0.5, size: 2, colour: 0 })

    field.update(0.25)
    expect(field.items.find((p) => p.active)!.x).toBeCloseTo(25)

    field.update(0.3)
    expect(field.live).toBe(0)
  })

  it('decays speed the same way at any tick length', () => {
    const coarse = new ParticleField(4)
    const fine = new ParticleField(4)
    const spec = { x: 0, y: 0, vx: 100, vy: 0, life: 5, size: 1, colour: 0, drag: 0.1 }

    coarse.emit(spec)
    fine.emit(spec)

    coarse.update(0.5)
    for (let i = 0; i < 30; i++) fine.update(0.5 / 30)

    expect(coarse.items.find((p) => p.active)!.vx).toBeCloseTo(
      fine.items.find((p) => p.active)!.vx,
      4,
    )
  })

  it('discards overflow rather than growing', () => {
    for (let i = 0; i < 50; i++) {
      field.emit({ x: 0, y: 0, vx: 0, vy: 0, life: 1, size: 1, colour: 0 })
    }

    expect(field.live).toBe(20)
    expect(field.dropped).toBe(30)
  })

  it('scatters a burst rather than drawing a ring', () => {
    const wide = new ParticleField(64)
    wide.burst({
      x: 0,
      y: 0,
      count: 32,
      angle: 0,
      spread: Math.PI,
      speed: 100,
      life: 1,
      size: 2,
      colour: 0,
    })

    const speeds = wide.items
      .filter((p) => p.active)
      .map((p) => Math.hypot(p.vx, p.vy))

    expect(new Set(speeds.map((s) => Math.round(s))).size).toBeGreaterThan(8)
  })

  it('cannot change what the simulation does', () => {
    const quiet = new Simulation(loadStage(STAGE), createRng(11))
    const noisy = new Simulation(loadStage(STAGE), createRng(11))

    for (let t = 0; t < 400; t++) {
      noisy.state.particles.burst({
        x: 0,
        y: 0,
        count: 9,
        angle: 0,
        spread: 3,
        speed: 40,
        life: 0.3,
        size: 1,
        colour: 0,
      })
      quiet.tick(TICK_SECONDS)
      noisy.tick(TICK_SECONDS)
    }

    expect(noisy.state.particles.live).toBeGreaterThan(0)
    expect(noisy.state.contact.length).toBe(quiet.state.contact.length)
    expect(noisy.state.sun.hp).toBe(quiet.state.sun.hp)
    expect(noisy.state.contact.map((c) => c.position.x)).toEqual(
      quiet.state.contact.map((c) => c.position.x),
    )
  })
})

describe('the effect library', () => {
  it('colours every damage type', () => {
    for (const type of ALL_DAMAGE_TYPES) {
      expect(TYPE_COLOURS[type], type).toBeDefined()
    }
  })

  it('scales a conjunction with what it cost to arrange', () => {
    expect(CONJUNCTION_BURST.major.count).toBeGreaterThan(CONJUNCTION_BURST.minor.count)
    expect(CONJUNCTION_BURST.grand.count).toBeGreaterThan(CONJUNCTION_BURST.major.count)
    expect(CONJUNCTION_BURST.grand.speed).toBeGreaterThan(CONJUNCTION_BURST.minor.speed)
  })

  it('keeps an impact small enough to survive a dense tick', () => {
    expect(IMPACT_BURST.count * 20).toBeLessThan(BUDGETS.particles)
  })
})

describe('a real stage stays inside the budget', () => {
  function playFull(address: StageAddress): Simulation {
    const sim = new Simulation(loadStage(address), createRng(3))

    let n = 0
    for (const ring of RINGS) {
      for (let slot = 0; slot < ring.slots; slot++) {
        placePlatform(
          sim.state,
          platformById(n % 2 ? 'rake' : 'kiln')!,
          ring.index as RingIndex,
          slot,
          10,
        )
        n++
      }
    }
    for (let mount = 0; mount < RIM_MOUNTS; mount++) {
      mountArray(sim.state, arrayById(ARRAYS[mount % ARRAYS.length].id)!, mount, 5)
    }

    for (let t = 0; t < 240 / TICK_SECONDS; t++) {
      if (sim.state.flare.charge >= 1 && sim.state.flare.cooldown <= 0) {
        const target = sim.state.contact[0]
        if (target) sim.strike(target.position.x, target.position.y)
      }
      sim.tick(TICK_SECONDS)
      if (sim.state.phase === 'cleared' || sim.state.phase === 'overwhelmed') break
    }

    return sim
  }

  const ladder = stageOrder(ZONES)

  it.each([
    ['the opening stage', ladder[0]],
    ['the first boss', ladder[7]],
    ['the last boss', ladder[39]],
  ])('never exhausts the field on %s', (_name, address) => {
    const field = playFull(address as StageAddress).state.particles

    expect(field.dropped, `dropped ${field.dropped} for capacity`).toBe(0)
    expect(field.peak, `peak ${field.peak} of ${BUDGETS.particles}`).toBeLessThan(
      BUDGETS.particles,
    )
  })

  it('leaves room for a worse case than the ladder has', () => {
    const field = playFull(ladder[39] as StageAddress).state.particles
    expect(field.peak).toBeLessThan(BUDGETS.particles / 2)
  })
})
