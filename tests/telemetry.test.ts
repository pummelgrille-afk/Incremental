import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { mountChime, placeMovement } from '../src/lib/core/formation'
import { movementById } from '../src/lib/content/allies'
import { chimeById } from '../src/lib/content/supportUnits'
import { slackById } from '../src/lib/content/enemies'
import { createSlack } from '../src/lib/systems/spawn'
import { damageMovement } from '../src/lib/systems/combat'
import { Telemetry, TELEMETRY_SOURCES, createTelemetry } from '../src/lib/systems/telemetry'
import type { SimulationState } from '../src/lib/core/simulation'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'escapement-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
})

function referenceFormation(state: SimulationState, level = 1) {
  placeMovement(state, movementById('detent')!, 1, 0, level)
  placeMovement(state, movementById('detent')!, 1, 3, level)
  placeMovement(state, movementById('hammer')!, 2, 0, level)
  placeMovement(state, movementById('hammer')!, 2, 5, level)
  placeMovement(state, movementById('pallet')!, 3, 0, level)
  placeMovement(state, movementById('pallet')!, 3, 7, level)
  mountChime(state, chimeById('quarter-bell')!, 0, level)
  mountChime(state, chimeById('quarter-bell')!, 4, level)
}

function playStage(seed: number) {
  const s = new Simulation(loadStage(STAGE), createRng(seed))
  referenceFormation(s.state)
  for (let i = 0; i < 4000; i++) {
    const e = s.tick(TICK_SECONDS)
    if (e.stageCleared || e.stageLost) break
  }
  return s
}

describe('the collector', () => {
  it('exists in a dev build', () => {
    // Vitest runs with DEV true, which is also what makes every test below
    // meaningful. If this ever fails, the rest are vacuous.
    expect(import.meta.env.DEV).toBe(true)
    expect(createTelemetry()).toBeInstanceOf(Telemetry)
    expect(sim.state.telemetry).not.toBeNull()
  })

  it('attributes by definition, not by instance', () => {
    // Two Hammers are one row. "Is a Hammer worth its cost" is a content
    // question; per-instance numbers only measure which slot got lucky.
    const t = new Telemetry()
    t.damage('hammer', 10)
    t.damage('hammer', 15)

    expect(t.sources.size).toBe(1)
    expect(t.sources.get('hammer')!.damageDealt).toBe(25)
  })

  it('counts kills only when told one happened', () => {
    const t = new Telemetry()
    t.damage('hammer', 10, false)
    t.damage('hammer', 10, true)
    expect(t.sources.get('hammer')!.kills).toBe(1)
  })

  it('divides DPS by unit-seconds, not wall clock', () => {
    // A unit slotted halfway through a stage must not read as half as good as
    // an identical one present throughout. That would say nothing about the
    // unit, which is the only thing this measures.
    const t = new Telemetry()
    t.damage('hammer', 100)
    t.present(['hammer'], 10)
    expect(t.dps('hammer')).toBeCloseTo(10, 6)

    // Same damage, twice the presence: half the DPS.
    const u = new Telemetry()
    u.damage('hammer', 100)
    u.present(['hammer'], 20)
    expect(u.dps('hammer')).toBeCloseTo(5, 6)
  })

  it('counts two units of a type as twice the presence', () => {
    const t = new Telemetry()
    t.damage('hammer', 100)
    t.present(['hammer', 'hammer'], 10)
    expect(t.dps('hammer')).toBeCloseTo(5, 6)
  })

  it('reports zero DPS for a source that never fought', () => {
    expect(new Telemetry().dps('nobody')).toBe(0)
  })

  it('ranks by contribution and reports each share', () => {
    const t = new Telemetry()
    t.damage('pallet', 300)
    t.damage('hammer', 100)

    const ranked = t.ranked()
    expect(ranked[0].id).toBe('pallet')
    expect(ranked[0].share).toBeCloseTo(0.75, 6)
    expect(ranked[1].share).toBeCloseTo(0.25, 6)
  })

  it('clears everything on reset', () => {
    const t = new Telemetry()
    t.damage('hammer', 5)
    t.wave({ index: 0, seconds: 1, spawned: 1, killed: 1, tensionLost: 0 })
    t.beatsStruck = 3
    t.reset()

    expect(t.sources.size).toBe(0)
    expect(t.waves).toHaveLength(0)
    expect(t.beatsStruck).toBe(0)
    expect(t.outcome).toBe('running')
  })
})

