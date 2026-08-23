import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { contactById } from '../src/lib/content/contacts'
import { createContact } from '../src/lib/systems/spawn'
import { updateBuffs } from '../src/lib/systems/buffs'
import {
  createCooldowns,
  findConjunctions,
  timeToNextConjunction,
  updateSynergy,
} from '../src/lib/systems/synergy'
import {
  ALL_DAMAGE_TYPES,
  opposesType,
  pairingOf,
} from '../src/lib/content/damageTypes'
import { CONJUNCTION, RINGS } from '../src/lib/content/field'
import type { DamageType } from '../src/lib/entities/types'
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

function alignAtZero(ids: string[]) {
  return ids.map((id, i) =>
    placePlatform(sim.state, platformById(id)!, (i + 1) as 1 | 2 | 3, 0),
  )
}

function contactAt(defId: string, angle: number, radius = 200): ContactInstance {
  const s = createContact(sim.state, contactById(defId)!, {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  })
  s.hp = 1e9
  s.maxHp = 1e9
  sim.state.contact.push(s)
  return s
}

describe('type opposition', () => {
  it('reproduces the two pairs the matrix is built around', () => {
    expect(opposesType('shear', 'percussive')).toBe(true)
    expect(opposesType('percussive', 'shear')).toBe(true)
    expect(opposesType('thermal', 'resonant')).toBe(true)
    expect(opposesType('resonant', 'thermal')).toBe(true)
  })

  it('does not oppose across the two independent pairs', () => {
    expect(opposesType('shear', 'thermal')).toBe(false)
    expect(opposesType('percussive', 'resonant')).toBe(false)
  })

  it('never opposes itself', () => {
    for (const type of ALL_DAMAGE_TYPES) expect(opposesType(type, type)).toBe(false)
  })

  it('is symmetric for every pair', () => {
    for (const a of ALL_DAMAGE_TYPES) {
      for (const b of ALL_DAMAGE_TYPES) {
        expect(opposesType(a, b), `${a}/${b}`).toBe(opposesType(b, a))
      }
    }
  })

  it('gives every type exactly one opposite', () => {
    for (const a of ALL_DAMAGE_TYPES) {
      const opposites = ALL_DAMAGE_TYPES.filter((b) => opposesType(a, b))
      expect(opposites, a).toHaveLength(1)
    }
  })
})

describe('pairing a group', () => {
  const of = (...types: DamageType[]) => pairingOf(types)

  it('calls one shared type matched', () => {
    expect(of('shear', 'shear')).toBe('matched')
    expect(of('shear', 'shear', 'shear')).toBe('matched')
  })

  it('calls an opposed pair interference', () => {
    expect(of('shear', 'percussive')).toBe('interference')
  })

  it('finds interference anywhere in a larger group', () => {
    expect(of('thermal', 'shear', 'percussive')).toBe('interference')
  })

  it('calls anything else mixed', () => {
    expect(of('shear', 'thermal')).toBe('mixed')
  })

  it('treats a lone unit as mixed, since pairing needs two', () => {
    expect(of('shear')).toBe('mixed')
    expect(pairingOf([])).toBe('mixed')
  })
})

describe('conjunction detection', () => {
  it('reports the pairing of its participants', () => {
    alignAtZero(['bolt', 'anchor'])
    const [event] = findConjunctions(sim.state)
    expect(event.pairing).toBe('matched')
  })

  it('reports interference for opposed participants', () => {
    alignAtZero(['bolt', 'rake'])
    const [event] = findConjunctions(sim.state)
    expect(event.pairing).toBe('interference')
  })
})

describe('pairing changes what a conjunction does', () => {
  function pulseDamage(ids: string[], angle: number): number {
    sim.state.platforms.length = 0
    sim.state.contact.length = 0
    alignAtZero(ids)
    const target = contactAt('skiff', angle)

    updateSynergy(sim.state, createCooldowns())
    return 1e9 - target.hp
  }

  it('amplifies a matched pair over a mixed one', () => {
    expect(CONJUNCTION.pairing.matched).toBeGreaterThan(CONJUNCTION.pairing.mixed)
    expect(CONJUNCTION.pairing.interference).toBeLessThan(CONJUNCTION.pairing.mixed)
  })

  it('reaches further under interference than a matched pair does', () => {
    const wide = (CONJUNCTION.pulseArc + CONJUNCTION.interferenceArc) / 2

    const matched = pulseDamage(['bolt', 'anchor'], wide)
    const interfering = pulseDamage(['bolt', 'rake'], wide)

    expect(matched).toBe(0)
    expect(interfering).toBeGreaterThan(0)
  })

  it('still hits harder on-axis when matched', () => {
    const matched = pulseDamage(['bolt', 'anchor'], 0)
    const interfering = pulseDamage(['bolt', 'rake'], 0)

    expect(matched).toBeGreaterThan(interfering)
  })
})

