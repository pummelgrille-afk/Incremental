import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS, MAX_CATCHUP_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng, seedFrom } from '../src/lib/core/rng'
import { mountArray, placePlatform, removePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { arrayById } from '../src/lib/content/arrays'
import { computeDamage, mitigate } from '../src/lib/systems/combat'
import { updateProjectiles } from '../src/lib/systems/collision'
import { createContact } from '../src/lib/systems/spawn'
import { contactById } from '../src/lib/content/contacts'
import { findConjunctions, timeToNextConjunction } from '../src/lib/systems/synergy'
import {
  FLARE,
  INNERMOST_RING,
  OUTERMOST_RING,
  RIM_RADIUS,
  RINGS,
  TOTAL_SLOTS,
} from '../src/lib/content/field'
import type { StageAddress } from '../src/lib/entities/Zone'
import type { SimulationState } from '../src/lib/core/simulation'

const STAGE: StageAddress = 'service-floor:first-shift'

function build(): Simulation {
  return new Simulation(loadStage(STAGE), createRng(seedFrom(STAGE)))
}

let sim: Simulation
let state: SimulationState

beforeEach(() => {
  sim = build()
  state = sim.state
})

describe('fixed timestep', () => {
  it('runs whole ticks only', () => {
    sim.advance(TICK_SECONDS * 2.5)
    expect(sim.tickCount).toBe(2)
    // The remainder is carried, not discarded.
    expect(sim.alpha).toBeGreaterThan(0)
  })

  it('accumulates a remainder into a later tick', () => {
    sim.advance(TICK_SECONDS * 0.6)
    expect(sim.tickCount).toBe(0)
    sim.advance(TICK_SECONDS * 0.6)
    expect(sim.tickCount).toBe(1)
  })

  it('clamps catch-up so a stalled tab cannot fast-forward', () => {
    sim.advance(60)
    expect(sim.tickCount).toBeLessThanOrEqual(Math.ceil(MAX_CATCHUP_SECONDS / TICK_SECONDS))
  })

  it('is deterministic for a given seed', () => {
    const a = build()
    const b = build()
    for (let i = 0; i < 400; i++) {
      a.tick(TICK_SECONDS)
      b.tick(TICK_SECONDS)
    }
    expect(a.state.contact.length).toBe(b.state.contact.length)
    expect(a.state.salvageEarned).toBeCloseTo(b.state.salvageEarned, 10)
    expect(a.totalContactKilled).toBe(b.totalContactKilled)

    // Output is the sensitive signal: counts survive small timing jitter but
    // damage taken does not. A stray Math.random() in spawn.ts hid behind the
    // coarser assertions above until Phase 12.
    expect(a.state.sun.hp).toBe(b.state.sun.hp)
    expect(a.state.sun.lowestFraction).toBe(b.state.sun.lowestFraction)
  })

  it('produces identical entity state across two seeded runs', () => {
    const a = build()
    const b = build()
    for (let i = 0; i < 300; i++) {
      a.tick(TICK_SECONDS)
      b.tick(TICK_SECONDS)
    }

    const snapshot = (s: Simulation) =>
      s.state.contact.map((x) => [
        x.def.id,
        x.hp.toFixed(6),
        x.position.x.toFixed(6),
        x.position.y.toFixed(6),
        x.patternCooldown.toFixed(6),
      ])

    expect(snapshot(a)).toEqual(snapshot(b))
  })
})

describe('ring rotation', () => {
  it('advances every ring by its own period', () => {
    const before = state.rings.map((r) => r.phase)
    // One second of simulation.
    for (let i = 0; i < 20; i++) sim.tick(TICK_SECONDS)

    state.rings.forEach((ring, i) => {
      const expected = before[i] + (Math.PI * 2) / RINGS[i].period
      expect(ring.phase).toBeCloseTo(expected, 6)
    })
  })

  it('turns rings at different rates, which is what makes conjunction rare', () => {
    for (let i = 0; i < 100; i++) sim.tick(TICK_SECONDS)
    const [a, b, c] = state.rings.map((r) => r.phase)
    expect(a).not.toBeCloseTo(b, 3)
    expect(b).not.toBeCloseTo(c, 3)
  })
})

describe('rings are not controllable', () => {
  it('exposes no steering input at all', () => {
    // Phase 10 playtest: steering was a dexterity test and violated P3.
    // combat-spec.md §1 now forbids it outright, including via upgrades.
    expect((sim as unknown as Record<string, unknown>).nudge).toBeUndefined()
  })

  it('rotates at a rate nothing in the simulation changes', () => {
    const before = state.rings.map((r) => r.angularVelocity)
    for (let i = 0; i < 200; i++) sim.tick(TICK_SECONDS)
    sim.strike(0, 90)
    for (let i = 0; i < 200; i++) sim.tick(TICK_SECONDS)
    expect(state.rings.map((r) => r.angularVelocity)).toEqual(before)
  })
})

describe('the Flare', () => {
  it('starts fully charged', () => {
    expect(state.flare.charge).toBe(FLARE.maxCharges)
  })

  it('spends one charge per strike', () => {
    expect(sim.strike(100, 0)).toBe(true)
    expect(state.flare.charge).toBe(FLARE.maxCharges - 1)
    expect(state.flare.struck).toBe(1)
  })

  it('refuses a second strike inside the cooldown', () => {
    expect(sim.strike(100, 0)).toBe(true)
    expect(sim.strike(100, 0)).toBe(false)
  })

  it('allows another strike once the cooldown passes', () => {
    sim.strike(100, 0)
    for (let i = 0; i < Math.ceil(FLARE.cooldown / TICK_SECONDS) + 1; i++) {
      sim.tick(TICK_SECONDS)
    }
    expect(sim.strike(100, 0)).toBe(true)
  })

  it('refuses when out of charge', () => {
    for (let i = 0; i < FLARE.maxCharges; i++) {
      expect(sim.strike(100, 0)).toBe(true)
      for (let t = 0; t < Math.ceil(FLARE.cooldown / TICK_SECONDS) + 1; t++) {
        sim.tick(TICK_SECONDS)
      }
    }
    state.flare.charge = 0
    expect(sim.strike(100, 0)).toBe(false)
  })

  it('regenerates charge on simulation time', () => {
    state.flare.charge = 0
    const seconds = FLARE.rechargeInterval
    for (let i = 0; i < seconds / TICK_SECONDS; i++) sim.tick(TICK_SECONDS)
    expect(state.flare.charge).toBeCloseTo(1, 1)
  })

  it('never exceeds its maximum charge', () => {
    for (let i = 0; i < 600; i++) sim.tick(TICK_SECONDS)
    expect(state.flare.charge).toBeLessThanOrEqual(FLARE.maxCharges)
  })

  it('damages Contact inside the blast radius', () => {
    for (let i = 0; i < 60; i++) sim.tick(TICK_SECONDS)
    const target = state.contact[0]
    expect(target).toBeDefined()

    const before = target.hp
    sim.strike(target.position.x, target.position.y)
    expect(target.hp).toBeLessThan(before)
  })

  it('leaves Contact outside the blast radius alone', () => {
    for (let i = 0; i < 60; i++) sim.tick(TICK_SECONDS)
    const target = state.contact[0]
    const before = target.hp

    // Well beyond the radius.
    sim.strike(target.position.x + FLARE.radius * 4, target.position.y)
    expect(target.hp).toBe(before)
  })

  it('hits several Contact at once, which is why it has a radius', () => {
    // Percussive is unfavourable against Massed; the blast is what keeps the
    // one manual action satisfying against the commonest armour class.
    for (let i = 0; i < 80; i++) sim.tick(TICK_SECONDS)
    const cluster = state.contact.slice(0, 3)
    if (cluster.length < 2) return

    // Move them together so a single strike covers them.
    const point = { x: cluster[0].position.x, y: cluster[0].position.y }
    for (const s of cluster) {
      s.position.x = point.x
      s.position.y = point.y
    }
    const before = cluster.map((s) => s.hp)
    sim.strike(point.x, point.y)
    cluster.forEach((s, i) => expect(s.hp).toBeLessThan(before[i]))
  })

  it('never costs Output', () => {
    // Its failure mode is damage not dealt, never damage taken.
    const before = state.sun.hp
    sim.strike(0, 0)
    expect(state.sun.hp).toBe(before)
  })

  it('does nothing once the stage is resolved', () => {
    state.phase = 'cleared'
    expect(sim.strike(100, 0)).toBe(false)
  })

  it('is optional — a stage still clears without a single strike', () => {
    // P1 held honestly: the machine really does run without you.
    const s2 = build()
    placePlatform(s2.state, platformById('anchor')!, 1, 0)
    placePlatform(s2.state, platformById('anchor')!, 1, 3)
    placePlatform(s2.state, platformById('bolt')!, 2, 0)
    placePlatform(s2.state, platformById('bolt')!, 2, 5)
    mountArray(s2.state, arrayById('long-baseline')!, 0)

    let cleared = false
    for (let i = 0; i < 4000 && !cleared; i++) cleared = s2.tick(TICK_SECONDS).stageCleared

    expect(cleared).toBe(true)
    expect(s2.state.flare.struck).toBe(0)
  })

  it('reports the strike to the render layer even when it hits nothing', () => {
    // An input with no feedback reads as a broken input.
    sim.strike(500, 500)
    expect(sim.lastStrike).not.toBeNull()
    expect(sim.lastStrike!.x).toBe(500)
  })
})

describe('damage', () => {
  it('diminishes with defence but never immunises', () => {
    expect(mitigate(100, 0)).toBe(100)
    expect(mitigate(100, 100)).toBeCloseTo(50, 6)
    expect(mitigate(100, 300)).toBeCloseTo(25, 6)
    expect(mitigate(100, 100000)).toBeGreaterThan(0)
  })

  it('applies the type matrix', () => {
    const favourable = computeDamage(100, 1, 'shear', 'massed', 0)
    const unfavourable = computeDamage(100, 1, 'shear', 'rigid', 0)
    expect(favourable).toBeCloseTo(150, 6)
    expect(unfavourable).toBeCloseTo(75, 6)
  })

  it('stays a float rather than rounding', () => {
    // Rounding in the simulation compounds badly across thousands of hits.
    const damage = computeDamage(7, 1, 'shear', 'seized', 13)
    expect(Number.isInteger(damage)).toBe(false)
  })
})

describe('formation bonuses', () => {
  const bolt = platformById('bolt')!

  it('gives the innermost ring a defence bonus and the outermost a range bonus', () => {
    // Keyed on the derived bounds, not on the literal 1 and 3: adding an orbit
    // must not silently move the range bonus onto an interior ring.
    const inner = placePlatform(state, bolt, INNERMOST_RING, 0)
    const outer = placePlatform(state, bolt, OUTERMOST_RING, 0)
    expect(inner.bonuses.defence).toBeGreaterThan(0)
    expect(outer.bonuses.range).toBeCloseTo(0.1, 6)
  })

  it('rewards a unit flanked on both sides', () => {
    placePlatform(state, bolt, 2, 0)
    const middle = placePlatform(state, bolt, 2, 1)
    expect(middle.bonuses.attack).toBe(0)

    placePlatform(state, bolt, 2, 2)
    expect(middle.bonuses.attack).toBeCloseTo(0.1, 6)
  })

  it('wraps neighbour checks around the ring', () => {
    const slots = RINGS[0].slots
    placePlatform(state, bolt, 1, slots - 1)
    const first = placePlatform(state, bolt, 1, 0)
    placePlatform(state, bolt, 1, 1)
    expect(first.bonuses.attack).toBeCloseTo(0.1, 6)
  })

  it('grants a full-ring bonus to every unit on it', () => {
    for (let slot = 0; slot < RINGS[0].slots; slot++) placePlatform(state, bolt, 1, slot)
    for (const platform of state.platforms) {
      // Full ring (+8%) and both-neighbours (+10%).
      expect(platform.bonuses.attack).toBeCloseTo(0.18, 6)
    }
  })

  it('recomputes when a unit is removed', () => {
    placePlatform(state, bolt, 2, 0)
    const middle = placePlatform(state, bolt, 2, 1)
    placePlatform(state, bolt, 2, 2)
    expect(middle.bonuses.attack).toBeCloseTo(0.1, 6)

    removePlatform(state, 2, 2)
    expect(middle.bonuses.attack).toBe(0)
  })

  it('refuses to double-occupy a slot', () => {
    placePlatform(state, bolt, 2, 3)
    expect(() => placePlatform(state, bolt, 2, 3)).toThrow()
  })

  it('refuses a slot that does not exist on that ring', () => {
    expect(() => placePlatform(state, bolt, 1, 99)).toThrow()
  })
})

describe('conjunction', () => {
  const bolt = platformById('bolt')!

  it('never counts two units on the same ring', () => {
    // Same-ring units hold a fixed offset and would otherwise fire forever.
    placePlatform(state, bolt, 2, 0)
    placePlatform(state, bolt, 2, 1)
    for (let i = 0; i < 400; i++) {
      sim.tick(TICK_SECONDS)
      expect(findConjunctions(state)).toEqual([])
    }
  })

  it('detects units on different rings sharing an angle', () => {
    // Slot 0 on every ring is angle 0 at phase 0 — aligned by construction.
    placePlatform(state, bolt, 1, 0)
    placePlatform(state, bolt, 2, 0)
    const found = findConjunctions(state)
    expect(found).toHaveLength(1)
    expect(found[0].participants).toHaveLength(2)
    expect(found[0].scale).toBe('minor')
  })

  it('scales with participant count', () => {
    placePlatform(state, bolt, 1, 0)
    placePlatform(state, bolt, 2, 0)
    placePlatform(state, bolt, 3, 0)
    expect(findConjunctions(state)[0].scale).toBe('major')
  })

  it('ignores disabled units', () => {
    const a = placePlatform(state, bolt, 1, 0)
    placePlatform(state, bolt, 2, 0)
    a.disabledFor = 5
    expect(findConjunctions(state)).toEqual([])
  })

  it('does not fire the same alignment every tick', () => {
    // The 6s per-slot-set cooldown is what stops a lingering alignment
    // machine-gunning.
    placePlatform(state, bolt, 1, 0)
    placePlatform(state, bolt, 2, 0)

    let fired = 0
    for (let i = 0; i < 20; i++) fired += sim.tick(TICK_SECONDS).conjunctionsFired
    expect(fired).toBe(1)
  })

  it('previews the time to the next alignment', () => {
    placePlatform(state, bolt, 1, 1)
    placePlatform(state, bolt, 2, 4)
    const t = timeToNextConjunction(state)
    expect(t).not.toBeNull()
    expect(t!).toBeGreaterThan(0)
  })

  it('leaves ring phases untouched after previewing', () => {
    // The preview simulates forward; it must not mutate the live state.
    placePlatform(state, bolt, 1, 1)
    placePlatform(state, bolt, 2, 4)
    const before = state.rings.map((r) => r.phase)
    timeToNextConjunction(state)
    expect(state.rings.map((r) => r.phase)).toEqual(before)
  })

  it('returns null with fewer than two units', () => {
    placePlatform(state, bolt, 1, 0)
    expect(timeToNextConjunction(state)).toBeNull()
  })
})

describe('stage progression', () => {
  it('spawns Contact on the wave schedule', () => {
    expect(state.contact).toHaveLength(0)
    for (let i = 0; i < 40; i++) sim.tick(TICK_SECONDS)
    expect(state.contact.length).toBeGreaterThan(0)
  })

  it('clears the stage when a defended field survives every wave', () => {
    const bolt = platformById('bolt')!
    const anchor = platformById('anchor')!
    placePlatform(state, anchor, 1, 0)
    placePlatform(state, anchor, 1, 3)
    placePlatform(state, bolt, 2, 0)
    placePlatform(state, bolt, 2, 5)
    mountArray(state, arrayById('long-baseline')!, 0)

    let cleared = false
    for (let i = 0; i < 4000 && !cleared; i++) cleared = sim.tick(TICK_SECONDS).stageCleared

    expect(cleared).toBe(true)
    expect(state.phase).toBe('cleared')
    expect(state.salvageEarned).toBeGreaterThan(0)
  })

  it('loses the stage when Output is exhausted', () => {
    state.sun.hp = 1
    let lost = false
    for (let i = 0; i < 2000 && !lost; i++) lost = sim.tick(TICK_SECONDS).stageLost
    expect(lost).toBe(true)
    expect(state.phase).toBe('overwhelmed')
  })

  it('stops ticking once resolved', () => {
    state.sun.hp = 0
    sim.tick(TICK_SECONDS)
    const ticks = sim.tickCount
    sim.tick(TICK_SECONDS)
    expect(sim.tickCount).toBe(ticks)
  })
})

describe('telegraphs', () => {
  it('never spawns a projectile without warning first', () => {
    // combat-spec.md §5: a pattern that kills without warning is a bug.
    for (let i = 0; i < 60; i++) sim.tick(TICK_SECONDS)

    let sawTelegraph = false
    for (let i = 0; i < 200; i++) {
      const before = sim.projectiles.live
      if (state.contact.some((s) => s.telegraphRemaining > 0)) sawTelegraph = true
      sim.tick(TICK_SECONDS)
      if (sim.projectiles.live > before) {
        expect(sawTelegraph).toBe(true)
        return
      }
    }
  })
})

describe('projectile budget', () => {
  it('degrades gracefully instead of growing the pool', () => {
    const tiny = new Simulation(loadStage(STAGE), createRng(1), 8)
    for (let i = 0; i < 600; i++) tiny.tick(TICK_SECONDS)
    expect(tiny.projectiles.live).toBeLessThanOrEqual(8)
    expect(tiny.projectiles.items).toHaveLength(8)
  })
})

describe('the orbits', () => {
  it('exposes every orbit through the derived bounds', () => {
    // The five places that used to hardcode `3` now read these. If a new orbit
    // is appended and these do not move, the outermost-ring range bonus and the
    // radial reach cap both silently stay on the old outer ring.
    expect(INNERMOST_RING).toBe(RINGS[0].index)
    expect(OUTERMOST_RING).toBe(RINGS[RINGS.length - 1].index)
    expect(RINGS.some((r) => r.index === OUTERMOST_RING)).toBe(true)
  })

  it('orders orbits outward, with room inside the rim', () => {
    for (let i = 1; i < RINGS.length; i++) {
      expect(RINGS[i].radius, `orbit ${RINGS[i].index}`).toBeGreaterThan(RINGS[i - 1].radius)
    }
    // Contacts spawn at the rim and move inward; an orbit outside it would
    // never be crossed.
    expect(RINGS[RINGS.length - 1].radius).toBeLessThan(RIM_RADIUS)
  })

  it('gives the field as many slots as the orbits declare', () => {
    expect(TOTAL_SLOTS).toBe(RINGS.reduce((n, r) => n + r.slots, 0))
  })
})

describe('ring period constraint', () => {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

  it('keeps every pair of ring periods coprime', () => {
    // Phase 10 finding: 8:14:22 reduces to 4:7:11, pairwise coprime, and that
    // is the only reason alignments do not settle into a short repeating
    // cycle. A retune that picks non-coprime periods would silently collapse
    // conjunction into a metronome, with no other symptom. Guarded here so it
    // cannot happen quietly.
    const periods = RINGS.map((r) => r.period)

    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        const a = periods[i]
        const b = periods[j]
        const common = gcd(a, b)
        const reducedA = a / common
        const reducedB = b / common
        expect(
          gcd(reducedA, reducedB),
          `ring periods ${a} and ${b} share a cycle`,
        ).toBe(1)
        // The reduced ratio must also not be tiny, or alignments repeat often.
        expect(Math.max(reducedA, reducedB), `${a}:${b} repeats too fast`).toBeGreaterThan(2)
        /*
         * And neither may divide the other. Found while choosing the fourth
         * orbit's period: 8 and 32 pass every check above — they reduce to 1:4,
         * which is coprime and larger than 2 — yet they are in exact 4:1
         * lockstep and never drift apart at all. That is precisely the failure
         * this block exists to catch, so the check was letting the worst case
         * through under the guise of the best one.
         */
        expect(Math.min(reducedA, reducedB), `${a}:${b} are in lockstep`).toBeGreaterThan(1)
      }
    }
  })
})

