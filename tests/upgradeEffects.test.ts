import { describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { contactById } from '../src/lib/content/contacts'
import { createContact } from '../src/lib/systems/spawn'
import { updatePlatforms } from '../src/lib/systems/ai'
import { damagePlatform, resolvePlatformAttacks } from '../src/lib/systems/combat'
import { updateProjectiles } from '../src/lib/systems/collision'
import { createCooldowns, findConjunctions, updateSynergy } from '../src/lib/systems/synergy'
import { attackIntervalOf, attackScaleOf } from '../src/lib/systems/buffs'
import { repairCost } from '../src/lib/progression/currencies'
import { RINGS } from '../src/lib/content/field'
import { noUpgradeEffects, type UpgradeEffects } from '../src/lib/entities/Upgrade'
import type { SimulationState } from '../src/lib/core/simulation'
import type { Projectile } from '../src/lib/entities/Projectile'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

function build(effects: Partial<UpgradeEffects> = {}) {
  const sim = new Simulation(
    loadStage(STAGE, { effects: { ...noUpgradeEffects(), ...effects } }),
    createRng(1),
  )
  sim.state.contact.length = 0
  sim.state.platforms.length = 0
  sim.state.arrays.length = 0
  return sim
}

function contactAt(state: SimulationState, defId: string, x: number, y: number) {
  const s = createContact(state, contactById(defId)!, { x, y })
  s.velocity = { x: 0, y: 0 }
  s.hp = 1e9
  s.maxHp = 1e9
  state.contact.push(s)
  return s
}

function contactProjectile(sim: Simulation, x: number, y: number, damage = 25): Projectile {
  const p = sim.projectiles.acquire()!
  p.faction = 'contact'
  p.position.x = x
  p.position.y = y
  p.velocity.x = 0
  p.velocity.y = 0
  p.damage = damage
  p.damageType = 'percussive'
  p.radius = 3.5
  p.lifetime = 99
  p.angularVelocity = 0
  p.sourceId = -1
  p.sourceDefId = 'skiff'
  return p
}

describe('Winding reaches combat', () => {
  it('raises the attack multiplier', () => {
    const bare = build()
    const boosted = build({ attack: 0.5 })
    const a = placePlatform(bare.state, platformById('bolt')!, 2, 0)
    const b = placePlatform(boosted.state, platformById('bolt')!, 2, 0)

    expect(attackScaleOf(b, boosted.state.effects)).toBeCloseTo(
      attackScaleOf(a, bare.state.effects) * 1.5,
      10,
    )
  })

  it('deals more damage in a real exchange', () => {
    const damageDealt = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      placePlatform(sim.state, platformById('bolt')!, 2, 0)
      const target = contactAt(sim.state, 'skiff', RINGS[1].radius, 0)

      const attacks = updatePlatforms(sim.state, TICK_SECONDS)
      resolvePlatformAttacks(sim.state, attacks)
      return 1e9 - target.hp
    }

    expect(damageDealt({ attack: 0.5 })).toBeGreaterThan(damageDealt({}))
  })

  it('shortens the attack interval through haste', () => {
    const sim = build({ haste: 1 })
    const unit = placePlatform(sim.state, platformById('bolt')!, 2, 0)

    expect(attackIntervalOf(unit, sim.state.effects)).toBeCloseTo(
      unit.def.baseInterval / 2,
      10,
    )
  })

  it('stacks tree haste additively with a conjunction buff', () => {
    const sim = build({ haste: 0.5 })
    const unit = placePlatform(sim.state, platformById('bolt')!, 2, 0)
    unit.buffs.haste.magnitude = 0.5
    unit.buffs.haste.remaining = 5

    expect(attackIntervalOf(unit, sim.state.effects)).toBeCloseTo(
      unit.def.baseInterval / 2,
      10,
    )
  })

  it('raises conjunction potency', () => {
    const pulse = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      placePlatform(sim.state, platformById('bolt')!, 1, 0)
      placePlatform(sim.state, platformById('anchor')!, 2, 0)
      const target = contactAt(sim.state, 'skiff', 200, 0)

      updateSynergy(sim.state, createCooldowns())
      return 1e9 - target.hp
    }

    expect(pulse({ conjunctionPotency: 0.5 })).toBeGreaterThan(pulse({}))
  })
})

