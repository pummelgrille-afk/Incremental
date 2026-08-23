import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { ARRAYS, arrayById } from '../src/lib/content/arrays'
import { contactById } from '../src/lib/content/contacts'
import { createContact } from '../src/lib/systems/spawn'
import { updateProjectiles } from '../src/lib/systems/collision'
import { SUPPORT } from '../src/lib/content/economy'
import type { ArrayDef, ShotProfile } from '../src/lib/entities/Array'
import type { ContactInstance } from '../src/lib/entities/Contact'
import type { Projectile } from '../src/lib/entities/Projectile'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  sim.state.contact.length = 0
  sim.state.platforms.length = 0
  sim.state.arrays.length = 0
})

function target(x: number, y: number): ContactInstance {
  const c = createContact(sim.state, contactById('skiff')!, { x, y })
  c.velocity = { x: 0, y: 0 }
  c.hp = 1e9
  c.maxHp = 1e9
  sim.state.contact.push(c)
  return c
}

function shotFrom(def: ArrayDef, x: number, y: number, vx: number, damage = 100): Projectile {
  const p = sim.projectiles.acquire()!
  p.faction = 'array'
  p.position.x = x
  p.position.y = y
  p.velocity.x = vx
  p.velocity.y = 0
  p.damage = damage
  p.damageType = 'resonant'
  p.radius = 4
  p.lifetime = 99
  p.angularVelocity = 0
  p.sourceId = -1
  p.sourceDefId = def.id
  p.pierceRemaining = def.shot.kind === 'pierce' ? def.shot.targets - 1 : 0
  p.burstRadius = def.shot.kind === 'burst' ? def.shot.radius : 0
  p.hitCount = 0
  return p
}

const step = () => updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

