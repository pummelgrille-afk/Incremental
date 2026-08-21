import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { mountChime, placeMovement } from '../src/lib/core/formation'
import { movementById } from '../src/lib/content/allies'
import { chimeById } from '../src/lib/content/supportUnits'
import { slackById } from '../src/lib/content/enemies'
import { createSlack } from '../src/lib/systems/spawn'
import {
  angleDelta,
  chimePosition,
  movementPosition,
  threatOf,
  updateChimes,
  updateMovements,
} from '../src/lib/systems/ai'
import { RINGS } from '../src/lib/content/field'
import { findConjunctions } from '../src/lib/systems/synergy'
import type { MovementDef } from '../src/lib/entities/Movement'
import type { TargetingPolicy } from '../src/lib/entities/types'
import type { SlackInstance } from '../src/lib/entities/Slack'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'escapement-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  // Rings start at phase 0, so slot 0 on every ring sits at angle 0.
  sim.state.slack.length = 0
})

/** Place a stationary Slack at a known polar position. */
function slackAt(defId: string, radius: number, angle = 0): SlackInstance {
  const instance = createSlack(sim.state, slackById(defId)!, {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  })
  instance.velocity = { x: 0, y: 0 }
  sim.state.slack.push(instance)
  return instance
}

/** A Movement with an overridden policy, placed at slot 0 (angle 0). */
function defender(policy: TargetingPolicy, ring: 1 | 2 | 3 = 2, base = 'hammer') {
  const def: MovementDef = {
    ...movementById(base)!,
    targeting: policy,
    // Wide arc so angular reach never confounds a targeting assertion.
    angularReach: Math.PI / 2,
    radialReach: 1,
  }
  return placeMovement(sim.state, def, ring, 0)
}

describe('angleDelta', () => {
  it('returns the shortest signed angle', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10)
    expect(angleDelta(Math.PI / 2, 0)).toBeCloseTo(-Math.PI / 2, 10)
  })

  it('wraps across the seam rather than going the long way', () => {
    // 350° to 10° is +20°, not -340°.
    expect(angleDelta((350 * Math.PI) / 180, (10 * Math.PI) / 180)).toBeCloseTo(
      (20 * Math.PI) / 180,
      10,
    )
  })
})

describe('threat', () => {
  it('rises as a Slack nears the Mainspring', () => {
    const far = slackAt('burr', 320)
    const near = slackAt('burr', 40)
    expect(threatOf(near)).toBeGreaterThan(threatOf(far))
  })

  it('accounts for how dangerous the Slack is, not only where it is', () => {
    const weak = slackAt('burr', 200)
    const strong = slackAt('backlash', 200)
    expect(threatOf(strong)).toBeGreaterThan(threatOf(weak))
  })
})

describe('targeting policies', () => {
  it('nearest picks the closest to the unit, not to the centre', () => {
    const unit = defender('nearest', 2)
    const origin = movementPosition(sim.state, unit)
    expect(origin.x).toBeCloseTo(RINGS[1].radius, 6)

    const inner = slackAt('burr', 130) // 30 px inside the unit
    slackAt('burr', 240) // 80 px outside

    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(inner.id)
  })

  it('lowestHp picks the weakest, regardless of distance', () => {
    const unit = defender('lowestHp', 2)
    slackAt('burr', 130)
    const wounded = slackAt('burr', 240)
    wounded.hp = 1

    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(wounded.id)
  })

  it('deepest picks whatever is closest to the Mainspring', () => {
    const unit = defender('deepest', 2)
    const deep = slackAt('burr', 125)
    slackAt('burr', 200)

    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(deep.id)
  })

  it('highestThreat prefers a dangerous Slack over a merely close one', () => {
    const unit = defender('highestThreat', 2)
    const harmless = slackAt('burr', 130)
    const dangerous = slackAt('backlash', 200)

    updateMovements(sim.state, TICK_SECONDS)
    expect(threatOf(dangerous)).toBeGreaterThan(threatOf(harmless))
    expect(unit.targetId).toBe(dangerous.id)
  })

  it('none never attacks and never acquires a target', () => {
    const unit = defender('none', 2)
    slackAt('burr', 160)

    const attacks = updateMovements(sim.state, TICK_SECONDS)
    expect(attacks).toHaveLength(0)
    expect(unit.targetId).toBeNull()
  })
})

