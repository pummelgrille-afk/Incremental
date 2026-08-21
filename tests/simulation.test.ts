import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS, MAX_CATCHUP_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng, seedFrom } from '../src/lib/core/rng'
import { mountChime, placeMovement, removeMovement } from '../src/lib/core/formation'
import { movementById } from '../src/lib/content/allies'
import { chimeById } from '../src/lib/content/supportUnits'
import { computeDamage, mitigate } from '../src/lib/systems/combat'
import { updateProjectiles } from '../src/lib/systems/collision'
import { createSlack } from '../src/lib/systems/spawn'
import { slackById } from '../src/lib/content/enemies'
import { findConjunctions, timeToNextConjunction } from '../src/lib/systems/synergy'
import {
  BEAT,
  INNERMOST_RING,
  OUTERMOST_RING,
  RIM_RADIUS,
  RINGS,
  TOTAL_SLOTS,
} from '../src/lib/content/field'
import type { StageAddress } from '../src/lib/entities/Zone'
import type { SimulationState } from '../src/lib/core/simulation'

const STAGE: StageAddress = 'escapement-floor:first-shift'

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
    expect(a.state.slack.length).toBe(b.state.slack.length)
    expect(a.state.filingsEarned).toBeCloseTo(b.state.filingsEarned, 10)
    expect(a.totalSlackKilled).toBe(b.totalSlackKilled)

    // Tension is the sensitive signal: counts survive small timing jitter but
    // damage taken does not. A stray Math.random() in spawn.ts hid behind the
    // coarser assertions above until Phase 12.
    expect(a.state.mainspring.hp).toBe(b.state.mainspring.hp)
    expect(a.state.mainspring.lowestFraction).toBe(b.state.mainspring.lowestFraction)
  })

  it('produces identical entity state across two seeded runs', () => {
    const a = build()
    const b = build()
    for (let i = 0; i < 300; i++) {
      a.tick(TICK_SECONDS)
      b.tick(TICK_SECONDS)
    }

    const snapshot = (s: Simulation) =>
      s.state.slack.map((x) => [
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

describe('the Beat', () => {
  it('starts fully charged', () => {
    expect(state.beat.charge).toBe(BEAT.maxCharges)
  })

  it('spends one charge per strike', () => {
    expect(sim.strike(100, 0)).toBe(true)
    expect(state.beat.charge).toBe(BEAT.maxCharges - 1)
    expect(state.beat.struck).toBe(1)
  })

  it('refuses a second strike inside the cooldown', () => {
    expect(sim.strike(100, 0)).toBe(true)
    expect(sim.strike(100, 0)).toBe(false)
  })

  it('allows another strike once the cooldown passes', () => {
    sim.strike(100, 0)
    for (let i = 0; i < Math.ceil(BEAT.cooldown / TICK_SECONDS) + 1; i++) {
      sim.tick(TICK_SECONDS)
    }
    expect(sim.strike(100, 0)).toBe(true)
  })

  it('refuses when out of charge', () => {
    for (let i = 0; i < BEAT.maxCharges; i++) {
      expect(sim.strike(100, 0)).toBe(true)
      for (let t = 0; t < Math.ceil(BEAT.cooldown / TICK_SECONDS) + 1; t++) {
        sim.tick(TICK_SECONDS)
      }
    }
    state.beat.charge = 0
    expect(sim.strike(100, 0)).toBe(false)
  })

  it('regenerates charge on simulation time', () => {
    state.beat.charge = 0
    const seconds = BEAT.rechargeInterval
    for (let i = 0; i < seconds / TICK_SECONDS; i++) sim.tick(TICK_SECONDS)
    expect(state.beat.charge).toBeCloseTo(1, 1)
  })

  it('never exceeds its maximum charge', () => {
    for (let i = 0; i < 600; i++) sim.tick(TICK_SECONDS)
    expect(state.beat.charge).toBeLessThanOrEqual(BEAT.maxCharges)
  })

  it('damages Slack inside the blast radius', () => {
    for (let i = 0; i < 60; i++) sim.tick(TICK_SECONDS)
    const target = state.slack[0]
    expect(target).toBeDefined()

    const before = target.hp
    sim.strike(target.position.x, target.position.y)
    expect(target.hp).toBeLessThan(before)
  })

  it('leaves Slack outside the blast radius alone', () => {
    for (let i = 0; i < 60; i++) sim.tick(TICK_SECONDS)
    const target = state.slack[0]
    const before = target.hp

    // Well beyond the radius.
    sim.strike(target.position.x + BEAT.radius * 4, target.position.y)
    expect(target.hp).toBe(before)
  })

  it('hits several Slack at once, which is why it has a radius', () => {
    // Percussive is unfavourable against Massed; the blast is what keeps the
    // one manual action satisfying against the commonest armour class.
    for (let i = 0; i < 80; i++) sim.tick(TICK_SECONDS)
    const cluster = state.slack.slice(0, 3)
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

  it('never costs Tension', () => {
    // Its failure mode is damage not dealt, never damage taken.
    const before = state.mainspring.hp
    sim.strike(0, 0)
    expect(state.mainspring.hp).toBe(before)
  })

  it('does nothing once the stage is resolved', () => {
    state.phase = 'cleared'
    expect(sim.strike(100, 0)).toBe(false)
  })

  it('is optional — a stage still clears without a single strike', () => {
    // P1 held honestly: the machine really does run without you.
    const s2 = build()
    placeMovement(s2.state, movementById('detent')!, 1, 0)
    placeMovement(s2.state, movementById('detent')!, 1, 3)
    placeMovement(s2.state, movementById('hammer')!, 2, 0)
    placeMovement(s2.state, movementById('hammer')!, 2, 5)
    mountChime(s2.state, chimeById('quarter-bell')!, 0)

    let cleared = false
    for (let i = 0; i < 4000 && !cleared; i++) cleared = s2.tick(TICK_SECONDS).stageCleared

    expect(cleared).toBe(true)
    expect(s2.state.beat.struck).toBe(0)
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
  const hammer = movementById('hammer')!

  it('gives the innermost ring a defence bonus and the outermost a range bonus', () => {
    // Keyed on the derived bounds, not on the literal 1 and 3: adding an orbit
    // must not silently move the range bonus onto an interior ring.
    const inner = placeMovement(state, hammer, INNERMOST_RING, 0)
    const outer = placeMovement(state, hammer, OUTERMOST_RING, 0)
    expect(inner.bonuses.defence).toBeGreaterThan(0)
    expect(outer.bonuses.range).toBeCloseTo(0.1, 6)
  })

  it('rewards a unit flanked on both sides', () => {
    placeMovement(state, hammer, 2, 0)
    const middle = placeMovement(state, hammer, 2, 1)
    expect(middle.bonuses.attack).toBe(0)

    placeMovement(state, hammer, 2, 2)
    expect(middle.bonuses.attack).toBeCloseTo(0.1, 6)
  })

  it('wraps neighbour checks around the ring', () => {
    const slots = RINGS[0].slots
    placeMovement(state, hammer, 1, slots - 1)
    const first = placeMovement(state, hammer, 1, 0)
    placeMovement(state, hammer, 1, 1)
    expect(first.bonuses.attack).toBeCloseTo(0.1, 6)
  })

  it('grants a full-ring bonus to every unit on it', () => {
    for (let slot = 0; slot < RINGS[0].slots; slot++) placeMovement(state, hammer, 1, slot)
    for (const movement of state.movements) {
      // Full ring (+8%) and both-neighbours (+10%).
      expect(movement.bonuses.attack).toBeCloseTo(0.18, 6)
    }
  })

  it('recomputes when a unit is removed', () => {
    placeMovement(state, hammer, 2, 0)
    const middle = placeMovement(state, hammer, 2, 1)
    placeMovement(state, hammer, 2, 2)
    expect(middle.bonuses.attack).toBeCloseTo(0.1, 6)

    removeMovement(state, 2, 2)
    expect(middle.bonuses.attack).toBe(0)
  })

  it('refuses to double-occupy a slot', () => {
    placeMovement(state, hammer, 2, 3)
    expect(() => placeMovement(state, hammer, 2, 3)).toThrow()
  })

  it('refuses a slot that does not exist on that ring', () => {
    expect(() => placeMovement(state, hammer, 1, 99)).toThrow()
  })
})

describe('conjunction', () => {
  const hammer = movementById('hammer')!

  it('never counts two units on the same ring', () => {
    // Same-ring units hold a fixed offset and would otherwise fire forever.
    placeMovement(state, hammer, 2, 0)
    placeMovement(state, hammer, 2, 1)
    for (let i = 0; i < 400; i++) {
      sim.tick(TICK_SECONDS)
      expect(findConjunctions(state)).toEqual([])
    }
  })

  it('detects units on different rings sharing an angle', () => {
    // Slot 0 on every ring is angle 0 at phase 0 — aligned by construction.
    placeMovement(state, hammer, 1, 0)
    placeMovement(state, hammer, 2, 0)
    const found = findConjunctions(state)
    expect(found).toHaveLength(1)
    expect(found[0].participants).toHaveLength(2)
    expect(found[0].scale).toBe('minor')
  })

  it('scales with participant count', () => {
    placeMovement(state, hammer, 1, 0)
    placeMovement(state, hammer, 2, 0)
    placeMovement(state, hammer, 3, 0)
    expect(findConjunctions(state)[0].scale).toBe('major')
  })

  it('ignores disabled units', () => {
    const a = placeMovement(state, hammer, 1, 0)
    placeMovement(state, hammer, 2, 0)
    a.disabledFor = 5
    expect(findConjunctions(state)).toEqual([])
  })

  it('does not fire the same alignment every tick', () => {
    // The 6s per-slot-set cooldown is what stops a lingering alignment
    // machine-gunning.
    placeMovement(state, hammer, 1, 0)
    placeMovement(state, hammer, 2, 0)

    let fired = 0
    for (let i = 0; i < 20; i++) fired += sim.tick(TICK_SECONDS).conjunctionsFired
    expect(fired).toBe(1)
  })

  it('previews the time to the next alignment', () => {
    placeMovement(state, hammer, 1, 1)
    placeMovement(state, hammer, 2, 4)
    const t = timeToNextConjunction(state)
    expect(t).not.toBeNull()
    expect(t!).toBeGreaterThan(0)
  })

  it('leaves ring phases untouched after previewing', () => {
    // The preview simulates forward; it must not mutate the live state.
    placeMovement(state, hammer, 1, 1)
    placeMovement(state, hammer, 2, 4)
    const before = state.rings.map((r) => r.phase)
    timeToNextConjunction(state)
    expect(state.rings.map((r) => r.phase)).toEqual(before)
  })

  it('returns null with fewer than two units', () => {
    placeMovement(state, hammer, 1, 0)
    expect(timeToNextConjunction(state)).toBeNull()
  })
})

describe('stage progression', () => {
  it('spawns Slack on the wave schedule', () => {
    expect(state.slack).toHaveLength(0)
    for (let i = 0; i < 40; i++) sim.tick(TICK_SECONDS)
    expect(state.slack.length).toBeGreaterThan(0)
  })

  it('clears the stage when a defended field survives every wave', () => {
    const hammer = movementById('hammer')!
    const detent = movementById('detent')!
    placeMovement(state, detent, 1, 0)
    placeMovement(state, detent, 1, 3)
    placeMovement(state, hammer, 2, 0)
    placeMovement(state, hammer, 2, 5)
    mountChime(state, chimeById('quarter-bell')!, 0)

    let cleared = false
    for (let i = 0; i < 4000 && !cleared; i++) cleared = sim.tick(TICK_SECONDS).stageCleared

    expect(cleared).toBe(true)
    expect(state.phase).toBe('cleared')
    expect(state.filingsEarned).toBeGreaterThan(0)
  })

  it('loses the stage when Tension is exhausted', () => {
    state.mainspring.hp = 1
    let lost = false
    for (let i = 0; i < 2000 && !lost; i++) lost = sim.tick(TICK_SECONDS).stageLost
    expect(lost).toBe(true)
    expect(state.phase).toBe('overwhelmed')
  })

  it('stops ticking once resolved', () => {
    state.mainspring.hp = 0
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
      if (state.slack.some((s) => s.telegraphRemaining > 0)) sawTelegraph = true
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
   * Regression guard. Chime projectiles and conjunction pulses originally
   * applied raw damage, bypassing both the type multiplier and armour. That
   * made "Chimes are always Resonant" (combat-spec.md §4) meaningless, since
   * the entire reason they counter Erratic and struggle against Seized is the
   * ×1.5 / ×0.75.
   */
  function slackAt(s: Simulation, defId: string, x: number, y: number) {
    const instance = createSlack(s.state, slackById(defId)!, { x, y })
    instance.velocity = { x: 0, y: 0 }
    instance.hp = 100000
    instance.maxHp = 100000
    s.state.slack.push(instance)
    return instance
  }

  function chimeShotDamage(defId: string): number {
    const s = build()
    s.state.movements.length = 0
    const target = slackAt(s, defId, 200, 0)

    const p = s.projectiles.acquire()!
    p.faction = 'chime'
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

  it('applies the Resonant advantage against Erratic Slack', () => {
    // backlash is Erratic — Resonant is favourable (×1.5).
    const erratic = chimeShotDamage('backlash')
    // drift is Seized — Resonant is unfavourable (×0.75).
    const seized = chimeShotDamage('drift')

    expect(erratic).toBeGreaterThan(0)
    expect(seized).toBeGreaterThan(0)
    expect(erratic).toBeGreaterThan(seized)
  })

  it('applies armour mitigation to Chime shots', () => {
    // drift is Seized (Resonant ×0.75) with 8 defence. The type multiplier
    // alone would give 75; mitigation must take it below that.
    const damage = chimeShotDamage('drift')
    expect(damage).toBeLessThan(75)
    expect(damage).toBeGreaterThan(60)
  })

  it('leaves a neutral, unarmoured target at face value', () => {
    // burr is Massed with 0 defence, and Resonant vs Massed is neutral — so
    // exactly 100 is the correct answer here, not evidence of a bypass.
    expect(chimeShotDamage('burr')).toBeCloseTo(100, 5)
  })

  it('makes conjunction pulses type-sensitive too', () => {
    // An off-type build must not be strictly better at conjunctions.
    function pulseDamage(defId: string): number {
      const s = build()
      s.state.movements.length = 0
      // hammer is Percussive; its conjunction effect is a damagePulse.
      placeMovement(s.state, movementById('hammer')!, 1, 0)
      placeMovement(s.state, movementById('hammer')!, 2, 0)

      const target = slackAt(s, defId, 90, 0)
      const before = target.hp
      // Run long enough for the synergy pass to fire.
      for (let i = 0; i < 4; i++) s.tick(TICK_SECONDS)
      return before - target.hp
    }

    // burr is Massed — Percussive is unfavourable (×0.75).
    // backlash is Erratic — Percussive is neutral (×1.0).
    const massed = pulseDamage('burr')
    const erratic = pulseDamage('backlash')

    expect(massed).toBeGreaterThan(0)
    expect(erratic).toBeGreaterThan(massed)
  })
})
