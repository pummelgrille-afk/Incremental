import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { CONTACT, contactById, contactsOfTier } from '../src/lib/content/contacts'
import { PATTERNS, patternById, MIN_TELEGRAPH_MS } from '../src/lib/systems/patterns'
import { ZONES } from '../src/lib/content/zones'
import { escorted, guarded } from '../src/lib/content/waves'
import { ALL_ARMOUR_CLASSES } from '../src/lib/content/damageTypes'
import { createContact, updateWards } from '../src/lib/systems/spawn'
import { placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { RINGS } from '../src/lib/content/field'
import { directWave, overLevelBonus } from '../src/lib/systems/scaling'
import { isBossWave } from '../src/lib/entities/Wave'
import { damageContact } from '../src/lib/systems/combat'
import type { ContactInstance, ContactTier } from '../src/lib/entities/Contact'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'
const TIERS: ContactTier[] = ['basic', 'elite', 'specialist']

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  sim.state.contact.length = 0
  sim.state.platforms.length = 0
  sim.state.arrays.length = 0
})

function place(defId: string, x: number, y: number, hp?: number): ContactInstance {
  const c = createContact(sim.state, contactById(defId)!, { x, y })
  c.velocity = { x: 0, y: 0 }
  if (hp !== undefined) c.hp = hp
  sim.state.contact.push(c)
  return c
}

