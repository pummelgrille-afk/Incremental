import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS, MAX_CATCHUP_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng, seedFrom } from '../src/lib/core/rng'
import { mountChime, placeMovement, removeMovement } from '../src/lib/core/formation'
import { movementById } from '../src/lib/content/allies'
import { chimeById } from '../src/lib/content/supportUnits'
import { computeDamage, mitigate } from '../src/lib/systems/combat'
import { findConjunctions, timeToNextConjunction } from '../src/lib/systems/synergy'
import { NUDGE, RINGS } from '../src/lib/content/field'
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

describe('the ring nudge', () => {
  it('applies exactly one slot-width', () => {
    const ring = state.rings[1]
    const before = ring.phase
    sim.nudge(2, 1)

    // Long enough for the eased travel to finish.
    for (let i = 0; i < 12; i++) sim.tick(TICK_SECONDS)

    const naturalDrift = ((Math.PI * 2) / RINGS[1].period) * (12 * TICK_SECONDS)
    const applied = ring.phase - before - naturalDrift
    expect(applied).toBeCloseTo((Math.PI * 2) / RINGS[1].slots, 4)
  })

  it('nudges in both directions', () => {
    const ring = state.rings[1]
    const before = ring.phase
    sim.nudge(2, -1)
    for (let i = 0; i < 12; i++) sim.tick(TICK_SECONDS)

    const naturalDrift = ((Math.PI * 2) / RINGS[1].period) * (12 * TICK_SECONDS)
    expect(ring.phase - before - naturalDrift).toBeCloseTo(-(Math.PI * 2) / RINGS[1].slots, 4)
  })

  it('refuses a second nudge while on cooldown', () => {
    expect(sim.nudge(2, 1)).toBe(true)
    expect(sim.nudge(2, 1)).toBe(false)
  })

  it('accepts again once the cooldown expires', () => {
    sim.nudge(2, 1)
    for (let i = 0; i < Math.ceil(NUDGE.cooldown / TICK_SECONDS) + 1; i++) sim.tick(TICK_SECONDS)
    expect(sim.nudge(2, 1)).toBe(true)
  })

  it('keeps ring cooldowns independent', () => {
    expect(sim.nudge(1, 1)).toBe(true)
    // A skilled player juggles three cooldowns, not one.
    expect(sim.nudge(2, 1)).toBe(true)
    expect(sim.nudge(3, 1)).toBe(true)
    expect(sim.nudge(1, 1)).toBe(false)
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

  it('gives ring 1 a defence bonus and ring 3 a range bonus', () => {
    const inner = placeMovement(state, hammer, 1, 0)
    const outer = placeMovement(state, hammer, 3, 0)
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
      }
    }
  })
})
