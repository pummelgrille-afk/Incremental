import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { CONTACT, contactById } from '../src/lib/content/contacts'
import { createContact } from '../src/lib/systems/spawn'
import { updateProjectiles } from '../src/lib/systems/collision'
import { CombatFeed, EVENT_LIFETIME, FEED_CAPACITY } from '../src/lib/systems/feed'
import { RINGS } from '../src/lib/content/field'
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

function stationaryContact(defId: string, x: number, y: number): ContactInstance {
  const s = createContact(sim.state, contactById(defId)!, { x, y })
  s.velocity = { x: 0, y: 0 }
  s.hp = 1e9
  s.maxHp = 1e9
  sim.state.contact.push(s)
  return s
}

function projectile(
  faction: 'contact' | 'array',
  x: number,
  y: number,
  damage = 10,
): Projectile {
  const p = sim.projectiles.acquire()!
  p.faction = faction
  p.position.x = x
  p.position.y = y
  p.velocity.x = 0
  p.velocity.y = 0
  p.damage = damage
  p.damageType = faction === 'array' ? 'resonant' : 'percussive'
  p.radius = 3.5
  p.lifetime = 99
  p.angularVelocity = 0
  p.sourceId = -1
  return p
}

describe('hurtboxes are decoupled from sprites', () => {
  it('gives every Contact an authored hurtbox', () => {
    for (const def of CONTACT) {
      expect(def.hurtboxRadius, def.id).toBeGreaterThan(0)
    }
  })

  it('uses the Contact own radius, not one shared constant', () => {
    const small = contactById('skiff')!.hurtboxRadius
    const large = contactById('hulk')!.hurtboxRadius
    expect(large).toBeGreaterThan(small)

    const offset = small + 3.5 + 1
    const burr = stationaryContact('skiff', 200, 0)
    projectile('array', 200 + offset, 0)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)
    expect(burr.hp).toBe(1e9)

    sim.projectiles.reset()
    const hulk = stationaryContact('hulk', -200, 0)
    projectile('array', -200 + offset, 0)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)
    expect(hulk.hp).toBeLessThan(1e9)
  })

  it('keeps the Sun hitbox smaller than what is drawn', () => {
    expect(sim.state.sun.hitboxRadius).toBeLessThan(34)
  })
})

describe('block arc', () => {
  it('intercepts a projectile crossing a Platform slot', () => {
    const unit = placePlatform(sim.state, platformById('anchor')!, 2, 0)
    const before = unit.hp

    projectile('contact', RINGS[1].radius, 0, 25)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.platformHits).toBe(1)
    expect(unit.hp).toBeLessThan(before)
  })

  it('ignores a projectile well inside the ring', () => {
    const unit = placePlatform(sim.state, platformById('anchor')!, 2, 0)
    const before = unit.hp

    projectile('contact', 90, 0, 25)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.platformHits).toBe(0)
    expect(unit.hp).toBe(before)
  })

  it('does not intercept while disabled', () => {
    const unit = placePlatform(sim.state, platformById('anchor')!, 2, 0)
    unit.disabledFor = 5

    projectile('contact', RINGS[1].radius, 0, 25)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.platformHits).toBe(0)
  })

  it('lets a projectile through to the Sun when nothing blocks it', () => {
    const before = sim.state.sun.hp
    projectile('contact', 0, 0, 40)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.sunHits).toBe(1)
    expect(sim.state.sun.hp).toBeLessThan(before)
  })
})

describe('the combat feed', () => {
  it('records a damage event when a Contact is hit but survives', () => {
    stationaryContact('skiff', 200, 0)
    projectile('array', 200, 0, 5)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    const events = sim.state.feed.items.filter((e) => e.active)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('damage')
    expect(events[0].amount).toBeGreaterThan(0)
  })

  it('records a kill event when the Contact dies', () => {
    const s = stationaryContact('skiff', 200, 0)
    s.hp = 1
    s.maxHp = 1
    projectile('array', 200, 0, 500)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(sim.state.feed.items.filter((e) => e.active && e.kind === 'kill')).toHaveLength(1)
  })

  it('records a block', () => {
    placePlatform(sim.state, platformById('anchor')!, 2, 0)
    projectile('contact', RINGS[1].radius, 0, 20)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    const kinds = sim.state.feed.items.filter((e) => e.active).map((e) => e.kind)
    expect(kinds).toContain('block')
  })

  it('emits no popup for a Sun hit', () => {
    const before = sim.state.sun.hp
    projectile('contact', 0, 0, 20)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.sunHits).toBe(1)
    expect(sim.state.sun.hp).toBeLessThan(before)

    expect(sim.state.sun.hitFlash).toBeGreaterThan(0)
    expect(sim.state.feed.items.filter((e) => e.active)).toHaveLength(0)
  })

  it('places the event where the hit happened', () => {
    stationaryContact('skiff', 150, -80)
    projectile('array', 150, -80, 5)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    const [event] = sim.state.feed.items.filter((e) => e.active)
    expect(event.x).toBeCloseTo(150, 0)
    expect(event.y).toBeCloseTo(-80, 0)
  })

  it('expires events rather than accumulating them', () => {
    const feed = new CombatFeed()
    feed.emit('damage', 0, 0, 5)
    expect(feed.live).toBe(1)

    feed.update(EVENT_LIFETIME + 0.01)
    expect(feed.live).toBe(0)
  })

  it('discards overflow instead of growing', () => {
    const feed = new CombatFeed()
    for (let i = 0; i < FEED_CAPACITY + 20; i++) feed.emit('damage', 0, 0, 1)

    expect(feed.live).toBe(FEED_CAPACITY)
    expect(feed.dropped).toBe(20)
  })

  it('recycles slots once events expire', () => {
    const feed = new CombatFeed()
    for (let i = 0; i < FEED_CAPACITY; i++) feed.emit('damage', 0, 0, 1)
    feed.update(EVENT_LIFETIME + 0.01)

    feed.emit('kill', 1, 2, 3)
    expect(feed.live).toBe(1)
  })

  it('rounds the amount for display but leaves the simulation float', () => {
    const s = stationaryContact('skiff', 200, 0)
    projectile('array', 200, 0, 7.7)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    const [event] = sim.state.feed.items.filter((e) => e.active)
    expect(Number.isInteger(event.amount)).toBe(true)
    expect(Number.isInteger(s.hp)).toBe(false)
  })

  it('never influences the simulation', () => {
    const a = new Simulation(loadStage(STAGE), createRng(7))
    const b = new Simulation(loadStage(STAGE), createRng(7))
    for (let i = 0; i < 200; i++) b.state.feed.emit('damage', i, i, i)

    for (let i = 0; i < 400; i++) {
      a.tick(TICK_SECONDS)
      b.tick(TICK_SECONDS)
    }
    expect(a.state.sun.hp).toBe(b.state.sun.hp)
    expect(a.totalContactKilled).toBe(b.totalContactKilled)
  })
})
