import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { createContact, updateContactMotion, updateSpawning } from '../src/lib/systems/spawn'
import { massed, pincer, scattered } from '../src/lib/content/waves'
import { damageContact, reapContact } from '../src/lib/systems/combat'
import { CONTACT, contactById } from '../src/lib/content/contacts'
import { ZONES } from '../src/lib/content/zones'
import { isBossWave, type WaveDef } from '../src/lib/entities/Wave'
import type { ContactInstance } from '../src/lib/entities/Contact'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  sim.state.contact.length = 0
  sim.state.platforms.length = 0
  sim.state.arrays.length = 0
})

function spawn(defId: string, radius: number, angle = 0): ContactInstance {
  const instance = createContact(sim.state, contactById(defId)!, {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  })
  sim.state.contact.push(instance)
  return instance
}

const radiusOf = (s: ContactInstance) => Math.hypot(s.position.x, s.position.y)

describe('motion archetypes', () => {
  it('drift closes on the Sun steadily', () => {
    const s = spawn('hulk', 320)
    const before = radiusOf(s)
    for (let i = 0; i < 40; i++) updateContactMotion(sim.state, TICK_SECONDS)
    expect(radiusOf(s)).toBeLessThan(before)
  })

  it('swarm closes too, but not in a straight line', () => {
    const s = spawn('skiff', 320, 0)
    for (let i = 0; i < 40; i++) updateContactMotion(sim.state, TICK_SECONDS)
    expect(radiusOf(s)).toBeLessThan(320)

    expect(Math.abs(s.position.y)).toBeGreaterThan(0)
  })

  it('charge accelerates once inside the outer ring', () => {
    const outside = spawn('lance', 300)
    const inside = spawn('lance', 200)

    updateContactMotion(sim.state, TICK_SECONDS)

    const outsideSpeed = Math.hypot(outside.velocity.x, outside.velocity.y)
    const insideSpeed = Math.hypot(inside.velocity.x, inside.velocity.y)
    expect(insideSpeed).toBeGreaterThan(outsideSpeed)
  })

  it('orbit closes until it reaches its radius, then circles', () => {
    const s = spawn('picket', 320)
    const target = contactById('picket')!.traits!.orbitRadius!

    for (let i = 0; i < 200; i++) {
      updateContactMotion(sim.state, TICK_SECONDS)
      if (radiusOf(s) <= target + 5) break
    }
    expect(radiusOf(s)).toBeLessThanOrEqual(target + 5)

    for (let i = 0; i < 100; i++) updateContactMotion(sim.state, TICK_SECONDS)
    expect(radiusOf(s)).toBeCloseTo(target, 6)
  })

  it('orbit actually moves around rather than sitting still', () => {
    const s = spawn('picket', 206)
    const startAngle = Math.atan2(s.position.y, s.position.x)
    for (let i = 0; i < 60; i++) updateContactMotion(sim.state, TICK_SECONDS)
    expect(Math.atan2(s.position.y, s.position.x)).not.toBeCloseTo(startAngle, 2)
  })

  it('orbiters split direction, so they do not form one convoy', () => {
    const a = spawn('picket', 206, 0)
    const b = spawn('picket', 206, 0)

    for (let i = 0; i < 20; i++) updateContactMotion(sim.state, TICK_SECONDS)
    expect(Math.sign(a.velocity.y)).not.toBe(Math.sign(b.velocity.y))
    expect(Math.sign(a.velocity.y)).not.toBe(0)
  })
})

describe('shielded', () => {
  it('absorbs a fixed number of hits regardless of their size', () => {
    const s = spawn('shell', 200)
    const shields = contactById('shell')!.traits!.shieldHits!
    const full = s.hp

    for (let i = 0; i < shields; i++) {
      expect(damageContact(s, 9999)).toBe(false)
      expect(s.hp).toBe(full)
    }

    damageContact(s, 10)
    expect(s.hp).toBeLessThan(full)
  })
})

describe('telegraph vulnerability', () => {
  it('takes multiplied damage while winding up', () => {
    const plain = spawn('picket', 200)
    const exposed = spawn('picket', 200)
    const multiplier = contactById('picket')!.traits!.vulnerableWhileTelegraphing!

    exposed.telegraphRemaining = 0.4

    damageContact(plain, 100)
    damageContact(exposed, 100)

    const plainLoss = plain.maxHp - plain.hp
    const exposedLoss = exposed.maxHp - exposed.hp
    expect(exposedLoss).toBeCloseTo(plainLoss * multiplier, 5)
  })

  it('leaves a Contact without the trait unaffected', () => {
    const s = spawn('skiff', 200)
    s.telegraphRemaining = 0.4
    const before = s.hp
    damageContact(s, 5)
    expect(before - s.hp).toBeCloseTo(5, 6)
  })
})

