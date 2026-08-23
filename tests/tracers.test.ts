import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { contactById } from '../src/lib/content/contacts'
import { createContact } from '../src/lib/systems/spawn'
import { platformPosition, updatePlatforms } from '../src/lib/systems/ai'
import { resolvePlatformAttacks } from '../src/lib/systems/combat'
import { TracerFeed, TRACER_CAPACITY, TRACER_LIFETIME } from '../src/lib/systems/tracers'
import type { ContactInstance } from '../src/lib/entities/Contact'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

describe('the tracer pool', () => {
  let tracers: TracerFeed

  beforeEach(() => {
    tracers = new TracerFeed(4)
  })

  it('holds a shot and hands it out', () => {
    tracers.emit(1, 2, 3, 4, 'thermal', true)

    const live = tracers.items.filter((t) => t.active)
    expect(live).toHaveLength(1)
    expect(live[0]).toMatchObject({
      fromX: 1,
      fromY: 2,
      toX: 3,
      toY: 4,
      damageType: 'thermal',
      lethal: true,
      age: 0,
    })
  })

  it('recycles a tracer once its window is up', () => {
    tracers.emit(0, 0, 10, 10, 'shear')

    tracers.update(TRACER_LIFETIME * 0.5)
    expect(tracers.live).toBe(1)

    tracers.update(TRACER_LIFETIME * 0.6)
    expect(tracers.live).toBe(0)
  })

  it('discards overflow rather than growing', () => {
    for (let i = 0; i < 10; i++) tracers.emit(0, 0, 1, 1, 'percussive')

    expect(tracers.live).toBe(4)
    expect(tracers.dropped).toBe(6)
  })

  it('sizes the real pool for a full field firing at once', () => {
    expect(TRACER_CAPACITY).toBeGreaterThanOrEqual(48)
  })
})

describe('Platform attacks draw a shot', () => {
  let sim: Simulation

  beforeEach(() => {
    sim = new Simulation(loadStage(STAGE), createRng(1))
    sim.state.contact.length = 0
    sim.state.platforms.length = 0
    sim.state.arrays.length = 0
    sim.state.tracers.clear()
  })

  function targetFor(hp: number): ContactInstance {
    const at = platformPosition(sim.state, sim.state.platforms[0])
    const contact = createContact(sim.state, contactById('skiff')!, { x: at.x, y: at.y })
    contact.velocity = { x: 0, y: 0 }
    contact.hp = hp
    contact.maxHp = Math.max(hp, 1)
    sim.state.contact.push(contact)
    return contact
  }

  function fieldBolt(): void {
    placePlatform(sim.state, platformById('bolt')!, 2, 0, 1)
  }

  it('emits one tracer per attack that resolved', () => {
    fieldBolt()
    targetFor(1e6)

    const attacks = updatePlatforms(sim.state, 2)
    expect(attacks).toHaveLength(1)

    resolvePlatformAttacks(sim.state, attacks)

    const live = sim.state.tracers.items.filter((t) => t.active)
    expect(live).toHaveLength(1)
    expect(live[0].damageType).toBe(platformById('bolt')!.damageType)
    expect(live[0].lethal).toBe(false)
  })

  it('runs the shot from the unit to its target', () => {
    fieldBolt()
    const contact = targetFor(1e6)
    const origin = platformPosition(sim.state, sim.state.platforms[0])

    resolvePlatformAttacks(sim.state, updatePlatforms(sim.state, 2))

    const tracer = sim.state.tracers.items.find((t) => t.active)!
    expect(tracer.fromX).toBeCloseTo(origin.x)
    expect(tracer.fromY).toBeCloseTo(origin.y)
    expect(tracer.toX).toBeCloseTo(contact.position.x)
    expect(tracer.toY).toBeCloseTo(contact.position.y)
  })

  it('marks a killing shot', () => {
    fieldBolt()
    targetFor(1)

    resolvePlatformAttacks(sim.state, updatePlatforms(sim.state, 2))

    const tracer = sim.state.tracers.items.find((t) => t.active)!
    expect(tracer.lethal).toBe(true)
  })

  it('draws nothing for an attack whose target died earlier in the tick', () => {
    fieldBolt()

    placePlatform(sim.state, platformById('bolt')!, 1, 0, 1)
    targetFor(1)

    const attacks = updatePlatforms(sim.state, 2)
    expect(attacks.length).toBeGreaterThan(1)

    resolvePlatformAttacks(sim.state, attacks)

    expect(sim.state.tracers.items.filter((t) => t.active)).toHaveLength(1)
  })

  it('does not change what the attack does', () => {
    fieldBolt()
    const contact = targetFor(1e6)
    const before = contact.hp

    resolvePlatformAttacks(sim.state, updatePlatforms(sim.state, 2))

    expect(contact.hp).toBeLessThan(before)
  })
})
