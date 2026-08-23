import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { mountArray, placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { arrayById } from '../src/lib/content/arrays'
import { contactById } from '../src/lib/content/contacts'
import { createContact } from '../src/lib/systems/spawn'
import {
  angleDelta,
  arrayPosition,
  platformPosition,
  threatOf,
  updateArrays,
  updatePlatforms,
} from '../src/lib/systems/ai'
import { deepestContactPoint } from '../src/lib/systems/ai'
import { RINGS } from '../src/lib/content/field'
import { findConjunctions } from '../src/lib/systems/synergy'
import { grantBonus } from '../src/lib/systems/buffs'
import type { PlatformDef } from '../src/lib/entities/Platform'
import type { TargetingPolicy } from '../src/lib/entities/types'
import type { ContactInstance } from '../src/lib/entities/Contact'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))

  sim.state.contact.length = 0
})

function contactAt(defId: string, radius: number, angle = 0): ContactInstance {
  const instance = createContact(sim.state, contactById(defId)!, {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  })
  instance.velocity = { x: 0, y: 0 }
  sim.state.contact.push(instance)
  return instance
}

function defender(policy: TargetingPolicy, ring: 1 | 2 | 3 = 2, base = 'bolt') {
  const def: PlatformDef = {
    ...platformById(base)!,
    targeting: policy,

    angularReach: Math.PI / 2,
    radialReach: 1,
  }
  return placePlatform(sim.state, def, ring, 0)
}

describe('angleDelta', () => {
  it('returns the shortest signed angle', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10)
    expect(angleDelta(Math.PI / 2, 0)).toBeCloseTo(-Math.PI / 2, 10)
  })

  it('wraps across the seam rather than going the long way', () => {
    expect(angleDelta((350 * Math.PI) / 180, (10 * Math.PI) / 180)).toBeCloseTo(
      (20 * Math.PI) / 180,
      10,
    )
  })
})

describe('threat', () => {
  it('rises as a Contact nears the Sun', () => {
    const far = contactAt('skiff', 320)
    const near = contactAt('skiff', 40)
    expect(threatOf(near)).toBeGreaterThan(threatOf(far))
  })

  it('accounts for how dangerous the Contact is, not only where it is', () => {
    const weak = contactAt('skiff', 200)
    const strong = contactAt('lance', 200)
    expect(threatOf(strong)).toBeGreaterThan(threatOf(weak))
  })
})

describe('targeting policies', () => {
  it('nearest picks the closest to the unit, not to the centre', () => {
    const unit = defender('nearest', 2)
    const origin = platformPosition(sim.state, unit)
    expect(origin.x).toBeCloseTo(RINGS[1].radius, 6)

    const inner = contactAt('skiff', 130)
    contactAt('skiff', 240)

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(inner.id)
  })

  it('lowestHp picks the weakest, regardless of distance', () => {
    const unit = defender('lowestHp', 2)
    contactAt('skiff', 130)
    const wounded = contactAt('skiff', 240)
    wounded.hp = 1

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(wounded.id)
  })

  it('deepest picks whatever is closest to the Sun', () => {
    const unit = defender('deepest', 2)
    const deep = contactAt('skiff', 125)
    contactAt('skiff', 200)

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(deep.id)
  })

  it('highestThreat prefers a dangerous Contact over a merely close one', () => {
    const unit = defender('highestThreat', 2)
    const harmless = contactAt('skiff', 130)
    const dangerous = contactAt('lance', 200)

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(threatOf(dangerous)).toBeGreaterThan(threatOf(harmless))
    expect(unit.targetId).toBe(dangerous.id)
  })

  it('none never attacks and never acquires a target', () => {
    const unit = defender('none', 2)
    contactAt('skiff', 160)

    const attacks = updatePlatforms(sim.state, TICK_SECONDS)
    expect(attacks).toHaveLength(0)
    expect(unit.targetId).toBeNull()
  })
})

describe('annular reach', () => {
  it('ignores a Contact outside the angular arc', () => {
    const def: PlatformDef = {
      ...platformById('bolt')!,
      angularReach: (10 * Math.PI) / 180,
      radialReach: 1,
    }
    const unit = placePlatform(sim.state, def, 2, 0)

    contactAt('skiff', 160, Math.PI)

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBeNull()
  })

  it('ignores a Contact beyond its outward reach', () => {
    const unit = defender('nearest', 1)

    contactAt('skiff', 320)

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBeNull()
  })

  it('does not let an outer ring strike a Contact that reached the centre', () => {
    const outer = defender('nearest', 3)
    contactAt('skiff', 35)

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(outer.targetId).toBeNull()
  })

  it('lets the innermost ring defend everything inside it', () => {
    const inner = defender('nearest', 1)
    const arrived = contactAt('skiff', 35)

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(inner.targetId).toBe(arrived.id)
  })

  it('gives an outer ring a wider arc length for the same angular reach', () => {
    const reach = (30 * Math.PI) / 180
    expect(reach * RINGS[2].radius).toBeGreaterThan(reach * RINGS[0].radius)
  })
})