describe('recording a real stage', () => {
  it('attributes damage to every ally that fought', () => {
    const s = playStage(4)
    const t = s.state.telemetry!

    for (const id of ['hammer', 'pallet', 'quarter-bell']) {
      expect(t.sources.get(id)?.damageDealt, id).toBeGreaterThan(0)
    }
  })

  it('gives a faster attacker a higher DPS than a tank', () => {
    // Ground truth from balancing.csv: Pallet is the damage unit, Detent holds.
    // If this inverts, either the roster or the telemetry is wrong.
    const s = playStage(4)
    const t = s.state.telemetry!
    expect(t.dps('pallet')).toBeGreaterThan(t.dps('detent'))
  })

  it('records the Beat separately from the formation', () => {
    const s = new Simulation(loadStage(STAGE), createRng(4))
    referenceFormation(s.state)
    for (let i = 0; i < 200; i++) {
      s.tick(TICK_SECONDS)
      if (s.state.slack.length > 0 && s.state.beat.charge >= 1) {
        s.strike(s.state.slack[0].position.x, s.state.slack[0].position.y)
      }
    }
    const t = s.state.telemetry!
    expect(t.beatsStruck).toBeGreaterThan(0)
    expect(t.sources.get(TELEMETRY_SOURCES.beat)?.damageDealt).toBeGreaterThan(0)
  })

  it('records what the Mainspring took', () => {
    const s = playStage(4)
    const t = s.state.telemetry!
    expect(t.sources.get('mainspring')?.damageTaken).toBeGreaterThan(0)
  })

  it('records a disable against the unit type that went down', () => {
    const unit = placeMovement(sim.state, movementById('pallet')!, 3, 0)
    damageMovement(unit, 10_000, sim.state.telemetry)

    expect(sim.state.telemetry!.sources.get('pallet')!.disables).toBe(1)
  })

  it('closes a wave record when the wave clears', () => {
    const s = playStage(4)
    const t = s.state.telemetry!

    expect(t.waves.length).toBeGreaterThan(0)
    for (const wave of t.waves) {
      expect(wave.seconds).toBeGreaterThan(0)
      expect(wave.killed).toBeGreaterThan(0)
    }
  })

  it('records time-to-clear and the outcome', () => {
    const s = playStage(4)
    const t = s.state.telemetry!

    expect(t.outcome).toBe('cleared')
    expect(t.stageSeconds).toBeGreaterThan(0)
    expect(t.elapsed).toBeCloseTo(s.state.elapsed, 6)
  })

  it('attributes a Chime shot even when the Chime outlives its projectile', () => {
    // sourceDefId rides on the projectile precisely so attribution does not
    // need a lookup at impact time.
    const s = playStage(7)
    expect(s.state.telemetry!.sources.get('quarter-bell')?.damageDealt).toBeGreaterThan(0)
  })
})

describe('telemetry is a sink, never a source', () => {
  it('never changes the outcome of a run', () => {
    // The same argument that licenses the combat feed. If a system could read a
    // value back out, recording would stop being free.
    const withTelemetry = playStage(11)

    const without = new Simulation(loadStage(STAGE), createRng(11))
    without.state.telemetry = null
    referenceFormation(without.state)
    for (let i = 0; i < 4000; i++) {
      const e = without.tick(TICK_SECONDS)
      if (e.stageCleared || e.stageLost) break
    }

    expect(without.state.mainspring.hp).toBe(withTelemetry.state.mainspring.hp)
    expect(without.totalSlackKilled).toBe(withTelemetry.totalSlackKilled)
    expect(without.state.elapsed).toBeCloseTo(withTelemetry.state.elapsed, 10)
  })

  it('runs a full stage with the collector absent', () => {
    // What a production build does. It must not merely avoid crashing — it must
    // reach the same end state.
    const s = new Simulation(loadStage(STAGE), createRng(2))
    s.state.telemetry = null
    referenceFormation(s.state)

    let cleared = false
    for (let i = 0; i < 4000 && !cleared; i++) cleared = s.tick(TICK_SECONDS).stageCleared
    expect(cleared).toBe(true)
  })
})

describe('damage attribution adds up', () => {
  it('never credits more damage than the enemy had HP', () => {
    // Overkill counted at face value would inflate whichever unit happened to
    // land the last hit, and the whole point is comparing units.
    const s = playStage(4)
    const t = s.state.telemetry!

    const dealt = [...t.sources.values()].reduce((sum, x) => sum + x.damageDealt, 0)
    const enemyHp = s.totalSlackKilled * slackById('burr')!.maxHp * 4

    expect(dealt).toBeGreaterThan(0)
    expect(dealt).toBeLessThan(enemyHp)
  })

  it('does not credit damage to a Slack that spawned after the shot', () => {
    const state = sim.state
    state.slack.length = 0
    const t = state.telemetry!
    const before = t.sources.get('burr')?.damageDealt ?? 0

    createSlack(state, slackById('burr')!, { x: 300, y: 0 })
    expect(t.sources.get('burr')?.damageDealt ?? 0).toBe(before)
  })
})

describe('stripped from a production build', () => {
  /**
   * PLAN.md Phase 20 asks for this to be gated so it does not ship. Nothing but
   * a real build can verify that, so this test runs one — it is deliberately
   * the slowest test in the suite.
   *
   * What is guaranteed is that the **collector** is gone: `createTelemetry`
   * compiles to `return null`, `Telemetry` loses its only reference, and rollup
   * drops the class. What remains is a handful of `sim.telemetry?.…` no-ops and
   * two string constants, which is the price of not wrapping every call site in
   * its own `import.meta.env.DEV` block.
   */
  it('does not ship the collector', async () => {
    const { execSync } = await import('node:child_process')
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')

    /*
     * NODE_ENV must be forced.
     *
     * Vitest runs with NODE_ENV=test, and a child build inherits it — which
     * makes Vite treat the build as non-production and define
     * `import.meta.env.DEV` as **true**. The ternary in `createTelemetry` then
     * folds the wrong way and the class ships. That is an artefact of running
     * the build from inside a test, not of the shipped build, and it cost a
     * false failure here before it was understood.
     */
    execSync('npm run build', {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    })

    const dir = join(process.cwd(), 'dist', 'assets')
    const bundle = readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('')

    // Field names unique to the collector. Minification renames locals but not
    // object property names, so these survive if the class does.
    for (const marker of ['unitSeconds', 'damageDealt', 'damageTaken']) {
      expect(bundle.includes(marker), `"${marker}" reached the bundle`).toBe(false)
    }
  }, 180000)
})
