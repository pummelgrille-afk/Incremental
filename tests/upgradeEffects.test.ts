import { describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { placeMovement } from '../src/lib/core/formation'
import { movementById } from '../src/lib/content/allies'
import { slackById } from '../src/lib/content/enemies'
import { createSlack } from '../src/lib/systems/spawn'
import { updateMovements } from '../src/lib/systems/ai'
import { damageMovement, resolveMovementAttacks } from '../src/lib/systems/combat'
import { updateProjectiles } from '../src/lib/systems/collision'
import { createCooldowns, findConjunctions, updateSynergy } from '../src/lib/systems/synergy'
import { attackIntervalOf, attackScaleOf } from '../src/lib/systems/buffs'
import { repairCost } from '../src/lib/progression/currencies'
import { RINGS } from '../src/lib/content/field'
import { noUpgradeEffects, type UpgradeEffects } from '../src/lib/entities/Upgrade'
import type { SimulationState } from '../src/lib/core/simulation'
import type { Projectile } from '../src/lib/entities/Projectile'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'escapement-floor:first-shift'

/**
 * Every effect kind, exercised against the system that consumes it.
 *
 * The tree is worth nothing if its numbers stop at the save file. These are the
 * tests that would fail if a wiring were dropped — the branch-identity and
 * content-integrity checks in `upgradeTree.test.ts` would not notice.
 */

function build(effects: Partial<UpgradeEffects> = {}) {
  const sim = new Simulation(
    loadStage(STAGE, { effects: { ...noUpgradeEffects(), ...effects } }),
    createRng(1),
  )
  sim.state.slack.length = 0
  sim.state.movements.length = 0
  sim.state.chimes.length = 0
  return sim
}

function slackAt(state: SimulationState, defId: string, x: number, y: number) {
  const s = createSlack(state, slackById(defId)!, { x, y })
  s.velocity = { x: 0, y: 0 }
  s.hp = 1e9
  s.maxHp = 1e9
  state.slack.push(s)
  return s
}

function slackProjectile(sim: Simulation, x: number, y: number, damage = 25): Projectile {
  const p = sim.projectiles.acquire()!
  p.faction = 'slack'
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
  p.sourceDefId = 'burr'
  return p
}

describe('Winding reaches combat', () => {
  it('raises the attack multiplier', () => {
    const bare = build()
    const boosted = build({ attack: 0.5 })
    const a = placeMovement(bare.state, movementById('hammer')!, 2, 0)
    const b = placeMovement(boosted.state, movementById('hammer')!, 2, 0)

    expect(attackScaleOf(b, boosted.state.effects)).toBeCloseTo(
      attackScaleOf(a, bare.state.effects) * 1.5,
      10,
    )
  })

  it('deals more damage in a real exchange', () => {
    const damageDealt = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      placeMovement(sim.state, movementById('hammer')!, 2, 0)
      const target = slackAt(sim.state, 'burr', RINGS[1].radius, 0)

      const attacks = updateMovements(sim.state, TICK_SECONDS)
      resolveMovementAttacks(sim.state, attacks)
      return 1e9 - target.hp
    }

    expect(damageDealt({ attack: 0.5 })).toBeGreaterThan(damageDealt({}))
  })

  it('shortens the attack interval through haste', () => {
    const sim = build({ haste: 1 })
    const unit = placeMovement(sim.state, movementById('hammer')!, 2, 0)

    expect(attackIntervalOf(unit, sim.state.effects)).toBeCloseTo(
      unit.def.baseInterval / 2,
      10,
    )
  })

  it('stacks tree haste additively with a conjunction buff', () => {
    // Additive, not multiplicative — the same argument the buff stacking rule
    // makes. Two sources of the same thing must not compound.
    const sim = build({ haste: 0.5 })
    const unit = placeMovement(sim.state, movementById('hammer')!, 2, 0)
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
      placeMovement(sim.state, movementById('hammer')!, 1, 0)
      placeMovement(sim.state, movementById('detent')!, 2, 0)
      const target = slackAt(sim.state, 'burr', 200, 0)

      updateSynergy(sim.state, createCooldowns())
      return 1e9 - target.hp
    }

    expect(pulse({ conjunctionPotency: 0.5 })).toBeGreaterThan(pulse({}))
  })
})