describe('attack timing', () => {
  it('fires once, then waits out the cooldown', () => {
    const unit = defender('nearest', 2)
    const target = contactAt('skiff', 160)
    target.hp = 10_000

    const first = updatePlatforms(sim.state, TICK_SECONDS)
    expect(first).toHaveLength(1)

    const second = updatePlatforms(sim.state, TICK_SECONDS)
    expect(second).toHaveLength(0)
  })

  it('fires again once the interval elapses', () => {
    const unit = defender('nearest', 2)
    const target = contactAt('skiff', 160)
    target.hp = 10_000

    updatePlatforms(sim.state, TICK_SECONDS)
    const ticks = Math.ceil(unit.def.baseInterval / TICK_SECONDS) + 1
    let fired = 0
    for (let i = 0; i < ticks; i++) {
      fired += updatePlatforms(sim.state, TICK_SECONDS).length
    }
    expect(fired).toBeGreaterThanOrEqual(1)
  })

  it('attacks faster with haste', () => {
    const slow = defender('nearest', 2)
    const target = contactAt('skiff', 160)
    target.hp = 10_000

    updatePlatforms(sim.state, TICK_SECONDS)
    const withoutHaste = slow.cooldownRemaining

    slow.cooldownRemaining = 0
    grantBonus(slow.buffs.haste, 1, 4)
    updatePlatforms(sim.state, TICK_SECONDS)
    expect(slow.cooldownRemaining).toBeLessThan(withoutHaste)
  })

  it('does not act while disabled, and recovers at full health', () => {
    const unit = defender('nearest', 2)
    contactAt('skiff', 160)
    unit.disabledFor = 1
    unit.hp = 0

    expect(updatePlatforms(sim.state, TICK_SECONDS)).toHaveLength(0)

    for (let i = 0; i < 25; i++) updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.disabledFor).toBe(0)
    expect(unit.hp).toBe(unit.maxHp)
  })
})

describe('re-targeting', () => {
  it('keeps its target while that target remains valid', () => {
    const unit = defender('nearest', 2)
    const first = contactAt('skiff', 160)
    first.hp = 10_000

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(first.id)

    contactAt('skiff', 155)
    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(first.id)
  })

  it('switches when the current target leaves reach', () => {
    const unit = defender('nearest', 2)
    const first = contactAt('skiff', 160)
    first.hp = 10_000
    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(first.id)

    first.position.x = 5000
    const replacement = contactAt('skiff', 160)

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(replacement.id)
  })

  it('drops its target when nothing is in reach', () => {
    const unit = defender('nearest', 2)
    const only = contactAt('skiff', 160)
    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(only.id)

    sim.state.contact.length = 0
    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBeNull()
  })
})

describe('Arrays', () => {
  it('reach the whole field, unlike Platforms', () => {
    const array = mountArray(sim.state, arrayById('long-baseline')!, 0)
    const distant = contactAt('skiff', 40, Math.PI)

    const shots = updateArrays(sim.state, TICK_SECONDS)
    expect(shots).toHaveLength(1)
    expect(shots[0].target.id).toBe(distant.id)
    void array
  })

  it('spend a charge per shot and fall silent at zero', () => {
    const array = mountArray(sim.state, arrayById('long-baseline')!, 0)
    const target = contactAt('skiff', 200)
    target.hp = 10_000

    updateArrays(sim.state, TICK_SECONDS)
    expect(array.charge).toBeLessThan(array.def.maxCharge)

    array.charge = 0
    array.cooldownRemaining = 0
    expect(updateArrays(sim.state, TICK_SECONDS)).toHaveLength(0)
  })

  it('regenerate charge over time', () => {
    const array = mountArray(sim.state, arrayById('long-baseline')!, 0)
    array.charge = 0

    const ticks = Math.ceil(array.def.chargeInterval / TICK_SECONDS)
    for (let i = 0; i < ticks; i++) updateArrays(sim.state, TICK_SECONDS)

    expect(array.charge).toBeCloseTo(1, 6)

    updateArrays(sim.state, TICK_SECONDS)
    expect(array.charge).toBeGreaterThanOrEqual(1)
  })

  it('lead a moving target rather than aiming where it is', () => {
    const array = mountArray(sim.state, arrayById('long-baseline')!, 0)
    const mover = contactAt('skiff', 200, Math.PI / 2)
    mover.velocity = { x: 120, y: 0 }

    const shots = updateArrays(sim.state, TICK_SECONDS)
    expect(shots).toHaveLength(1)

    expect(shots[0].aimPoint.x).toBeGreaterThan(mover.position.x)
    void array
  })

  it('aim where a stationary target already is', () => {
    mountArray(sim.state, arrayById('long-baseline')!, 0)
    const still = contactAt('skiff', 200)

    const shots = updateArrays(sim.state, TICK_SECONDS)
    expect(shots[0].aimPoint.x).toBeCloseTo(still.position.x, 6)
    expect(shots[0].aimPoint.y).toBeCloseTo(still.position.y, 6)
  })

  it('sit on the static rim, so their position never changes', () => {
    const array = mountArray(sim.state, arrayById('long-baseline')!, 3)
    const before = arrayPosition(array)
    for (let i = 0; i < 100; i++) sim.tick(TICK_SECONDS)
    expect(arrayPosition(array)).toEqual(before)
  })
})