describe('the launch Array roster', () => {
  it('lands inside the size PLAN.md asks for', () => {
    expect(ARRAYS.length).toBeGreaterThanOrEqual(4)
    expect(ARRAYS.length).toBeLessThanOrEqual(6)
  })

  it('has no duplicate ids or names', () => {
    const ids = ARRAYS.map((a) => a.id)
    const names = ARRAYS.map((a) => a.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps the whole class Resonant', () => {
    for (const a of ARRAYS) expect(a.damageType, a.id).toBe('resonant')
  })

  it('never charges below the floor the Recharge track enforces', () => {
    for (const a of ARRAYS) {
      expect(a.chargeInterval, a.id).toBeGreaterThanOrEqual(SUPPORT.recharge.floorSeconds)
    }
  })

  it('leaves the Phase 14 balance anchor exactly where it was measured', () => {
    const anchor = arrayById('long-baseline')!
    expect(anchor.attack).toBe(16)
    expect(anchor.chargeInterval).toBe(6)
    expect(anchor.maxCharge).toBe(3)
  })

  it('prices every unit near the anchor charge-limited output', () => {
    const anchor = arrayById('long-baseline')!
    const budget = anchor.attack / anchor.chargeInterval
    for (const a of ARRAYS) {
      const rate = a.attack / a.chargeInterval
      expect(rate, `${a.id} at ${rate.toFixed(2)} vs anchor ${budget.toFixed(2)}`).toBeLessThan(
        budget * 1.15,
      )
    }
  })
})

describe('every shot shape has a live user', () => {
  it('covers the whole ShotProfile union', () => {
    const kinds: ShotProfile['kind'][] = ['single', 'pierce', 'burst']
    const present = new Set(ARRAYS.map((a) => a.shot.kind))
    for (const kind of kinds) expect(present, `${kind} has no Array`).toContain(kind)
  })

  it('authors a count with every pierce and a radius with every burst', () => {
    for (const a of ARRAYS) {
      if (a.shot.kind === 'pierce') expect(a.shot.targets, a.id).toBeGreaterThan(1)
      if (a.shot.kind === 'burst') expect(a.shot.radius, a.id).toBeGreaterThan(0)
    }
  })
})

describe('single', () => {
  it('stops at the first Contact it touches', () => {
    const near = target(100, 0)
    const far = target(160, 0)
    const p = shotFrom(arrayById('long-baseline')!, 90, 0, 600)

    for (let i = 0; i < 20; i++) step()

    expect(near.hp).toBeLessThan(1e9)
    expect(far.hp, 'a single shot must not reach the second Contact').toBe(1e9)
    expect(p.active).toBe(false)
  })
})

describe('pierce', () => {
  it('passes through, up to the authored number of targets', () => {
    const a = target(100, 0)
    const b = target(140, 0)
    const c = target(180, 0)

    const d = target(220, 0)
    shotFrom(arrayById('transit')!, 90, 0, 600)

    for (let i = 0; i < 40; i++) step()

    expect(a.hp).toBeLessThan(1e9)
    expect(b.hp).toBeLessThan(1e9)
    expect(c.hp).toBeLessThan(1e9)
    expect(d.hp, 'the fourth Contact is past the pierce budget').toBe(1e9)
  })

  it('does not hit the same Contact twice while passing through it', () => {
    const reference = target(100, 0)
    shotFrom(arrayById('long-baseline')!, 96, 0, 30)
    for (let i = 0; i < 40; i++) step()
    const oneHit = 1e9 - reference.hp
    expect(oneHit).toBeGreaterThan(0)

    sim.state.contact.length = 0

    const only = target(100, 0)
    shotFrom(arrayById('transit')!, 96, 0, 30)
    for (let i = 0; i < 40; i++) step()

    const dealt = 1e9 - only.hp

    expect(dealt, 'one Contact, one hit').toBeCloseTo(oneHit, 5)
  })

  it('never hits a Contact twice, even when hurtboxes overlap', () => {
    const a = target(100, 0)
    const b = target(118, 0)
    shotFrom(arrayById('transit')!, 60, 0, 200)

    for (let i = 0; i < 60; i++) step()

    const dealt = 1e9 - a.hp + (1e9 - b.hp)

    expect(dealt).toBeCloseTo(200, 5)
  })

  it('carries full damage to each Contact it passes through', () => {
    const first = target(100, 0)
    const second = target(150, 0)
    shotFrom(arrayById('transit')!, 90, 0, 600)

    for (let i = 0; i < 40; i++) step()

    expect(1e9 - second.hp).toBeCloseTo(1e9 - first.hp, 5)
  })
})

describe('burst', () => {
  it('splashes onto neighbours inside the radius', () => {
    const struck = target(100, 0)
    const neighbour = target(120, 0)
    const outside = target(100, 200)
    shotFrom(arrayById('corona')!, 90, 0, 600)

    for (let i = 0; i < 20; i++) step()

    expect(struck.hp).toBeLessThan(1e9)
    expect(neighbour.hp, 'inside the splash radius').toBeLessThan(1e9)
    expect(outside.hp, 'well outside the splash radius').toBe(1e9)
  })

  it('splashes for less than a direct hit', () => {
    const struck = target(100, 0)
    const neighbour = target(120, 0)
    shotFrom(arrayById('corona')!, 90, 0, 600)

    for (let i = 0; i < 20; i++) step()

    expect(1e9 - neighbour.hp).toBeLessThan(1e9 - struck.hp)
  })

  it('despawns on impact rather than also piercing', () => {
    const struck = target(100, 0)
    const behind = target(300, 0)
    const p = shotFrom(arrayById('corona')!, 90, 0, 600)

    for (let i = 0; i < 40; i++) step()

    expect(struck.hp).toBeLessThan(1e9)
    expect(behind.hp).toBe(1e9)
    expect(p.active).toBe(false)
  })
})

describe('a recycled projectile', () => {
  it('does not inherit the last shot shape', () => {
    const first = shotFrom(arrayById('transit')!, 90, 0, 300)
    expect(first.pierceRemaining).toBeGreaterThan(0)
    sim.projectiles.release(first)

    const reused = shotFrom(arrayById('long-baseline')!, 90, 0, 300)
    expect(reused, 'the pool should hand back the same slot').toBe(first)
    expect(reused.pierceRemaining).toBe(0)
    expect(reused.burstRadius).toBe(0)
    expect(reused.hitCount).toBe(0)
  })
})