describe('annular reach', () => {
  it('ignores a Slack outside the angular arc', () => {
    const def: MovementDef = {
      ...movementById('hammer')!,
      angularReach: (10 * Math.PI) / 180,
      radialReach: 1,
    }
    const unit = placeMovement(sim.state, def, 2, 0)

    // Directly opposite the unit.
    slackAt('burr', 160, Math.PI)

    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBeNull()
  })

  it('ignores a Slack beyond its outward reach', () => {
    const unit = defender('nearest', 1)
    // Ring 1 with radialReach 1 covers out to ring 2 plus margin.
    slackAt('burr', 320)

    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBeNull()
  })

  /**
   * The Phase 13 correctness fix. Without an inner bound an outer-ring unit
   * could strike a Slack that had already penetrated to the centre, which makes
   * ring assignment nearly meaningless and undercuts pillar P2.
   */
  it('does not let an outer ring strike a Slack that reached the centre', () => {
    const outer = defender('nearest', 3)
    slackAt('burr', 35) // essentially on the Mainspring

    updateMovements(sim.state, TICK_SECONDS)
    expect(outer.targetId).toBeNull()
  })

  it('lets the innermost ring defend everything inside it', () => {
    // Otherwise a Slack at the Mainspring would be unreachable by anything.
    const inner = defender('nearest', 1)
    const arrived = slackAt('burr', 35)

    updateMovements(sim.state, TICK_SECONDS)
    expect(inner.targetId).toBe(arrived.id)
  })

  it('gives an outer ring a wider arc length for the same angular reach', () => {
    // combat-spec.md §2: effectiveArcLength = angularReach * radius.
    const reach = (30 * Math.PI) / 180
    expect(reach * RINGS[2].radius).toBeGreaterThan(reach * RINGS[0].radius)
  })
})

describe('attack timing', () => {
  it('fires once, then waits out the cooldown', () => {
    const unit = defender('nearest', 2)
    const target = slackAt('burr', 160)
    target.hp = 10_000

    const first = updateMovements(sim.state, TICK_SECONDS)
    expect(first).toHaveLength(1)

    const second = updateMovements(sim.state, TICK_SECONDS)
    expect(second).toHaveLength(0)
  })

  it('fires again once the interval elapses', () => {
    const unit = defender('nearest', 2)
    const target = slackAt('burr', 160)
    target.hp = 10_000

    updateMovements(sim.state, TICK_SECONDS)
    const ticks = Math.ceil(unit.def.baseInterval / TICK_SECONDS) + 1
    let fired = 0
    for (let i = 0; i < ticks; i++) {
      fired += updateMovements(sim.state, TICK_SECONDS).length
    }
    expect(fired).toBeGreaterThanOrEqual(1)
  })

  it('attacks faster with haste', () => {
    const slow = defender('nearest', 2)
    const target = slackAt('burr', 160)
    target.hp = 10_000

    updateMovements(sim.state, TICK_SECONDS)
    const withoutHaste = slow.cooldownRemaining

    slow.cooldownRemaining = 0
    slow.hasteBonus = 1
    updateMovements(sim.state, TICK_SECONDS)
    expect(slow.cooldownRemaining).toBeLessThan(withoutHaste)
  })

  it('does not act while disabled, and recovers at full health', () => {
    const unit = defender('nearest', 2)
    slackAt('burr', 160)
    unit.disabledFor = 1
    unit.hp = 0

    expect(updateMovements(sim.state, TICK_SECONDS)).toHaveLength(0)

    for (let i = 0; i < 25; i++) updateMovements(sim.state, TICK_SECONDS)
    expect(unit.disabledFor).toBe(0)
    expect(unit.hp).toBe(unit.maxHp)
  })
})

describe('re-targeting', () => {
  it('keeps its target while that target remains valid', () => {
    const unit = defender('nearest', 2)
    const first = slackAt('burr', 160)
    first.hp = 10_000

    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(first.id)

    // A closer one appears, but the interval has not elapsed.
    slackAt('burr', 155)
    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(first.id)
  })

  it('switches when the current target leaves reach', () => {
    const unit = defender('nearest', 2)
    const first = slackAt('burr', 160)
    first.hp = 10_000
    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(first.id)

    // Move it far outside the band.
    first.position.x = 5000
    const replacement = slackAt('burr', 160)

    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(replacement.id)
  })

  it('drops its target when nothing is in reach', () => {
    const unit = defender('nearest', 2)
    const only = slackAt('burr', 160)
    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBe(only.id)

    sim.state.slack.length = 0
    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBeNull()
  })
})