describe('rotation moves reach with the unit', () => {
  it('brings a Contact into range as the ring turns', () => {
    const def: PlatformDef = {
      ...platformById('bolt')!,
      angularReach: (20 * Math.PI) / 180,
      radialReach: 0,
    }
    const unit = placePlatform(sim.state, def, 2, 0)

    contactAt('skiff', RINGS[1].radius, Math.PI / 2)

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBeNull()

    for (let i = 0; i < 80; i++) {
      sim.state.rings[1].phase += sim.state.rings[1].angularVelocity * TICK_SECONDS
      updatePlatforms(sim.state, TICK_SECONDS)
      if (unit.targetId !== null) break
    }
    expect(unit.targetId).not.toBeNull()
  })
})

describe('Arrays stay distinct from Platforms on all five axes', () => {
  it('1. position — Arrays are static, Platforms rotate', () => {
    const array = mountArray(sim.state, arrayById('long-baseline')!, 2)
    const platform = defender('nearest', 2)

    const arrayBefore = arrayPosition(array)
    const platformBefore = platformPosition(sim.state, platform)

    for (let i = 0; i < 40; i++) sim.tick(TICK_SECONDS)

    expect(arrayPosition(array)).toEqual(arrayBefore)
    expect(platformPosition(sim.state, platform)).not.toEqual(platformBefore)
  })

  it('2. range — a Array reaches what a Platform cannot', () => {
    const platform = defender('nearest', 2)
    mountArray(sim.state, arrayById('long-baseline')!, 0)

    contactAt('skiff', 45, Math.PI)

    updatePlatforms(sim.state, TICK_SECONDS)
    const shots = updateArrays(sim.state, TICK_SECONDS)

    expect(platform.targetId).toBeNull()
    expect(shots).toHaveLength(1)
  })

  it('3. resource — only Arrays are gated by a consumable', () => {
    const array = mountArray(sim.state, arrayById('long-baseline')!, 0)
    const platform = defender('nearest', 2)
    const target = contactAt('skiff', 160)
    target.hp = 1e9

    array.charge = 0
    array.cooldownRemaining = 0
    expect(updateArrays(sim.state, TICK_SECONDS)).toHaveLength(0)

    expect(updatePlatforms(sim.state, TICK_SECONDS)).toHaveLength(1)
    void platform
  })

  it('4. conjunction — Arrays never participate', () => {
    mountArray(sim.state, arrayById('long-baseline')!, 0)
    mountArray(sim.state, arrayById('long-baseline')!, 4)
    placePlatform(sim.state, platformById('bolt')!, 1, 0)
    placePlatform(sim.state, platformById('bolt')!, 2, 0)

    const found = findConjunctions(sim.state)
    expect(found).toHaveLength(1)

    expect(found[0].participants).toHaveLength(2)
    expect(found[0].participants.every((p) => 'slot' in p)).toBe(true)
  })

  it('5. targeting — only Arrays lead a moving target', () => {
    mountArray(sim.state, arrayById('long-baseline')!, 0)
    const platform = defender('nearest', 2)

    const mover = contactAt('skiff', 160)
    mover.velocity = { x: 0, y: 200 }

    const shots = updateArrays(sim.state, TICK_SECONDS)
    const attacks = updatePlatforms(sim.state, TICK_SECONDS)

    expect(shots[0].aimPoint.y).toBeGreaterThan(mover.position.y)

    expect(attacks[0].target).toBe(mover)
    expect(attacks[0]).not.toHaveProperty('aimPoint')
    void platform
  })
})