describe('Bracing reaches defence', () => {
  it('adds Output to the stage base', () => {
    expect(build({ output: 250 }).state.sun.maxHp).toBe(
      build().state.sun.maxHp + 250,
    )
  })

  it('reduces damage taken', () => {
    const taken = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      const unit = placePlatform(sim.state, platformById('anchor')!, 1, 0)
      const before = unit.hp
      damagePlatform(unit, 60, null, sim.state.effects)
      return before - unit.hp
    }

    expect(taken({ defence: 1 })).toBeLessThan(taken({}))
  })

  it('widens the block arc', () => {
    const blocked = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      const unit = placePlatform(sim.state, platformById('rake')!, 2, 0)
      const angle = 14 * (Math.PI / 180)
      const p = contactProjectile(
        sim,
        Math.cos(angle) * RINGS[1].radius,
        Math.sin(angle) * RINGS[1].radius,
      )
      void p
      return updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS).platformHits
    }

    expect(blocked({})).toBe(0)
    expect(blocked({ blockArc: (8 * Math.PI) / 180 })).toBe(1)
  })
})

describe('Regulation reaches reach', () => {
  it('grants whole extra Flare charges, and raises the maximum', () => {
    const sim = build({ flareCharges: 2 })
    expect(sim.state.flare.maxCharge).toBe(build().state.flare.maxCharge + 2)
    expect(sim.state.flare.charge).toBe(sim.state.flare.maxCharge)
  })

  it('ignores a fractional charge rather than granting a partial one', () => {
    expect(build({ flareCharges: 1.9 }).state.flare.maxCharge).toBe(
      build().state.flare.maxCharge + 1,
    )
  })

  it('widens the blast radius', () => {
    const hits = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      const target = contactAt(sim.state, 'skiff', 50, 0)
      sim.strike(0, 0)
      return 1e9 - target.hp
    }

    expect(hits({})).toBe(0)
    expect(hits({ flareRadius: 20 })).toBeGreaterThan(0)
  })

  it('widens the conjunction tolerance window', () => {
    const aligned = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      placePlatform(sim.state, platformById('bolt')!, 1, 0)
      placePlatform(sim.state, platformById('anchor')!, 2, 0)

      sim.state.rings[1].phase = 8 * (Math.PI / 180)
      return findConjunctions(sim.state).length
    }

    expect(aligned({})).toBe(0)
    expect(aligned({ conjunctionTolerance: (4 * Math.PI) / 180 })).toBe(1)
  })
})

describe('Recovery reaches the economy', () => {
  it('discounts emergency repair', () => {
    expect(repairCost(0, 0.5)).toBeLessThan(repairCost(0, 0))
  })

  it('never makes repair free, however deep the branch goes', () => {
    expect(repairCost(0, 5)).toBeGreaterThan(0)
    expect(repairCost(3, 1)).toBeGreaterThan(0)
  })

  it('quotes the discount through the simulation', () => {
    const sim = build({ repairCost: 0.5 })
    sim.state.sun.hp = 100

    const bare = build()
    bare.state.sun.hp = 100

    expect(sim.repairSun().cost).toBeLessThan(bare.repairSun().cost)
  })
})

describe('a neutral tree changes nothing', () => {
  it('produces an identical run to no tree at all', () => {
    const withEffects = new Simulation(
      loadStage(STAGE, { effects: noUpgradeEffects() }),
      createRng(5),
    )
    const without = new Simulation(loadStage(STAGE), createRng(5))

    for (const sim of [withEffects, without]) {
      placePlatform(sim.state, platformById('bolt')!, 2, 0)
      placePlatform(sim.state, platformById('anchor')!, 1, 0)
    }

    for (let i = 0; i < 600; i++) {
      withEffects.tick(TICK_SECONDS)
      without.tick(TICK_SECONDS)
    }

    expect(withEffects.state.sun.hp).toBe(without.state.sun.hp)
    expect(withEffects.totalContactKilled).toBe(without.totalContactKilled)
    expect(withEffects.totalConjunctions).toBe(without.totalConjunctions)
  })
})