describe('every damage path goes through the type matrix', () => {
  /**
   * Regression guard. Array projectiles and conjunction pulses originally
   * applied raw damage, bypassing both the type multiplier and armour. That
   * made "Arrays are always Resonant" (combat-spec.md §4) meaningless, since
   * the entire reason they counter Erratic and struggle against Seized is the
   * ×1.5 / ×0.75.
   */
  function contactAt(s: Simulation, defId: string, x: number, y: number) {
    const instance = createContact(s.state, contactById(defId)!, { x, y })
    instance.velocity = { x: 0, y: 0 }
    instance.hp = 100000
    instance.maxHp = 100000
    s.state.contact.push(instance)
    return instance
  }

  function arrayShotDamage(defId: string): number {
    const s = build()
    s.state.platforms.length = 0
    const target = contactAt(s, defId, 200, 0)

    const p = s.projectiles.acquire()!
    p.faction = 'array'
    p.position = { x: 200, y: 0 }
    p.velocity = { x: 0, y: 0 }
    p.damage = 100
    p.damageType = 'resonant'
    p.radius = 4
    p.lifetime = 5
    p.angularVelocity = 0

    const before = target.hp
    updateProjectiles(s.state, s.projectiles, TICK_SECONDS)
    return before - target.hp
  }

  it('applies the Resonant advantage against Erratic Contact', () => {
    // backlash is Erratic — Resonant is favourable (×1.5).
    const erratic = arrayShotDamage('lance')
    // drift is Seized — Resonant is unfavourable (×0.75).
    const seized = arrayShotDamage('hulk')

    expect(erratic).toBeGreaterThan(0)
    expect(seized).toBeGreaterThan(0)
    expect(erratic).toBeGreaterThan(seized)
  })

  it('applies armour mitigation to Array shots', () => {
    // drift is Seized (Resonant ×0.75) with 8 defence. The type multiplier
    // alone would give 75; mitigation must take it below that.
    const damage = arrayShotDamage('hulk')
    expect(damage).toBeLessThan(75)
    expect(damage).toBeGreaterThan(60)
  })

  it('leaves a neutral, unarmoured target at face value', () => {
    // burr is Massed with 0 defence, and Resonant vs Massed is neutral — so
    // exactly 100 is the correct answer here, not evidence of a bypass.
    expect(arrayShotDamage('skiff')).toBeCloseTo(100, 5)
  })

  it('makes conjunction pulses type-sensitive too', () => {
    // An off-type build must not be strictly better at conjunctions.
    function pulseDamage(defId: string): number {
      const s = build()
      s.state.platforms.length = 0
      // bolt is Percussive; its conjunction effect is a damagePulse.
      placePlatform(s.state, platformById('bolt')!, 1, 0)
      placePlatform(s.state, platformById('bolt')!, 2, 0)

      const target = contactAt(s, defId, 90, 0)
      const before = target.hp
      // Run long enough for the synergy pass to fire.
      for (let i = 0; i < 4; i++) s.tick(TICK_SECONDS)
      return before - target.hp
    }

    // burr is Massed — Percussive is unfavourable (×0.75).
    // backlash is Erratic — Percussive is neutral (×1.0).
    const massed = pulseDamage('skiff')
    const erratic = pulseDamage('lance')

    expect(massed).toBeGreaterThan(0)
    expect(erratic).toBeGreaterThan(massed)
  })
})