describe('conjunction buffs follow the stacking rule', () => {
  it('grants a shield with the authored duration', () => {
    const [, anchor] = alignAtZero(['bolt', 'anchor'])
    expect(anchor.def.conjunctionEffect.kind).toBe('shield')

    updateSynergy(sim.state, createCooldowns())

    expect(anchor.buffs.shield.magnitude).toBeGreaterThan(0)
    expect(anchor.buffs.shield.remaining).toBe(anchor.def.conjunctionEffect.duration)
  })

  it('does not stack across repeated firings', () => {
    const [, anchor] = alignAtZero(['bolt', 'anchor'])

    updateSynergy(sim.state, createCooldowns())
    const first = anchor.buffs.shield.magnitude

    for (let i = 0; i < 10; i++) updateSynergy(sim.state, createCooldowns())
    expect(anchor.buffs.shield.magnitude).toBe(first)
  })

  it('does not extend duration with scale', () => {
    const [, anchor] = alignAtZero(['bolt', 'anchor'])
    updateSynergy(sim.state, createCooldowns())
    const minor = anchor.buffs.shield.remaining

    sim.state.platforms.length = 0
    const [, big] = alignAtZero(['bolt', 'anchor', 'rake'])
    updateSynergy(sim.state, createCooldowns())

    expect(big.buffs.shield.remaining).toBe(minor)
  })

  it('expires on the schedule its content authored', () => {
    const [, anchor] = alignAtZero(['bolt', 'anchor'])
    const duration = anchor.def.conjunctionEffect.duration!
    updateSynergy(sim.state, createCooldowns())

    for (let i = 0; i < Math.ceil(duration / TICK_SECONDS) + 1; i++) {
      updateBuffs(sim.state, TICK_SECONDS)
    }
    expect(anchor.buffs.shield.magnitude).toBe(0)
  })

  it('never banks more than one duration, however long an alignment lingers', () => {
    const [, anchor] = alignAtZero(['bolt', 'anchor'])
    const duration = anchor.def.conjunctionEffect.duration!
    const cooldowns = createCooldowns()

    for (let i = 0; i < 400; i++) {
      updateSynergy(sim.state, cooldowns)
      updateBuffs(sim.state, CONJUNCTION.evalInterval / 1000)
      expect(anchor.buffs.shield.remaining).toBeLessThanOrEqual(duration)
    }
  })
})

describe('the preview', () => {
  it('reports nothing with fewer than two Platforms', () => {
    placePlatform(sim.state, platformById('bolt')!, 1, 0)
    expect(timeToNextConjunction(sim.state)).toBeNull()
  })

  it('reports nothing for two units on the same ring', () => {
    placePlatform(sim.state, platformById('bolt')!, 2, 0)
    placePlatform(sim.state, platformById('anchor')!, 2, 4)
    expect(timeToNextConjunction(sim.state)).toBeNull()
  })

  it('finds an alignment for units on different rings', () => {
    placePlatform(sim.state, platformById('bolt')!, 1, 2)
    placePlatform(sim.state, platformById('anchor')!, 2, 5)

    const t = timeToNextConjunction(sim.state)
    expect(t).not.toBeNull()
    expect(t!).toBeGreaterThan(0)
  })

  it('leaves the ring phases exactly as it found them', () => {
    placePlatform(sim.state, platformById('bolt')!, 1, 2)
    placePlatform(sim.state, platformById('anchor')!, 3, 9)
    for (let i = 0; i < 37; i++) sim.tick(TICK_SECONDS)

    const before = sim.state.rings.map((r) => r.phase)
    timeToNextConjunction(sim.state)
    expect(sim.state.rings.map((r) => r.phase)).toEqual(before)
  })

  it('predicts an alignment that actually arrives', () => {
    placePlatform(sim.state, platformById('bolt')!, 1, 1)
    placePlatform(sim.state, platformById('anchor')!, 2, 7)

    const predicted = timeToNextConjunction(sim.state)
    expect(predicted).not.toBeNull()

    let fired = 0
    const ticks = Math.ceil((predicted! + 0.2) / TICK_SECONDS)
    for (let i = 0; i < ticks; i++) fired += sim.tick(TICK_SECONDS).conjunctionsFired

    expect(fired).toBeGreaterThan(0)
  })

  it('does not look past its horizon', () => {
    placePlatform(sim.state, platformById('bolt')!, 1, 0)
    placePlatform(sim.state, platformById('anchor')!, 2, 0)

    expect(timeToNextConjunction(sim.state, 0)).toBeNull()
  })

  it('ignores disabled units, which cannot participate', () => {
    const a = placePlatform(sim.state, platformById('bolt')!, 1, 0)
    placePlatform(sim.state, platformById('anchor')!, 2, 0)
    a.disabledFor = 10

    expect(findConjunctions(sim.state)).toHaveLength(0)
    expect(timeToNextConjunction(sim.state)).toBeNull()
  })
})

describe('ring periods keep alignments irregular', () => {
  it('keeps every pair of periods coprime', () => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const periods = RINGS.map((r) => r.period / 2)

    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        expect(gcd(periods[i], periods[j]), `${periods[i]}/${periods[j]}`).toBe(1)
      }
    }
  })
})