describe('Bracing reaches defence', () => {
  it('adds Tension to the stage base', () => {
    expect(build({ tension: 250 }).state.mainspring.maxHp).toBe(
      build().state.mainspring.maxHp + 250,
    )
  })

  it('reduces damage taken', () => {
    const taken = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      const unit = placeMovement(sim.state, movementById('detent')!, 1, 0)
      const before = unit.hp
      damageMovement(unit, 60, null, sim.state.effects)
      return before - unit.hp
    }

    expect(taken({ defence: 1 })).toBeLessThan(taken({}))
  })

  it('widens the block arc', () => {
    // A projectile just outside a Pallet's narrow arc, which the widened one
    // catches. Pallet's blockArc is 9 degrees; the offset sits past it.
    const blocked = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      const unit = placeMovement(sim.state, movementById('pallet')!, 2, 0)
      const angle = 14 * (Math.PI / 180)
      const p = slackProjectile(
        sim,
        Math.cos(angle) * RINGS[1].radius,
        Math.sin(angle) * RINGS[1].radius,
      )
      void p
      return updateProjectiles(sim.state, sim.projectiles, TICK_SECONDS).movementHits
    }

    expect(blocked({})).toBe(0)
    expect(blocked({ blockArc: (8 * Math.PI) / 180 })).toBe(1)
  })
})

describe('Regulation reaches reach', () => {
  it('grants whole extra Beat charges, and raises the maximum', () => {
    const sim = build({ beatCharges: 2 })
    expect(sim.state.beat.maxCharge).toBe(build().state.beat.maxCharge + 2)
    expect(sim.state.beat.charge).toBe(sim.state.beat.maxCharge)
  })

  it('ignores a fractional charge rather than granting a partial one', () => {
    // A charge is spendable or it is not; 1.5 charges would be a lie.
    expect(build({ beatCharges: 1.9 }).state.beat.maxCharge).toBe(
      build().state.beat.maxCharge + 1,
    )
  })

  it('widens the blast radius', () => {
    const hits = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      const target = slackAt(sim.state, 'burr', 50, 0)
      sim.strike(0, 0)
      return 1e9 - target.hp
    }

    // 50 px out is beyond the 44 px base radius, inside a widened one.
    expect(hits({})).toBe(0)
    expect(hits({ beatRadius: 20 })).toBeGreaterThan(0)
  })

  it('widens the conjunction tolerance window', () => {
    // Two units offset by more than the 6 degree base window. Only the widened
    // tolerance sees them as aligned.
    const aligned = (effects: Partial<UpgradeEffects>) => {
      const sim = build(effects)
      placeMovement(sim.state, movementById('hammer')!, 1, 0)
      placeMovement(sim.state, movementById('detent')!, 2, 0)
      // Ring 2 slot 0 sits at angle 0; nudge its phase past the base window.
      sim.state.rings[1].phase = 8 * (Math.PI / 180)
      return findConjunctions(sim.state).length
    }

    expect(aligned({})).toBe(0)
    expect(aligned({ conjunctionTolerance: (4 * Math.PI) / 180 })).toBe(1)
  })
})

describe('Salvage reaches the economy', () => {
  it('discounts emergency repair', () => {
    expect(repairCost(0, 0.5)).toBeLessThan(repairCost(0, 0))
  })

  it('never makes repair free, however deep the branch goes', () => {
    // economy-spec invariant 6: repair is a panic button, not a strategy. A
    // free one would stop being either.
    expect(repairCost(0, 5)).toBeGreaterThan(0)
    expect(repairCost(3, 1)).toBeGreaterThan(0)
  })

  it('quotes the discount through the simulation', () => {
    const sim = build({ repairCost: 0.5 })
    sim.state.mainspring.hp = 100

    const bare = build()
    bare.state.mainspring.hp = 100

    expect(sim.repairMainspring().cost).toBeLessThan(bare.repairMainspring().cost)
  })
})

describe('a neutral tree changes nothing', () => {
  it('produces an identical run to no tree at all', () => {
    // The strongest guarantee available: threading effects everywhere must not
    // perturb a run that has bought nothing.
    const withEffects = new Simulation(
      loadStage(STAGE, { effects: noUpgradeEffects() }),
      createRng(5),
    )
    const without = new Simulation(loadStage(STAGE), createRng(5))

    for (const sim of [withEffects, without]) {
      placeMovement(sim.state, movementById('hammer')!, 2, 0)
      placeMovement(sim.state, movementById('detent')!, 1, 0)
    }

    for (let i = 0; i < 600; i++) {
      withEffects.tick(TICK_SECONDS)
      without.tick(TICK_SECONDS)
    }

    expect(withEffects.state.mainspring.hp).toBe(without.state.mainspring.hp)
    expect(withEffects.totalSlackKilled).toBe(without.totalSlackKilled)
    expect(withEffects.totalConjunctions).toBe(without.totalConjunctions)
  })
})