describe('splitters', () => {
  it('spawns children on death', () => {
    const parent = spawn('brood', 200)
    const split = contactById('brood')!.traits!.splitsInto!

    reapContact(sim.state, new Set([parent.id]))

    expect(sim.state.contact).toHaveLength(split.count)
    expect(sim.state.contact.every((s) => s.def.id === split.defId)).toBe(true)
  })

  it('places children near the parent but not stacked on one point', () => {
    const parent = spawn('brood', 200)
    parent.velocity = { x: -30, y: 0 }
    const at = { ...parent.position }

    reapContact(sim.state, new Set([parent.id]))

    const positions = sim.state.contact.map((s) => `${s.position.x},${s.position.y}`)
    expect(new Set(positions).size).toBe(sim.state.contact.length)

    for (const child of sim.state.contact) {
      const offset = Math.hypot(child.position.x - at.x, child.position.y - at.y)
      expect(offset).toBeLessThan(40)
    }
  })

  it('still awards the parent its Salvage', () => {
    const parent = spawn('brood', 200)
    const result = reapContact(sim.state, new Set([parent.id]))
    expect(result.salvageDropped).toBeGreaterThan(0)
    expect(result.contactKilled).toBe(1)
  })

  it('children exist immediately, so a wave cannot read as cleared', () => {
    const parent = spawn('brood', 200)
    reapContact(sim.state, new Set([parent.id]))
    expect(sim.state.contact.length).toBeGreaterThan(0)
  })

  it('does not split a Contact without the trait', () => {
    const s = spawn('skiff', 200)
    reapContact(sim.state, new Set([s.id]))
    expect(sim.state.contact).toHaveLength(0)
  })
})

describe('content integrity', () => {
  it('has no split cycles', () => {
    for (const def of CONTACT) {
      const seen = new Set<string>([def.id])
      let current = def.traits?.splitsInto?.defId

      let depth = 0
      while (current) {
        expect(seen.has(current), `split cycle reaching "${current}"`).toBe(false)
        seen.add(current)
        current = contactById(current)?.traits?.splitsInto?.defId
        expect(++depth, `split chain from "${def.id}" too deep`).toBeLessThan(8)
      }
    }
  })

  it('only splits into Contact that exist', () => {
    for (const def of CONTACT) {
      const child = def.traits?.splitsInto?.defId
      if (child) expect(contactById(child), `${def.id} -> ${child}`).toBeDefined()
    }
  })

  it('gives every behavioural hook at least one live user', () => {
    expect(CONTACT.some((s) => s.traits?.splitsInto)).toBe(true)
    expect(CONTACT.some((s) => s.traits?.shieldHits)).toBe(true)
    expect(CONTACT.some((s) => s.traits?.vulnerableWhileTelegraphing)).toBe(true)
    expect(CONTACT.some((s) => s.motion === 'orbit')).toBe(true)
    expect(CONTACT.some((s) => s.motion === 'charge')).toBe(true)
    expect(CONTACT.some((s) => s.motion === 'swarm')).toBe(true)
    expect(CONTACT.some((s) => s.motion === 'drift')).toBe(true)
  })

  it('keeps every authored wave inside its zone enemy pool', () => {
    for (const zone of ZONES) {
      const pool = new Set(zone.enemyPool)
      for (const stage of zone.stages) {
        for (const wave of stage.waves) {
          if (isBossWave(wave)) continue
          for (const group of wave.groups) {
            expect(pool.has(group.defId), `${zone.id}:${stage.id} -> ${group.defId}`).toBe(
              true,
            )
          }
        }
      }
    }
  })
})

describe('spawn bearings', () => {
  function angleDelta(a: number, b: number): number {
    let d = (a - b) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    return d
  }

  function bearings(wave: WaveDef, seed: number, arcOffset = 0): number[] {
    const state = loadStage(STAGE)
    const stage = { ...state.stage, waves: [wave] }
    Object.assign(state, { stage, waveIndex: 0, waveArcOffset: arcOffset })

    const rng = createRng(seed)
    const total = wave.groups.reduce((n, g) => n + g.count, 0)

    state.waveElapsed = 1000
    updateSpawning(state, rng, -1)

    expect(state.contact).toHaveLength(total)
    return state.contact.map((s) => Math.atan2(s.position.y, s.position.x))
  }

  it('scatters a group with no arc around the whole circle', () => {
    const angles = bearings(scattered('skiff', 60, 0.1), 3)
    const quadrants = new Set(angles.map((a) => Math.floor((a + Math.PI) / (Math.PI / 2))))
    expect(quadrants.size).toBe(4)
  })

  it('gives the same bearings for the same seed', () => {
    expect(bearings(scattered('skiff', 20, 0.1), 9)).toEqual(bearings(scattered('skiff', 20, 0.1), 9))
  })

  it('gives different bearings for different seeds', () => {
    expect(bearings(scattered('skiff', 20, 0.1), 1)).not.toEqual(
      bearings(scattered('skiff', 20, 0.1), 2),
    )
  })

  it('keeps an arc wave inside its arc, jitter included', () => {
    const width = Math.PI / 3
    const count = 16

    const contact = (width / (count - 1)) * 0.5
    for (const a of bearings(massed('skiff', count, 0, width), 5)) {
      expect(Math.abs(angleDelta(a, 0))).toBeLessThanOrEqual(width / 2 + contact + 1e-9)
    }
  })

  it('rotates the whole arc by the per-wave offset', () => {
    const offset = 1.1
    const at = (o: number) => bearings(massed('skiff', 16, 0, Math.PI / 3), 5, o)
    const shifted = at(offset)
    at(0).forEach((a, i) => expect(angleDelta(shifted[i], a)).toBeCloseTo(offset, 6))
  })

  it('never produces a non-finite position', () => {
    for (const count of [1, 2, 3, 40]) {
      for (const a of bearings(massed('skiff', count, 0, Math.PI / 4), 2)) {
        expect(Number.isFinite(a)).toBe(true)
      }
      for (const a of bearings(pincer('skiff', count), 2)) {
        expect(Number.isFinite(a)).toBe(true)
      }
    }
  })
})
