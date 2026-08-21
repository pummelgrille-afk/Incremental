import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { placeMovement } from '../src/lib/core/formation'
import { movementById } from '../src/lib/content/allies'
import { SLACK, slackById } from '../src/lib/content/enemies'
import { createSlack } from '../src/lib/systems/spawn'
import { updateProjectiles } from '../src/lib/systems/collision'
import { CombatFeed, EVENT_LIFETIME, FEED_CAPACITY } from '../src/lib/systems/feed'
import { RINGS } from '../src/lib/content/field'
import type { SlackInstance } from '../src/lib/entities/Slack'
import type { Projectile } from '../src/lib/entities/Projectile'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'escapement-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  sim.state.slack.length = 0
  sim.state.movements.length = 0
  sim.state.chimes.length = 0
})

function stationarySlack(defId: string, x: number, y: number): SlackInstance {
  const s = createSlack(sim.state, slackById(defId)!, { x, y })
  s.velocity = { x: 0, y: 0 }
  s.hp = 1e9
  s.maxHp = 1e9
  sim.state.slack.push(s)
  return s
}

function projectile(
  faction: 'slack' | 'chime',
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
  p.damageType = faction === 'chime' ? 'resonant' : 'percussive'
  p.radius = 3.5
  p.lifetime = 99
  p.angularVelocity = 0
  p.sourceId = -1
  return p
}

describe('hurtboxes are decoupled from sprites', () => {
  it('gives every Slack an authored hurtbox', () => {
    for (const def of SLACK) {
      expect(def.hurtboxRadius, def.id).toBeGreaterThan(0)
    }
  })

  it('uses the Slack own radius, not one shared constant', () => {
    // A hit just outside the small hurtbox must miss, and the same offset
    // against a bigger one must connect.
    const small = slackById('burr')!.hurtboxRadius
    const large = slackById('drift')!.hurtboxRadius
    expect(large).toBeGreaterThan(small)

    const offset = small + 3.5 + 1 // just past burr's reach
    const burr = stationarySlack('burr', 200, 0)
    projectile('chime', 200 + offset, 0)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)
    expect(burr.hp).toBe(1e9)

    sim.projectiles.reset()
    const drift = stationarySlack('drift', -200, 0)
    projectile('chime', -200 + offset, 0)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)
    expect(drift.hp).toBeLessThan(1e9)
  })

  it('keeps the Mainspring hitbox smaller than what is drawn', () => {
    // Errs toward the player: near misses read as misses.
    expect(sim.state.mainspring.hitboxRadius).toBeLessThan(34)
  })
})

describe('block arc', () => {
  it('intercepts a projectile crossing a Movement slot', () => {
    const unit = placeMovement(sim.state, movementById('detent')!, 2, 0)
    const before = unit.hp

    // Slot 0 at phase 0 sits at angle 0 on ring 2.
    projectile('slack', RINGS[1].radius, 0, 25)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.movementHits).toBe(1)
    expect(unit.hp).toBeLessThan(before)
  })

  it('ignores a projectile well inside the ring', () => {
    const unit = placeMovement(sim.state, movementById('detent')!, 2, 0)
    const before = unit.hp

    // Same bearing, far inside the band.
    projectile('slack', 90, 0, 25)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.movementHits).toBe(0)
    expect(unit.hp).toBe(before)
  })

  it('does not intercept while disabled', () => {
    const unit = placeMovement(sim.state, movementById('detent')!, 2, 0)
    unit.disabledFor = 5

    projectile('slack', RINGS[1].radius, 0, 25)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.movementHits).toBe(0)
  })

  it('lets a projectile through to the Mainspring when nothing blocks it', () => {
    const before = sim.state.mainspring.hp
    projectile('slack', 0, 0, 40)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.mainspringHits).toBe(1)
    expect(sim.state.mainspring.hp).toBeLessThan(before)
  })
})

describe('the combat feed', () => {
  it('records a damage event when a Slack is hit but survives', () => {
    stationarySlack('burr', 200, 0)
    projectile('chime', 200, 0, 5)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    const events = sim.state.feed.items.filter((e) => e.active)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('damage')
    expect(events[0].amount).toBeGreaterThan(0)
  })

  it('records a kill event when the Slack dies', () => {
    const s = stationarySlack('burr', 200, 0)
    s.hp = 1
    s.maxHp = 1
    projectile('chime', 200, 0, 500)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(sim.state.feed.items.filter((e) => e.active && e.kind === 'kill')).toHaveLength(1)
  })

  it('records a block', () => {
    placeMovement(sim.state, movementById('detent')!, 2, 0)
    projectile('slack', RINGS[1].radius, 0, 20)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    const kinds = sim.state.feed.items.filter((e) => e.active).map((e) => e.kind)
    expect(kinds).toContain('block')
  })

  it('emits no popup for a Mainspring hit', () => {
    // Playtest: a number at the point of impact competes with the white flash
    // and the HUD bar, which already carry it. Two channels, one worse.
    const before = sim.state.mainspring.hp
    projectile('slack', 0, 0, 20)
    const result = updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    expect(result.mainspringHits).toBe(1)
    expect(sim.state.mainspring.hp).toBeLessThan(before)
    // The hit is still communicated — just not as a popup.
    expect(sim.state.mainspring.hitFlash).toBeGreaterThan(0)
    expect(sim.state.feed.items.filter((e) => e.active)).toHaveLength(0)
  })

  it('places the event where the hit happened', () => {
    stationarySlack('burr', 150, -80)
    projectile('chime', 150, -80, 5)
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
    // Presentation, not state: dropping a popup changes no outcome, and an
    // unbounded feed would allocate on the hot path.
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
    const s = stationarySlack('burr', 200, 0)
    projectile('chime', 200, 0, 7.7)
    updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS)

    const [event] = sim.state.feed.items.filter((e) => e.active)
    expect(Number.isInteger(event.amount)).toBe(true)
    expect(Number.isInteger(s.hp)).toBe(false)
  })

  it('never influences the simulation', () => {
    // The feed is drawn, never read by systems. Filling it must not change a run.
    const a = new Simulation(loadStage(STAGE), createRng(7))
    const b = new Simulation(loadStage(STAGE), createRng(7))
    for (let i = 0; i < 200; i++) b.state.feed.emit('damage', i, i, i)

    for (let i = 0; i < 400; i++) {
      a.tick(TICK_SECONDS)
      b.tick(TICK_SECONDS)
    }
    expect(a.state.mainspring.hp).toBe(b.state.mainspring.hp)
    expect(a.totalSlackKilled).toBe(b.totalSlackKilled)
  })
})
