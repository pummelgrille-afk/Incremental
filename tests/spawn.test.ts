import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { createSlack, updateSlackMotion } from '../src/lib/systems/spawn'
import { damageSlack, reapSlack } from '../src/lib/systems/combat'
import { SLACK, slackById } from '../src/lib/content/enemies'
import { ZONES } from '../src/lib/content/zones'
import { isBossWave } from '../src/lib/entities/Wave'
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

function spawn(defId: string, radius: number, angle = 0): SlackInstance {
  const instance = createSlack(sim.state, slackById(defId)!, {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  })
  sim.state.slack.push(instance)
  return instance
}

const radiusOf = (s: SlackInstance) => Math.hypot(s.position.x, s.position.y)

describe('motion archetypes', () => {
  it('drift closes on the Mainspring steadily', () => {
    const s = spawn('drift', 320)
    const before = radiusOf(s)
    for (let i = 0; i < 40; i++) updateSlackMotion(sim.state, TICK_SECONDS)
    expect(radiusOf(s)).toBeLessThan(before)
  })

  it('swarm closes too, but not in a straight line', () => {
    const s = spawn('burr', 320, 0)
    for (let i = 0; i < 40; i++) updateSlackMotion(sim.state, TICK_SECONDS)
    expect(radiusOf(s)).toBeLessThan(320)
    // The weave puts it off the radial it started on.
    expect(Math.abs(s.position.y)).toBeGreaterThan(0)
  })

  it('charge accelerates once inside the outer ring', () => {
    const outside = spawn('backlash', 300)
    const inside = spawn('backlash', 200)

    updateSlackMotion(sim.state, TICK_SECONDS)

    const outsideSpeed = Math.hypot(outside.velocity.x, outside.velocity.y)
    const insideSpeed = Math.hypot(inside.velocity.x, inside.velocity.y)
    expect(insideSpeed).toBeGreaterThan(outsideSpeed)
  })

  it('orbit closes until it reaches its radius, then circles', () => {
    const s = spawn('fret', 320)
    const target = slackById('fret')!.traits!.orbitRadius!

    // Closes.
    for (let i = 0; i < 200; i++) {
      updateSlackMotion(sim.state, TICK_SECONDS)
      if (radiusOf(s) <= target + 5) break
    }
    expect(radiusOf(s)).toBeLessThanOrEqual(target + 5)

    // Then holds it exactly, rather than drifting in a band.
    for (let i = 0; i < 100; i++) updateSlackMotion(sim.state, TICK_SECONDS)
    expect(radiusOf(s)).toBeCloseTo(target, 6)
  })

  it('orbit actually moves around rather than sitting still', () => {
    const s = spawn('fret', 206)
    const startAngle = Math.atan2(s.position.y, s.position.x)
    for (let i = 0; i < 60; i++) updateSlackMotion(sim.state, TICK_SECONDS)
    expect(Math.atan2(s.position.y, s.position.x)).not.toBeCloseTo(startAngle, 2)
  })

  it('orbiters split direction, so they do not form one convoy', () => {
    const a = spawn('fret', 206, 0)
    const b = spawn('fret', 206, 0)
    // Ids differ in parity, so the two circle opposite ways. Check velocity.y:
    // at angle 0 the tangent is vertical, so velocity.x is zero for both and
    // its sign carries no information.
    for (let i = 0; i < 20; i++) updateSlackMotion(sim.state, TICK_SECONDS)
    expect(Math.sign(a.velocity.y)).not.toBe(Math.sign(b.velocity.y))
    expect(Math.sign(a.velocity.y)).not.toBe(0)
  })
})

describe('shielded', () => {
  it('absorbs a fixed number of hits regardless of their size', () => {
    const s = spawn('cant', 200)
    const shields = slackById('cant')!.traits!.shieldHits!
    const full = s.hp

    for (let i = 0; i < shields; i++) {
      expect(damageSlack(s, 9999)).toBe(false)
      expect(s.hp).toBe(full)
    }

    // The next hit lands.
    damageSlack(s, 10)
    expect(s.hp).toBeLessThan(full)
  })
})