describe('Arrays cannot defend on their own', () => {
  it('has no block arc, so nothing it does stops a Contact', () => {
    const array = arrayById('long-baseline')!
    expect(array).not.toHaveProperty('blockArc')
  })

  it('takes no damage, which is the trade for contributing no defence', () => {
    const array = mountArray(sim.state, arrayById('long-baseline')!, 0)
    const before = array.hp

    for (let i = 0; i < 600; i++) sim.tick(TICK_SECONDS)

    expect(array.hp).toBe(before)
    expect(array.disabledFor).toBe(0)
  })
})

describe('reach widens as a target closes on the centre', () => {
  function ringOneUnit() {
    const def: PlatformDef = {
      ...platformById('anchor')!,
      targeting: 'deepest',
      angularReach: 10 * (Math.PI / 180),
      radialReach: 0,
    }
    return placePlatform(sim.state, def, 1, 0)
  }

  function canHit(radius: number, angle: number): boolean {
    sim.state.contact.length = 0
    sim.state.platforms.length = 0
    const unit = ringOneUnit()
    const target = contactAt('skiff', radius, angle)
    target.hp = 1e9
    target.maxHp = 1e9

    updatePlatforms(sim.state, TICK_SECONDS)
    return unit.targetId === target.id
  }

  const RING1 = RINGS[0].radius

  it('reaches a Contact sitting on the Sun from any bearing', () => {
    for (const angle of [0, 0.9, Math.PI / 2, 2.4, Math.PI, -1.2]) {
      expect(canHit(2, angle), `bearing ${angle.toFixed(1)}`).toBe(true)
    }
  })

  it('still refuses a bearing well outside the arc at its own ring', () => {
    expect(canHit(RING1, Math.PI / 2)).toBe(false)
    expect(canHit(RING1, Math.PI)).toBe(false)
  })

  it('keeps the authored arc at the ring radius it was authored for', () => {
    const deg = Math.PI / 180
    expect(canHit(RING1, 8 * deg)).toBe(true)
    expect(canHit(RING1, 12 * deg)).toBe(false)
  })

  it('widens in proportion as the radius halves', () => {
    const deg = Math.PI / 180
    expect(canHit(RING1, 19 * deg)).toBe(false)
    expect(canHit(RING1 / 2, 19 * deg)).toBe(true)
    expect(canHit(RING1 / 2, 21 * deg)).toBe(false)
  })

  it('never narrows outward', () => {
    sim.state.contact.length = 0
    sim.state.platforms.length = 0
    const def: PlatformDef = {
      ...platformById('bolt')!,
      angularReach: 10 * (Math.PI / 180),
      radialReach: 1,
    }
    const unit = placePlatform(sim.state, def, 2, 0)
    const target = contactAt('skiff', RINGS[2].radius, 9 * (Math.PI / 180))
    target.hp = 1e9

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(target.id)
  })

  it('leaves the inner bound on outer rings intact', () => {
    sim.state.contact.length = 0
    sim.state.platforms.length = 0
    const unit = placePlatform(sim.state, platformById('rake')!, 3, 0)
    const target = contactAt('skiff', 5, 0)
    target.hp = 1e9

    updatePlatforms(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBeNull()
  })
})

describe('where a keyboard Flare lands', () => {
  it('picks the Contact closest to the Sun', () => {
    contactAt('skiff', 400)
    const deep = contactAt('skiff', 120, Math.PI / 3)
    contactAt('skiff', 260, Math.PI)

    const point = deepestContactPoint(sim.state)

    expect(point).not.toBeNull()
    expect(point!.x).toBeCloseTo(deep.position.x, 6)
    expect(point!.y).toBeCloseTo(deep.position.y, 6)
  })

  it('is not the best shot available', () => {
    contactAt('skiff', 120)
    contactAt('skiff', 400, 0)
    contactAt('skiff', 402, 0.01)
    contactAt('skiff', 404, 0.02)

    const point = deepestContactPoint(sim.state)

    expect(Math.hypot(point!.x, point!.y)).toBeLessThan(200)
  })

  it('ignores a Contact that is already dead', () => {
    const dying = contactAt('skiff', 80)
    dying.hp = 0
    const alive = contactAt('skiff', 300)

    const point = deepestContactPoint(sim.state)

    expect(point!.x).toBeCloseTo(alive.position.x, 6)
  })

  it('has nowhere to fire at an empty field', () => {
    expect(deepestContactPoint(sim.state)).toBeNull()
  })
})