describe('Chimes', () => {
  it('reach the whole field, unlike Movements', () => {
    const chime = mountChime(sim.state, chimeById('quarter-bell')!, 0)
    const distant = slackAt('burr', 40, Math.PI) // opposite side, near centre

    const shots = updateChimes(sim.state, TICK_SECONDS)
    expect(shots).toHaveLength(1)
    expect(shots[0].target.id).toBe(distant.id)
    void chime
  })

  it('spend a charge per shot and fall silent at zero', () => {
    const chime = mountChime(sim.state, chimeById('quarter-bell')!, 0)
    const target = slackAt('burr', 200)
    target.hp = 10_000

    updateChimes(sim.state, TICK_SECONDS)
    expect(chime.charge).toBeLessThan(chime.def.maxCharge)

    chime.charge = 0
    chime.cooldownRemaining = 0
    expect(updateChimes(sim.state, TICK_SECONDS)).toHaveLength(0)
  })

  it('regenerate charge over time', () => {
    const chime = mountChime(sim.state, chimeById('quarter-bell')!, 0)
    chime.charge = 0

    const ticks = Math.ceil(chime.def.chargeInterval / TICK_SECONDS)
    for (let i = 0; i < ticks; i++) updateChimes(sim.state, TICK_SECONDS)

    // Accumulating dt/interval across ~80 ticks lands a hair under 1 rather
    // than exactly on it, so the charge becomes spendable one tick later. That
    // is 50 ms and imperceptible; asserting exactness here would be asserting
    // something floating-point arithmetic cannot deliver.
    expect(chime.charge).toBeCloseTo(1, 6)

    updateChimes(sim.state, TICK_SECONDS)
    expect(chime.charge).toBeGreaterThanOrEqual(1)
  })

  it('lead a moving target rather than aiming where it is', () => {
    const chime = mountChime(sim.state, chimeById('quarter-bell')!, 0)
    const mover = slackAt('burr', 200, Math.PI / 2)
    mover.velocity = { x: 120, y: 0 }

    const shots = updateChimes(sim.state, TICK_SECONDS)
    expect(shots).toHaveLength(1)
    // The aim point must sit ahead of the target along its velocity.
    expect(shots[0].aimPoint.x).toBeGreaterThan(mover.position.x)
    void chime
  })

  it('aim where a stationary target already is', () => {
    mountChime(sim.state, chimeById('quarter-bell')!, 0)
    const still = slackAt('burr', 200)

    const shots = updateChimes(sim.state, TICK_SECONDS)
    expect(shots[0].aimPoint.x).toBeCloseTo(still.position.x, 6)
    expect(shots[0].aimPoint.y).toBeCloseTo(still.position.y, 6)
  })

  it('sit on the static rim, so their position never changes', () => {
    const chime = mountChime(sim.state, chimeById('quarter-bell')!, 3)
    const before = chimePosition(chime)
    for (let i = 0; i < 100; i++) sim.tick(TICK_SECONDS)
    expect(chimePosition(chime)).toEqual(before)
  })
})

describe('rotation moves reach with the unit', () => {
  it('brings a Slack into range as the ring turns', () => {
    // Position is a function of time (pillar P2) — a fixed arrangement covers
    // different arcs at different moments.
    const def: MovementDef = {
      ...movementById('hammer')!,
      angularReach: (20 * Math.PI) / 180,
      radialReach: 0,
    }
    const unit = placeMovement(sim.state, def, 2, 0)
    // Place a Slack a quarter turn ahead of the unit's start.
    slackAt('burr', RINGS[1].radius, Math.PI / 2)

    updateMovements(sim.state, TICK_SECONDS)
    expect(unit.targetId).toBeNull()

    // Ring 2 completes a revolution in 14 s; a quarter turn takes ~3.5 s.
    for (let i = 0; i < 80; i++) {
      sim.state.rings[1].phase += sim.state.rings[1].angularVelocity * TICK_SECONDS
      updateMovements(sim.state, TICK_SECONDS)
      if (unit.targetId !== null) break
    }
    expect(unit.targetId).not.toBeNull()
  })
})