describe('telegraph vulnerability', () => {
  it('takes multiplied damage while winding up', () => {
    const plain = spawn('fret', 200)
    const exposed = spawn('fret', 200)
    const multiplier = slackById('fret')!.traits!.vulnerableWhileTelegraphing!

    exposed.telegraphRemaining = 0.4

    damageSlack(plain, 100)
    damageSlack(exposed, 100)

    const plainLoss = plain.maxHp - plain.hp
    const exposedLoss = exposed.maxHp - exposed.hp
    expect(exposedLoss).toBeCloseTo(plainLoss * multiplier, 5)
  })

  it('leaves a Slack without the trait unaffected', () => {
    const s = spawn('burr', 200)
    s.telegraphRemaining = 0.4
    const before = s.hp
    damageSlack(s, 5)
    expect(before - s.hp).toBeCloseTo(5, 6)
  })
})

describe('splitters', () => {
  it('spawns children on death', () => {
    const parent = spawn('wear', 200)
    const split = slackById('wear')!.traits!.splitsInto!

    reapSlack(sim.state, new Set([parent.id]))

    expect(sim.state.slack).toHaveLength(split.count)
    expect(sim.state.slack.every((s) => s.def.id === split.defId)).toBe(true)
  })

  it('places children near the parent but not stacked on one point', () => {
    const parent = spawn('wear', 200)
    parent.velocity = { x: -30, y: 0 }
    const at = { ...parent.position }

    reapSlack(sim.state, new Set([parent.id]))

    const positions = sim.state.slack.map((s) => `${s.position.x},${s.position.y}`)
    expect(new Set(positions).size).toBe(sim.state.slack.length)

    for (const child of sim.state.slack) {
      const offset = Math.hypot(child.position.x - at.x, child.position.y - at.y)
      expect(offset).toBeLessThan(40)
    }
  })

  it('still awards the parent its Filings', () => {
    const parent = spawn('wear', 200)
    const result = reapSlack(sim.state, new Set([parent.id]))
    expect(result.filingsDropped).toBeGreaterThan(0)
    expect(result.slackKilled).toBe(1)
  })

  it('children exist immediately, so a wave cannot read as cleared', () => {
    // Spawning them a step later would leave sim.slack empty for one tick, and
    // objectiveRules would call the wave complete.
    const parent = spawn('wear', 200)
    reapSlack(sim.state, new Set([parent.id]))
    expect(sim.state.slack.length).toBeGreaterThan(0)
  })

  it('does not split a Slack without the trait', () => {
    const s = spawn('burr', 200)
    reapSlack(sim.state, new Set([s.id]))
    expect(sim.state.slack).toHaveLength(0)
  })
})

describe('content integrity', () => {
  /**
   * Nothing clamps splitting at runtime, by design — clamping would rewrite
   * authored difficulty. So a split cycle must be impossible to author.
   */
  it('has no split cycles', () => {
    for (const def of SLACK) {
      const seen = new Set<string>([def.id])
      let current = def.traits?.splitsInto?.defId

      let depth = 0
      while (current) {
        expect(seen.has(current), `split cycle reaching "${current}"`).toBe(false)
        seen.add(current)
        current = slackById(current)?.traits?.splitsInto?.defId
        expect(++depth, `split chain from "${def.id}" too deep`).toBeLessThan(8)
      }
    }
  })

  it('only splits into Slack that exist', () => {
    for (const def of SLACK) {
      const child = def.traits?.splitsInto?.defId
      if (child) expect(slackById(child), `${def.id} -> ${child}`).toBeDefined()
    }
  })

  it('gives every behavioural hook at least one live user', () => {
    // A hook with no content using it is untested configuration.
    expect(SLACK.some((s) => s.traits?.splitsInto)).toBe(true)
    expect(SLACK.some((s) => s.traits?.shieldHits)).toBe(true)
    expect(SLACK.some((s) => s.traits?.vulnerableWhileTelegraphing)).toBe(true)
    expect(SLACK.some((s) => s.motion === 'orbit')).toBe(true)
    expect(SLACK.some((s) => s.motion === 'charge')).toBe(true)
    expect(SLACK.some((s) => s.motion === 'swarm')).toBe(true)
    expect(SLACK.some((s) => s.motion === 'drift')).toBe(true)
  })

  it('keeps every authored wave inside its zone enemy pool', () => {
    for (const zone of ZONES) {
      const pool = new Set(zone.enemyPool)
      for (const stage of zone.stages) {
        for (const wave of stage.waves) {
          if (isBossWave(wave)) continue
          for (const group of wave.groups) {
            expect(pool.has(group.defId), `${zone.id}:${stage.id} -> ${group.defId}`).toBe(
              true,
            )
          }
        }
      }
    }
  })
})
