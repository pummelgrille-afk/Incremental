import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { placeMovement } from '../src/lib/core/formation'
import { movementById } from '../src/lib/content/allies'
import { slackById } from '../src/lib/content/enemies'
import { createSlack } from '../src/lib/systems/spawn'
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
import type { SlackInstance } from '../src/lib/entities/Slack'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'escapement-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  sim.state.slack.length = 0
  sim.state.movements.length = 0
  sim.state.chimes.length = 0
})

/** Slot 0 on every ring sits at angle 0 while the phases are zero. */
function alignAtZero(ids: string[]) {
  return ids.map((id, i) =>
    placeMovement(sim.state, movementById(id)!, (i + 1) as 1 | 2 | 3, 0),
  )
}

function slackAt(defId: string, angle: number, radius = 200): SlackInstance {
  const s = createSlack(sim.state, slackById(defId)!, {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  })
  s.hp = 1e9
  s.maxHp = 1e9
  sim.state.slack.push(s)
  return s
}

describe('type opposition', () => {
  it('reproduces the two pairs the matrix is built around', () => {
    // damageTypes.ts documents Shear<->Percussive and Thermal<->Resonant.
    // Derived rather than listed, so this asserts the derivation still agrees
    // with the prose above it.
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
    // Hammer and Detent are both percussive.
    alignAtZero(['hammer', 'detent'])
    const [event] = findConjunctions(sim.state)
    expect(event.pairing).toBe('matched')
  })

  it('reports interference for opposed participants', () => {
    // Hammer is percussive, Pallet is shear.
    alignAtZero(['hammer', 'pallet'])
    const [event] = findConjunctions(sim.state)
    expect(event.pairing).toBe('interference')
  })
})

describe('pairing changes what a conjunction does', () => {
  /** Total damage a two-unit conjunction deals to one Slack on the axis. */
  function pulseDamage(ids: string[], angle: number): number {
    sim.state.movements.length = 0
    sim.state.slack.length = 0
    alignAtZero(ids)
    const target = slackAt('burr', angle)

    updateSynergy(sim.state, createCooldowns())
    return 1e9 - target.hp
  }

  it('amplifies a matched pair over a mixed one', () => {
    // Both percussive against both-different is the cleanest comparison
    // available with three allies, so compare matched against the unmodified
    // multiplier directly instead.
    expect(CONJUNCTION.pairing.matched).toBeGreaterThan(CONJUNCTION.pairing.mixed)
    expect(CONJUNCTION.pairing.interference).toBeLessThan(CONJUNCTION.pairing.mixed)
  })

  it('reaches further under interference than a matched pair does', () => {
    // The trade interference offers: less magnitude, more arc. A Slack outside
    // the normal pulse arc is hit only by the wider one.
    const wide = (CONJUNCTION.pulseArc + CONJUNCTION.interferenceArc) / 2

    const matched = pulseDamage(['hammer', 'detent'], wide)
    const interfering = pulseDamage(['hammer', 'pallet'], wide)

    expect(matched).toBe(0)
    expect(interfering).toBeGreaterThan(0)
  })

  it('still hits harder on-axis when matched', () => {
    const matched = pulseDamage(['hammer', 'detent'], 0)
    const interfering = pulseDamage(['hammer', 'pallet'], 0)

    expect(matched).toBeGreaterThan(interfering)
  })
})