describe('the tiered roster', () => {
  it('fills all three tiers', () => {
    for (const tier of TIERS) {
      expect(contactsOfTier(tier).length, `${tier} is empty`).toBeGreaterThan(0)
    }
  })

  it('has no duplicate ids or names', () => {
    const ids = CONTACT.map((c) => c.id)
    const names = CONTACT.map((c) => c.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives each Contact its own pattern', () => {
    const used = CONTACT.map((c) => c.patternId)
    expect(new Set(used).size, 'a pattern is used twice').toBe(used.length)
  })

  it('points every Contact at a pattern that exists', () => {
    for (const c of CONTACT) {
      expect(patternById(c.patternId), `${c.id} -> ${c.patternId}`).toBeDefined()
    }
  })

  it('warns before every pattern, above the floor', () => {
    for (const p of PATTERNS) {
      expect(p.telegraphMs, p.id).toBeGreaterThanOrEqual(MIN_TELEGRAPH_MS)
    }
  })

  it('spreads every armour class across more than one tier', () => {
    for (const armour of ALL_ARMOUR_CLASSES) {
      const tiers = new Set(CONTACT.filter((c) => c.armour === armour).map((c) => c.tier))
      expect(tiers.size, `${armour} appears in only ${[...tiers].join(', ')}`).toBeGreaterThan(1)
    }
  })

  it('makes each tier tougher than the one below on average', () => {
    const meanHp = (tier: ContactTier) => {
      const of = contactsOfTier(tier)
      return of.reduce((n, c) => n + c.maxHp, 0) / of.length
    }
    expect(meanHp('elite')).toBeGreaterThan(meanHp('basic'))
    expect(meanHp('specialist')).toBeGreaterThan(meanHp('basic'))
  })
})

describe('the zone roster is checked against the waves', () => {
  it('declares every Contact its waves actually spawn', () => {
    for (const zone of ZONES) {
      const pool = new Set(zone.enemyPool)
      for (const stage of zone.stages) {
        for (const wave of stage.waves) {
          if (isBossWave(wave)) continue
          for (const group of wave.groups) {
            expect(pool.has(group.defId), `${zone.id} spawns ${group.defId}`).toBe(true)
          }
        }
      }
    }
  })

  it('lists only Contacts that exist', () => {
    for (const zone of ZONES) {
      for (const id of zone.enemyPool) {
        expect(contactById(id), `${zone.id} lists ${id}`).toBeDefined()
      }
    }
  })

  it('reaches every authored Contact somewhere', () => {
    const reachable = new Set(ZONES.flatMap((z) => z.enemyPool))
    for (const c of CONTACT) {
      expect(reachable.has(c.id), `${c.id} is in no zone`).toBe(true)
    }
  })
})

describe('the over-level bonus adds bodies, not set pieces', () => {
  it('scales a basic group and leaves elites and specialists alone', () => {
    const bolt = platformById('bolt')!
    for (const ring of RINGS) {
      for (let slot = 0; slot < ring.slots; slot++) {
        placePlatform(sim.state, bolt, ring.index, slot)
      }
    }

    const wave = {
      groups: [
        { defId: 'skiff', count: 10, delay: 0, interval: 0.4 },
        { defId: 'shell', count: 2, delay: 4, interval: 1.2 },
        { defId: 'warden', count: 2, delay: 6, interval: 1.2 },
      ],
      gapAfter: 4,
    }

    expect(
      overLevelBonus(sim.state, wave),
      'this fixture needs a live bonus to mean anything',
    ).toBeGreaterThan(0)

    const byId = new Map(directWave(sim.state, wave).groups.map((g) => [g.defId, g.count]))

    expect(byId.get('skiff')!).toBeGreaterThan(10)
    expect(byId.get('shell')).toBe(2)
    expect(byId.get('warden')).toBe(2)
  })

  it('still applies the stage scaling curve to every tier', () => {
    const wave = { groups: [{ defId: 'shell', count: 4, delay: 0, interval: 1 }], gapAfter: 4 }
    const shallow = directWave(sim.state, wave).groups[0].count

    const deep = new Simulation(
      loadStage('service-floor:noted-in-the-log' as StageAddress),
      createRng(1),
    )
    const deepCount = directWave(deep.state, wave).groups[0].count

    expect(deepCount).toBeGreaterThan(shallow)
  })
})

describe('a Warden shields what is near it', () => {
  const damageTo = (c: ContactInstance) => {
    const before = c.hp
    damageContact(c, 10)
    return before - c.hp
  }

  it('softens hits on a neighbour inside its radius', () => {
    place('warden', 100, 0)
    const near = place('skiff', 130, 0)

    updateWards(sim.state)

    expect(near.damageScale).toBeLessThan(1)
    expect(damageTo(near)).toBeLessThan(10)
  })

  it('leaves anything outside the radius alone', () => {
    place('warden', 100, 0)
    const far = place('skiff', 400, 0)

    updateWards(sim.state)

    expect(far.damageScale).toBe(1)
    expect(damageTo(far)).toBe(10)
  })

  it('never shields itself', () => {
    const warden = place('warden', 100, 0)

    updateWards(sim.state)

    expect(warden.damageScale).toBe(1)
  })

  it('stops shielding once it is dead', () => {
    const warden = place('warden', 100, 0)
    const near = place('skiff', 120, 0)
    warden.hp = 0

    updateWards(sim.state)

    expect(near.damageScale).toBe(1)
  })

  it('stacks multiplicatively, so overlapping Wardens never reach immunity', () => {
    place('warden', 100, 0)
    place('warden', 110, 0)
    place('warden', 105, 10)
    const near = place('skiff', 105, 0)

    updateWards(sim.state)

    expect(near.damageScale).toBeGreaterThan(0)
    expect(damageTo(near)).toBeGreaterThan(0)
  })

  it('clears the scale when the Warden is gone', () => {
    place('warden', 100, 0)
    const near = place('skiff', 120, 0)
    updateWards(sim.state)
    expect(near.damageScale).toBeLessThan(1)

    sim.state.contact = sim.state.contact.filter((c) => c.def.id !== 'warden')
    updateWards(sim.state)

    expect(near.damageScale).toBe(1)
  })

  it('is the highest-threat Contact in the roster', () => {
    const top = [...CONTACT].sort((a, b) => b.threatWeight - a.threatWeight)[0]
    expect(top.id).toBe('warden')
  })

  it('is the only Contact that wards', () => {
    const warders = CONTACT.filter((c) => c.traits?.wardsNearby)
    expect(warders.map((c) => c.id)).toEqual(['warden'])
  })
})

describe('the guarded wave shape', () => {
  it('sends the guard in with the bulk, not behind it', () => {
    const wave = guarded('skiff', 12, 'warden', 2)
    const [bulk, guard] = wave.groups

    expect(guard.delay).toBe(bulk.delay)
    expect(guard.arc).toEqual(bulk.arc)
    expect(bulk.arc, 'both need a shared bearing, not a random one').toBeDefined()
  })

  it('stays distinct from escorted, which delays on purpose', () => {
    const e = escorted('skiff', 12, 'lance', 2)
    expect(e.groups[1].delay).toBeGreaterThan(e.groups[0].delay)
  })
})

describe('warding is wired into the tick', () => {
  it('applies over real simulated time, not just when called directly', () => {
    place('warden', 100, 0)
    const near = place('skiff', 120, 0)

    sim.tick(TICK_SECONDS)

    expect(near.damageScale).toBeLessThan(1)
  })
})
