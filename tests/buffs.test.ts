import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { placePlatform } from '../src/lib/core/formation'
import { platformById, PLATFORMS } from '../src/lib/content/platforms'
import {
  absorb,
  attackIntervalOf,
  attackScaleOf,
  clearBuffs,
  createBonus,
  createBuffs,
  grantBonus,
  tickBonus,
  updateBuffs,
} from '../src/lib/systems/buffs'
import { damagePlatform } from '../src/lib/systems/combat'
import { createSun, grantShield } from '../src/lib/entities/Sun'
import type { ConjunctionEffect } from '../src/lib/entities/Platform'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  sim.state.contact.length = 0
  sim.state.platforms.length = 0
  sim.state.arrays.length = 0
})

describe('the stacking rule', () => {
  it('lets a stronger grant replace a weaker one', () => {
    const bonus = createBonus()
    grantBonus(bonus, 10, 5)
    grantBonus(bonus, 25, 3)

    expect(bonus.magnitude).toBe(25)
    expect(bonus.remaining).toBe(3)
  })

  it('lets a weaker grant only extend the duration', () => {
    const bonus = createBonus()
    grantBonus(bonus, 25, 3)
    grantBonus(bonus, 10, 8)

    expect(bonus.magnitude).toBe(25)
    expect(bonus.remaining).toBe(8)
  })

  it('never shortens a duration', () => {
    const bonus = createBonus()
    grantBonus(bonus, 25, 9)
    grantBonus(bonus, 10, 2)
    expect(bonus.remaining).toBe(9)
  })

  it('does not accumulate, however many times it fires', () => {
    // The whole point: conjunctions recur on a 6 s cooldown while buffs last
    // 4-5 s, so stacking would be near-permanent uptime.
    const bonus = createBonus()
    for (let i = 0; i < 20; i++) grantBonus(bonus, 40, 5)
    expect(bonus.magnitude).toBe(40)
  })

  it('refuses a negative magnitude rather than guessing', () => {
    // Debuffs need a sign-aware comparison and no content authors one yet.
    expect(() => grantBonus(createBonus(), -1, 5)).toThrow(RangeError)
  })

  it('matches the Sun shield rule exactly', () => {
    // combat-spec.md section 5 states this once; two implementations must not
    // be allowed to drift apart.
    const bonus = createBonus()
    const sun = createSun(1000)

    const grants: [number, number][] = [
      [20, 4],
      [10, 9],
      [35, 2],
      [35, 1],
    ]
    for (const [amount, duration] of grants) {
      grantBonus(bonus, amount, duration)
      grantShield(sun, amount, duration)
      expect(bonus.magnitude).toBe(sun.shield)
      expect(bonus.remaining).toBe(sun.shieldRemaining)
    }
  })
})

describe('expiry', () => {
  it('zeroes the magnitude, not just the clock', () => {
    // A lapsed buff must never be readable as a live one.
    const bonus = createBonus()
    grantBonus(bonus, 30, 1)
    tickBonus(bonus, 1.5)

    expect(bonus.remaining).toBe(0)
    expect(bonus.magnitude).toBe(0)
  })

  it('holds its full magnitude until the moment it expires', () => {
    // No decay curve: the old placeholder eroded buffs at a fixed rate that had
    // nothing to do with the authored duration.
    const bonus = createBonus()
    grantBonus(bonus, 30, 4)
    for (let i = 0; i < 3; i++) tickBonus(bonus, 1)

    expect(bonus.magnitude).toBe(30)
    expect(bonus.remaining).toBeCloseTo(1, 6)
  })

  it('ages every Platform through the simulation', () => {
    const unit = placePlatform(sim.state, platformById('anchor')!, 1, 0)
    grantBonus(unit.buffs.haste, 0.5, 1)

    updateBuffs(sim.state, 0.5)
    expect(unit.buffs.haste.magnitude).toBe(0.5)

    updateBuffs(sim.state, 0.6)
    expect(unit.buffs.haste.magnitude).toBe(0)
  })
})

