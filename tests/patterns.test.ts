import { describe, expect, it } from 'vitest'
import {
  MIN_TELEGRAPH_MS,
  PATTERNS,
  aimed,
  converge,
  patternById,
  ring,
  spiral,
  spread,
  wall,
  type PatternContext,
} from '../src/lib/systems/patterns'
import { SLACK } from '../src/lib/content/enemies'
import { BUDGETS } from '../src/lib/content/budgets'
import { SPAWN_RADIUS } from '../src/lib/content/field'

/** Emitter out at the rim, firing at the Mainspring. */
function context(overrides: Partial<PatternContext> = {}): PatternContext {
  return {
    origin: { x: 300, y: 0 },
    target: { x: 0, y: 0 },
    damage: 10,
    damageType: 'percussive',
    emitterPhase: 0,
    ...overrides,
  }
}

const speedOf = (v: { x: number; y: number }) => Math.hypot(v.x, v.y)
const angleOf = (v: { x: number; y: number }) => Math.atan2(v.y, v.x)

/**
 * Shortest signed angle between two bearings.
 *
 * Raw atan2 values cannot be compared directly: a shot aimed left is -π or +π
 * depending on the sign of a near-zero y, and a spread straddling π wraps so
 * max-min reports nearly 2π. Every angular assertion below goes through this.
 */
function delta(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d <= -Math.PI) d += Math.PI * 2
  return d
}

/** Angular span of a set of bearings, measured relative to their first. */
function span(angles: number[]): number {
  const relative = angles.map((a) => delta(angles[0], a))
  return Math.max(...relative) - Math.min(...relative)
}

/** Does this velocity carry the projectile toward the origin? */
function headingInward(spawn: { position: { x: number; y: number }; velocity: { x: number; y: number } }) {
  const toCentre = Math.atan2(-spawn.position.y, -spawn.position.x)
  let delta = angleOf(spawn.velocity) - toCentre
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta <= -Math.PI) delta += Math.PI * 2
  return Math.abs(delta) < Math.PI / 2
}

describe('patterns are pure', () => {
  it('return the same descriptors for the same context', () => {
    const build = spread(5, 1, 100)
    expect(build(context())).toEqual(build(context()))
  })

  it('never mutate the context they are given', () => {
    const ctx = context()
    const snapshot = JSON.parse(JSON.stringify(ctx))
    for (const pattern of PATTERNS) pattern.build(ctx)
    expect(JSON.parse(JSON.stringify(ctx))).toEqual(snapshot)
  })

  it('hand back fresh position objects, not shared references', () => {
    // A shared object would make every projectile move as one.
    const spawns = ring(6, 100)(context())
    spawns[0].position.x = 9999
    expect(spawns[1].position.x).not.toBe(9999)
  })
})

describe('spread', () => {
  it('centres a single projectile on the target rather than off to one side', () => {
    const [only] = spread(1, Math.PI / 2, 100)(context())
    expect(delta(angleOf(only.velocity), Math.PI)).toBeCloseTo(0, 6)
  })

  it('fans across the requested arc', () => {
    const arc = Math.PI / 3
    const spawns = spread(5, arc, 100)(context())
    expect(span(spawns.map((s) => angleOf(s.velocity)))).toBeCloseTo(arc, 6)
  })
})

describe('aimed', () => {
  it('fires straight at the target', () => {
    const [shot] = aimed(150)(context())
    expect(delta(angleOf(shot.velocity), Math.PI)).toBeCloseTo(0, 6)
  })

  it('follows the target when it moves', () => {
    const [shot] = aimed(150)(context({ target: { x: 300, y: 300 } }))
    expect(delta(angleOf(shot.velocity), Math.PI / 2)).toBeCloseTo(0, 6)
  })
})

describe('ring', () => {
  it('covers the full circle evenly', () => {
    const spawns = ring(8, 90)(context())
    expect(spawns).toHaveLength(8)
    const base = angleOf(spawns[0].velocity)
    const relative = spawns
      .map((s) => (delta(base, angleOf(s.velocity)) + Math.PI * 2) % (Math.PI * 2))
      .sort((a, b) => a - b)
    for (let i = 1; i < relative.length; i++) {
      expect(relative[i] - relative[i - 1]).toBeCloseTo((Math.PI * 2) / 8, 5)
    }
  })

  it('rotates between emissions so shells do not stack into corridors', () => {
    const first = ring(8, 90)(context({ emitterPhase: 0 }))
    const second = ring(8, 90)(context({ emitterPhase: 0.3 }))
    expect(angleOf(first[0].velocity)).not.toBeCloseTo(angleOf(second[0].velocity), 3)
  })
})

describe('spiral', () => {
  it('gives every projectile a curve, which is what makes it a spiral', () => {
    const spawns = spiral(4, 95, 0.9)(context())
    expect(spawns).toHaveLength(4)
    expect(spawns.every((s) => s.angularVelocity !== 0)).toBe(true)
  })

  it('curves every arm the same way, so the arms stay parallel', () => {
    const spawns = spiral(4, 95, 0.9)(context())
    const curves = new Set(spawns.map((s) => s.angularVelocity))
    expect(curves.size).toBe(1)
  })

  it('spaces the arms evenly around the emitter', () => {
    const spawns = spiral(6, 95, 0.5)(context())
    const base = angleOf(spawns[0].velocity)
    const relative = spawns
      .map((s) => (delta(base, angleOf(s.velocity)) + Math.PI * 2) % (Math.PI * 2))
      .sort((a, b) => a - b)
    for (let i = 1; i < relative.length; i++) {
      expect(relative[i] - relative[i - 1]).toBeCloseTo((Math.PI * 2) / 6, 5)
    }
  })
})