/**
 * combat-spec.md §4 lists five axes on which Chimes must differ from Movements.
 * All five must survive balancing, or one class collapses into the other and
 * the roster loses a dimension. Asserted here so a tuning pass cannot erode
 * them quietly.
 */
describe('Chimes stay distinct from Movements on all five axes', () => {
  it('1. position — Chimes are static, Movements rotate', () => {
    const chime = mountChime(sim.state, chimeById('quarter-bell')!, 2)
    const movement = defender('nearest', 2)

    const chimeBefore = chimePosition(chime)
    const movementBefore = movementPosition(sim.state, movement)

    for (let i = 0; i < 40; i++) sim.tick(TICK_SECONDS)

    expect(chimePosition(chime)).toEqual(chimeBefore)
    expect(movementPosition(sim.state, movement)).not.toEqual(movementBefore)
  })

  it('2. range — a Chime reaches what a Movement cannot', () => {
    const movement = defender('nearest', 2)
    mountChime(sim.state, chimeById('quarter-bell')!, 0)
    // Opposite the units, near the centre: outside any annular band.
    slackAt('burr', 45, Math.PI)

    updateMovements(sim.state, TICK_SECONDS)
    const shots = updateChimes(sim.state, TICK_SECONDS)

    expect(movement.targetId).toBeNull()
    expect(shots).toHaveLength(1)
  })

  it('3. resource — only Chimes are gated by a consumable', () => {
    const chime = mountChime(sim.state, chimeById('quarter-bell')!, 0)
    const movement = defender('nearest', 2)
    const target = slackAt('burr', 160)
    target.hp = 1e9

    chime.charge = 0
    chime.cooldownRemaining = 0
    expect(updateChimes(sim.state, TICK_SECONDS)).toHaveLength(0)

    // The Movement has no equivalent resource and fires regardless.
    expect(updateMovements(sim.state, TICK_SECONDS)).toHaveLength(1)
    void movement
  })

  it('4. conjunction — Chimes never participate', () => {
    // Two Chimes aligned on the rim must not produce a conjunction, and must
    // not contribute to one formed by Movements.
    mountChime(sim.state, chimeById('quarter-bell')!, 0)
    mountChime(sim.state, chimeById('quarter-bell')!, 4)
    placeMovement(sim.state, movementById('hammer')!, 1, 0)
    placeMovement(sim.state, movementById('hammer')!, 2, 0)

    const found = findConjunctions(sim.state)
    expect(found).toHaveLength(1)
    // Exactly the two Movements — no Chime smuggled in.
    expect(found[0].participants).toHaveLength(2)
    expect(found[0].participants.every((p) => 'slot' in p)).toBe(true)
  })

  it('5. targeting — only Chimes lead a moving target', () => {
    mountChime(sim.state, chimeById('quarter-bell')!, 0)
    const movement = defender('nearest', 2)

    const mover = slackAt('burr', 160)
    mover.velocity = { x: 0, y: 200 }

    const shots = updateChimes(sim.state, TICK_SECONDS)
    const attacks = updateMovements(sim.state, TICK_SECONDS)

    // The Chime aims ahead of the target.
    expect(shots[0].aimPoint.y).toBeGreaterThan(mover.position.y)
    // The Movement resolves against the target itself, with no aim point.
    expect(attacks[0].target).toBe(mover)
    expect(attacks[0]).not.toHaveProperty('aimPoint')
    void movement
  })
})

describe('Chimes cannot defend on their own', () => {
  it('has no block arc, so nothing it does stops a Slack', () => {
    // The measured consequence (Phase 14): two Chimes and no Movements lose
    // the stage, because nothing is slowing anything down.
    const chime = chimeById('quarter-bell')!
    expect(chime).not.toHaveProperty('blockArc')
  })

  it('takes no damage, which is the trade for contributing no defence', () => {
    const chime = mountChime(sim.state, chimeById('quarter-bell')!, 0)
    const before = chime.hp

    // Run a full stage's worth of hostile fire past the rim.
    for (let i = 0; i < 600; i++) sim.tick(TICK_SECONDS)

    expect(chime.hp).toBe(before)
    expect(chime.disabledFor).toBe(0)
  })
})