describe('shields deplete through use as well as time', () => {
  it('absorbs damage from the pool', () => {
    const bonus = createBonus()
    grantBonus(bonus, 40, 5)

    expect(absorb(bonus, 15)).toBe(15)
    expect(bonus.magnitude).toBe(25)
  })

  it('absorbs no more than it holds', () => {
    const bonus = createBonus()
    grantBonus(bonus, 40, 5)
    expect(absorb(bonus, 100)).toBe(40)
    expect(bonus.magnitude).toBe(0)
  })

  it('clears its clock once spent, so a re-grant is not blocked', () => {
    // Otherwise a drained 40-shield would refuse a fresh 20-shield for the
    // remainder of its original duration.
    const bonus = createBonus()
    grantBonus(bonus, 40, 5)
    absorb(bonus, 40)
    expect(bonus.remaining).toBe(0)

    grantBonus(bonus, 20, 5)
    expect(bonus.magnitude).toBe(20)
  })

  it('protects a Platform before its HP', () => {
    const unit = placePlatform(sim.state, platformById('anchor')!, 1, 0)
    grantBonus(unit.buffs.shield, 1000, 5)
    const before = unit.hp

    damagePlatform(unit, 50)
    expect(unit.hp).toBe(before)
    expect(unit.buffs.shield.magnitude).toBeLessThan(1000)
  })
})

describe('being disabled drops everything transient', () => {
  it('clears buffs when a Platform goes down', () => {
    const unit = placePlatform(sim.state, platformById('rake')!, 1, 0)
    grantBonus(unit.buffs.haste, 0.6, 4)
    grantBonus(unit.buffs.shield, 5, 4)

    damagePlatform(unit, 10_000)

    expect(unit.disabledFor).toBeGreaterThan(0)
    expect(unit.buffs.haste.magnitude).toBe(0)
    expect(unit.buffs.shield.magnitude).toBe(0)
  })

  it('clears every channel at once', () => {
    const buffs = createBuffs()
    grantBonus(buffs.haste, 1, 5)
    grantBonus(buffs.attack, 1, 5)
    grantBonus(buffs.shield, 1, 5)
    clearBuffs(buffs)

    for (const bonus of [buffs.haste, buffs.attack, buffs.shield]) {
      expect(bonus.magnitude).toBe(0)
      expect(bonus.remaining).toBe(0)
    }
  })
})

describe('level scaling is permanent', () => {
  /**
   * Level scaling and transient buffs shared one `attackMultiplier` field until
   * Phase 18, and the buff decay ran on it every tick. A level-5 unit therefore
   * lost its entire damage bonus within a few seconds of combat. Nothing caught
   * it because everything currently runs at level 1, where the scale is 1.
   */
  it('does not decay a levelled unit back to base', () => {
    const unit = placePlatform(sim.state, platformById('bolt')!, 1, 0, 5)
    const scale = unit.levelScale
    expect(scale).toBeGreaterThan(1)

    for (let i = 0; i < 400; i++) updateBuffs(sim.state, TICK_SECONDS)

    expect(unit.levelScale).toBe(scale)
    expect(attackScaleOf(unit)).toBeCloseTo(scale, 10)
  })

  it('multiplies level, formation and buffs together', () => {
    const unit = placePlatform(sim.state, platformById('bolt')!, 1, 0, 3)
    unit.bonuses.attack = 0.1
    grantBonus(unit.buffs.attack, 0.5, 5)

    expect(attackScaleOf(unit)).toBeCloseTo(unit.levelScale * 1.1 * 1.5, 10)
  })

  it('divides the attack interval by haste', () => {
    const unit = placePlatform(sim.state, platformById('bolt')!, 1, 0)
    expect(attackIntervalOf(unit)).toBe(unit.def.baseInterval)

    grantBonus(unit.buffs.haste, 1, 5)
    expect(attackIntervalOf(unit)).toBeCloseTo(unit.def.baseInterval / 2, 10)
  })
})

describe('content integrity', () => {
  it('gives every conjunction effect kind at least one live user', () => {
    // A kind with no content using it is untested configuration — which is why
    // `repair` was removed in Phase 18 rather than left as an unreachable
    // branch, and why Phase 29 brought it back with the Tuner instead of on its
    // own. Asserted against the type's own union so that declaring a fifth kind
    // and forgetting to author a unit for it fails here.
    const kinds = new Set(PLATFORMS.map((m) => m.conjunctionEffect.kind))
    const declared: ConjunctionEffect['kind'][] = [
      'damagePulse',
      'shield',
      'haste',
      'repair',
    ]
    for (const kind of declared) expect(kinds, `${kind} has no user`).toContain(kind)
  })

  it('gives every timed effect a duration, and instant effects none', () => {
    // damagePulse and repair resolve on the spot; shield and haste are carried
    // as timed bonuses and are meaningless without a duration.
    const instant = new Set(['damagePulse', 'repair'])
    for (const def of PLATFORMS) {
      const effect = def.conjunctionEffect
      if (instant.has(effect.kind)) {
        expect(effect.duration, `${def.id} resolves instantly`).toBeUndefined()
      } else {
        expect(effect.duration, `${def.id} needs a duration`).toBeGreaterThan(0)
      }
    }
  })
})