describe('standing by', () => {
  /*
   * The between-state, asked for by a player: `wave-gap` is the only window the
   * game gives you to rearrange a formation, it is a few seconds long, and it
   * arrives on the Approach's schedule rather than yours. Standby is the same
   * window with no clock on it.
   *
   * It behaves exactly like `cleared` inside the tick, which is the point —
   * three phases wanting "the field is still there and completely still" take
   * one door rather than three.
   */

  it('stops time entirely', () => {
    sim.advance(1)
    const elapsed = state.elapsed
    const phases = state.rings.map((r) => r.phase)

    state.phase = 'standby'
    sim.advance(5)

    expect(state.elapsed).toBe(elapsed)
    expect(state.rings.map((r) => r.phase)).toEqual(phases)
  })

  it('spawns nothing', () => {
    state.phase = 'standby'
    sim.advance(30)

    expect(state.contact).toHaveLength(0)
  })

  it('does not charge the Flare', () => {
    state.flare.charge = 0
    state.phase = 'standby'
    sim.advance(30)

    expect(state.flare.charge).toBe(0)
  })

  it('does not resolve the stage in either direction', () => {
    state.phase = 'standby'
    sim.advance(60)

    expect(state.phase).toBe('standby')
  })

  it('reports nothing happened', () => {
    state.phase = 'standby'
    const events = sim.advance(10)

    expect(events.contactKilled).toBe(0)
    expect(events.salvageDropped).toBe(0)
    expect(events.sunHits).toBe(0)
    expect(events.stageCleared).toBe(false)
    expect(events.stageLost).toBe(false)
  })

  it('picks straight back up when the shift begins', () => {
    state.phase = 'standby'
    sim.advance(10)
    expect(state.elapsed).toBe(0)

    state.phase = 'wave-active'
    sim.advance(1)

    expect(state.elapsed).toBeGreaterThan(0)
  })
})