describe('conjunction buffs follow the stacking rule', () => {
  it('grants a shield with the authored duration', () => {
    const [, detent] = alignAtZero(['hammer', 'detent'])
    expect(detent.def.conjunctionEffect.kind).toBe('shield')

    updateSynergy(sim.state, createCooldowns())

    expect(detent.buffs.shield.magnitude).toBeGreaterThan(0)
    expect(detent.buffs.shield.remaining).toBe(detent.def.conjunctionEffect.duration)
  })

  it('does not stack across repeated firings', () => {
    // A fresh cooldown map each call is the worst case: the conjunction fires
    // every time. The shield must still land on its own ceiling.
    const [, detent] = alignAtZero(['hammer', 'detent'])

    updateSynergy(sim.state, createCooldowns())
    const first = detent.buffs.shield.magnitude

    for (let i = 0; i < 10; i++) updateSynergy(sim.state, createCooldowns())
    expect(detent.buffs.shield.magnitude).toBe(first)
  })

  it('does not extend duration with scale', () => {
    // Magnitude scales with the conjunction; duration is authored and fixed,
    // or the two would compound into permanent uptime.
    const [, detent] = alignAtZero(['hammer', 'detent'])
    updateSynergy(sim.state, createCooldowns())
    const minor = detent.buffs.shield.remaining

    sim.state.movements.length = 0
    const [, big] = alignAtZero(['hammer', 'detent', 'pallet'])
    updateSynergy(sim.state, createCooldowns())

    expect(big.buffs.shield.remaining).toBe(minor)
  })

  it('expires on the schedule its content authored', () => {
    const [, detent] = alignAtZero(['hammer', 'detent'])
    const duration = detent.def.conjunctionEffect.duration!
    updateSynergy(sim.state, createCooldowns())

    // Aged directly rather than by ticking: the two units are still aligned,
    // so a live simulation would legitimately re-grant the shield the moment
    // the 6 s conjunction cooldown lapsed. That is the next test.
    for (let i = 0; i < Math.ceil(duration / TICK_SECONDS) + 1; i++) {
      updateBuffs(sim.state, TICK_SECONDS)
    }
    expect(detent.buffs.shield.magnitude).toBe(0)
  })

  it('never banks more than one duration, however long an alignment lingers', () => {
    // Uptime is bounded by cooldown against duration, not by stacking. One
    // shared cooldown map is the realistic case.
    const [, detent] = alignAtZero(['hammer', 'detent'])
    const duration = detent.def.conjunctionEffect.duration!
    const cooldowns = createCooldowns()

    for (let i = 0; i < 400; i++) {
      updateSynergy(sim.state, cooldowns)
      updateBuffs(sim.state, CONJUNCTION.evalInterval / 1000)
      expect(detent.buffs.shield.remaining).toBeLessThanOrEqual(duration)
    }
  })
})

describe('the preview', () => {
  it('reports nothing with fewer than two Movements', () => {
    placeMovement(sim.state, movementById('hammer')!, 1, 0)
    expect(timeToNextConjunction(sim.state)).toBeNull()
  })

  it('reports nothing for two units on the same ring', () => {
    // They hold a fixed angular offset, so they can never align.
    placeMovement(sim.state, movementById('hammer')!, 2, 0)
    placeMovement(sim.state, movementById('detent')!, 2, 4)
    expect(timeToNextConjunction(sim.state)).toBeNull()
  })

  it('finds an alignment for units on different rings', () => {
    placeMovement(sim.state, movementById('hammer')!, 1, 2)
    placeMovement(sim.state, movementById('detent')!, 2, 5)

    const t = timeToNextConjunction(sim.state)
    expect(t).not.toBeNull()
    expect(t!).toBeGreaterThan(0)
  })

  it('leaves the ring phases exactly as it found them', () => {
    // It simulates forward by writing phases directly; a preview that moved
    // the field would be a preview that changed the game.
    placeMovement(sim.state, movementById('hammer')!, 1, 2)
    placeMovement(sim.state, movementById('detent')!, 3, 9)
    for (let i = 0; i < 37; i++) sim.tick(TICK_SECONDS)

    const before = sim.state.rings.map((r) => r.phase)
    timeToNextConjunction(sim.state)
    expect(sim.state.rings.map((r) => r.phase)).toEqual(before)
  })

  it('predicts an alignment that actually arrives', () => {
    // The preview is only worth showing if the field agrees with it.
    placeMovement(sim.state, movementById('hammer')!, 1, 1)
    placeMovement(sim.state, movementById('detent')!, 2, 7)

    const predicted = timeToNextConjunction(sim.state)
    expect(predicted).not.toBeNull()

    let fired = 0
    const ticks = Math.ceil((predicted! + 0.2) / TICK_SECONDS)
    for (let i = 0; i < ticks; i++) fired += sim.tick(TICK_SECONDS).conjunctionsFired

    expect(fired).toBeGreaterThan(0)
  })

  it('does not look past its horizon', () => {
    placeMovement(sim.state, movementById('hammer')!, 1, 0)
    placeMovement(sim.state, movementById('detent')!, 2, 0)
    // Zero horizon can find nothing, whatever the formation.
    expect(timeToNextConjunction(sim.state, 0)).toBeNull()
  })

  it('ignores disabled units, which cannot participate', () => {
    const a = placeMovement(sim.state, movementById('hammer')!, 1, 0)
    placeMovement(sim.state, movementById('detent')!, 2, 0)
    a.disabledFor = 10

    expect(findConjunctions(sim.state)).toHaveLength(0)
    expect(timeToNextConjunction(sim.state)).toBeNull()
  })
})

describe('ring periods keep alignments irregular', () => {
  it('keeps every pair of periods coprime', () => {
    // 8 : 14 : 22 reduces to 4 : 7 : 11. A common factor would make
    // conjunctions repeat on a short cycle and turn planning into memorising.
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const periods = RINGS.map((r) => r.period / 2)

    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        expect(gcd(periods[i], periods[j]), `${periods[i]}/${periods[j]}`).toBe(1)
      }
    }
  })
})