describe('wall', () => {
  it('leaves a gap', () => {
    const count = 9
    const gap = 2
    const spawns = wall(count, Math.PI / 2, 100, gap)(context())
    expect(spawns.length).toBe(count - gap)
  })

  it('leaves the gap contiguous, not scattered', () => {
    // A scattered gap is a guessing game; a contiguous one can be read.
    const spawns = wall(11, Math.PI / 2, 100, 3)(context({ emitterPhase: 0.7 }))
    const base = angleOf(spawns[0].velocity)
    const angles = spawns
      .map((s) => delta(base, angleOf(s.velocity)))
      .sort((a, b) => a - b)

    const steps = angles.slice(1).map((a, i) => a - angles[i])
    const smallest = Math.min(...steps)
    const oversized = steps.filter((s) => s > smallest * 1.5)
    expect(oversized).toHaveLength(1)
  })

  it('moves the gap between emissions, so one wall is not solvable forever', () => {
    const a = wall(11, Math.PI / 2, 100, 2)(context({ emitterPhase: 0 }))
    const b = wall(11, Math.PI / 2, 100, 2)(context({ emitterPhase: 1.2 }))
    expect(a.map((s) => +angleOf(s.velocity).toFixed(4))).not.toEqual(
      b.map((s) => +angleOf(s.velocity).toFixed(4)),
    )
  })
})

describe('converge', () => {
  it('spawns at the rim, not at the emitter', () => {
    const spawns = converge(7, Math.PI / 3, 90, SPAWN_RADIUS)(context())
    for (const s of spawns) {
      expect(Math.hypot(s.position.x, s.position.y)).toBeCloseTo(SPAWN_RADIUS, 4)
    }
  })

  it('sends every projectile inward', () => {
    const spawns = converge(7, Math.PI / 3, 90, SPAWN_RADIUS)(context())
    expect(spawns.every(headingInward)).toBe(true)
  })

  it('centres the wedge on the emitter, so it reads as that Slack doing it', () => {
    // A field-wide version would be unattributable — a legibility failure.
    const spawns = converge(7, Math.PI / 3, 90, SPAWN_RADIUS)(
      context({ origin: { x: 0, y: 300 } }),
    )
    const offsets = spawns.map((s) =>
      delta(Math.PI / 2, Math.atan2(s.position.y, s.position.x)),
    )
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length
    expect(mean).toBeCloseTo(0, 5)
  })
})

describe('the telegraph floor is non-negotiable', () => {
  it('gives every pattern at least the minimum warning', () => {
    // combat-spec.md §5: a pattern that can kill without warning is a bug, not
    // a difficulty setting.
    for (const pattern of PATTERNS) {
      expect(pattern.telegraphMs, pattern.id).toBeGreaterThanOrEqual(MIN_TELEGRAPH_MS)
    }
  })

  it('warns longer for patterns that deny more ground', () => {
    const single = patternById('aimed-1')!
    const wedge = patternById('converge-7')!
    expect(wedge.telegraphMs).toBeGreaterThan(single.telegraphMs)
  })
})

describe('tone: readable pressure, not danmaku', () => {
  it('keeps projectile speeds slow enough to read', () => {
    // Rim to centre in roughly 2-4 s. Faster removes the reading window that
    // makes the Beat a decision rather than a reflex.
    for (const pattern of PATTERNS) {
      for (const spawn of pattern.build(context())) {
        const speed = speedOf(spawn.velocity)
        expect(speed, pattern.id).toBeGreaterThan(50)
        expect(speed, pattern.id).toBeLessThanOrEqual(160)
      }
    }
  })

  it('keeps emissions in single digits', () => {
    // Pressure comes from several Slack on staggered cadences, not one curtain.
    for (const pattern of PATTERNS) {
      expect(pattern.build(context()).length, pattern.id).toBeLessThan(10)
    }
  })

  it('leaves most of the projectile budget unspent for bosses', () => {
    const worstCase = Math.max(...PATTERNS.map((p) => p.build(context()).length))
    expect(worstCase * SLACK.length).toBeLessThan(BUDGETS.projectiles / 2)
  })
})

describe('content wiring', () => {
  it('gives every Slack a pattern that exists', () => {
    for (const def of SLACK) {
      expect(patternById(def.patternId), `${def.id} -> ${def.patternId}`).toBeDefined()
    }
  })

  it('gives every pattern at least one user', () => {
    // An unused pattern is untested configuration.
    const used = new Set(SLACK.map((s) => s.patternId))
    for (const pattern of PATTERNS) {
      expect(used.has(pattern.id), `${pattern.id} has no user`).toBe(true)
    }
  })

  it('has no duplicate pattern ids', () => {
    const ids = PATTERNS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
