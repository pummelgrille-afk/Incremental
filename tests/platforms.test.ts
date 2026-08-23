import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng, seedFrom } from '../src/lib/core/rng'
import { placePlatform } from '../src/lib/core/formation'
import { PLATFORMS, STARTING_PLATFORM_ID, platformById } from '../src/lib/content/platforms'
import { createCooldowns, updateSynergy } from '../src/lib/systems/synergy'
import { RINGS } from '../src/lib/content/field'
import {
  ALL_ARMOUR_CLASSES,
  ALL_DAMAGE_TYPES,
  typeMultiplier,
} from '../src/lib/content/damageTypes'
import { CONTACT } from '../src/lib/content/contacts'
import type { RingIndex, TargetingPolicy, UnitRole } from '../src/lib/entities/types'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(seedFrom(STAGE)))
})

describe('the launch roster', () => {
  it('lands inside the size PLAN.md asks for', () => {
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(8)
    expect(PLATFORMS.length).toBeLessThanOrEqual(12)
  })

  it('has no duplicate ids or names', () => {
    const ids = PLATFORMS.map((p) => p.id)
    const names = PLATFORMS.map((p) => p.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('opens with a unit that is free and resolvable', () => {
    const starter = platformById(STARTING_PLATFORM_ID)
    expect(starter, STARTING_PLATFORM_ID).toBeDefined()
    expect(starter!.unlockCost).toBe(0)
  })

  it('charges for everything else', () => {
    const free = PLATFORMS.filter((p) => p.unlockCost === 0)
    expect(free.map((p) => p.id)).toEqual([STARTING_PLATFORM_ID])
  })

  it('gives every unit something to say', () => {
    for (const p of PLATFORMS) {
      expect(p.description.length, p.id).toBeGreaterThan(20)
    }
  })
})

describe('nothing in the roster is declared-but-unused', () => {
  it('fields every UnitRole', () => {
    const roles: UnitRole[] = ['tank', 'damage', 'support', 'control']
    const present = new Set(PLATFORMS.map((p) => p.role))
    for (const role of roles) expect(present, `${role} has no unit`).toContain(role)
  })

  it('deals every DamageType', () => {
    const present = new Set(PLATFORMS.map((p) => p.damageType))
    for (const type of ALL_DAMAGE_TYPES) {
      expect(present, `${type} has no dealer`).toContain(type)
    }
  })

  it('uses every TargetingPolicy', () => {
    const policies: TargetingPolicy[] = [
      'nearest',
      'lowestHp',
      'highestThreat',
      'deepest',
      'none',
    ]
    const present = new Set(PLATFORMS.map((p) => p.targeting))
    for (const policy of policies) {
      expect(present, `${policy} has no user`).toContain(policy)
    }
  })
})

describe('every armour class has an answer', () => {
  it('gives the player a favourable type against each one a Contact wears', () => {
    const dealt = new Set(PLATFORMS.map((p) => p.damageType))
    const worn = new Set(CONTACT.map((c) => c.armour))

    for (const armour of ALL_ARMOUR_CLASSES) {
      if (!worn.has(armour)) continue
      const answered = [...dealt].some((type) => typeMultiplier(type, armour) > 1)
      expect(answered, `${armour} has no favourable counter in the roster`).toBe(true)
    }
  })
})

describe('the roles are mechanically distinct, not just labelled', () => {
  it('gives support a unit that deals no damage at all', () => {
    const pacifist = PLATFORMS.filter((p) => p.attack === 0)
    expect(pacifist.length).toBeGreaterThan(0)
    for (const p of pacifist) {
      expect(p.role, p.id).toBe('support')
      expect(p.targeting, p.id).toBe('none')

      expect(p.blockArc, p.id).toBeGreaterThan(0)
    }
  })

  it('gives control the widest reach and the longest radial reach', () => {
    const widest = [...PLATFORMS].sort((a, b) => b.angularReach - a.angularReach)[0]
    const longest = [...PLATFORMS].sort((a, b) => b.radialReach - a.radialReach)[0]
    expect(widest.role).toBe('control')
    expect(longest.role).toBe('control')
  })

  it('keeps every radial reach inside the field', () => {
    for (const p of PLATFORMS) {
      expect(p.radialReach, p.id).toBeLessThan(RINGS.length)
    }
  })
})

describe('repair', () => {
  function alignedConjunction(ids: string[]) {
    const placed = ids.map((id, i) =>
      placePlatform(sim.state, platformById(id)!, RINGS[i].index as RingIndex, 0),
    )
    for (const ring of sim.state.rings) ring.phase = 0
    return placed
  }

  it('heals every participant, not only the unit that brought it', () => {
    const [tuner, bolt] = alignedConjunction(['tuner', 'bolt'])
    tuner.hp = 10
    bolt.hp = 10

    updateSynergy(sim.state, createCooldowns())

    expect(bolt.hp).toBeGreaterThan(10)
    expect(tuner.hp).toBeGreaterThan(10)
  })

  it('never overheals past maxHp', () => {
    const [tuner, bolt] = alignedConjunction(['tuner', 'bolt'])
    bolt.hp = bolt.maxHp - 1

    updateSynergy(sim.state, createCooldowns())

    expect(bolt.hp).toBe(bolt.maxHp)
    expect(tuner.hp).toBeLessThanOrEqual(tuner.maxHp)
  })
})

describe('the unlock curve', () => {
  it('costs more than one zone can pay for', () => {
    const total = PLATFORMS.reduce((sum, p) => sum + p.unlockCost, 0)
    expect(total).toBeGreaterThan(13)
  })

  it('never charges more for a weaker unit than the free one', () => {
    const starter = platformById(STARTING_PLATFORM_ID)!
    for (const p of PLATFORMS) {
      if (p.unlockCost === 0) continue
      const betterSomewhere =
        p.maxHp > starter.maxHp ||
        p.attack > starter.attack ||
        p.defence > starter.defence ||
        p.angularReach > starter.angularReach ||
        p.radialReach > starter.radialReach ||
        p.blockArc > starter.blockArc ||
        p.conjunctionEffect.magnitude > starter.conjunctionEffect.magnitude
      expect(betterSomewhere, `${p.id} is not better than the free unit anywhere`).toBe(true)
    }
  })
})
