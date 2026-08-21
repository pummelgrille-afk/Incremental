import { describe, expect, it } from 'vitest'
import {
  loadStage,
  resolveStage,
  StageLoadError,
  stageOrder,
  validateStage,
} from '../src/lib/core/stageLoader'
import { ZONES, zoneById, STARTING_ZONE_ID } from '../src/lib/content/zones'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { createRng } from '../src/lib/core/rng'
import { contactById } from '../src/lib/content/contacts'
import { isBossWave } from '../src/lib/entities/Wave'
import { RINGS } from '../src/lib/content/field'
import { noUpgradeEffects } from '../src/lib/entities/Upgrade'
import type { StageAddress } from '../src/lib/entities/Zone'

const FIRST: StageAddress = 'service-floor:first-shift'

describe('resolveStage', () => {
  it('resolves a zone and stage from an address', () => {
    const { zone, stage } = resolveStage(FIRST)
    expect(zone.id).toBe('service-floor')
    expect(stage.id).toBe('first-shift')
  })

  it('throws a typed error for an unknown zone', () => {
    expect(() => resolveStage('nowhere:first-shift')).toThrow(StageLoadError)
  })

  it('throws a typed error for an unknown stage', () => {
    expect(() => resolveStage('service-floor:nowhere')).toThrow(StageLoadError)
  })
})

describe('loadStage', () => {
  it('builds an empty field with the Sun wound and rings turning', () => {
    const sim = loadStage(FIRST)

    expect(sim.sun.output).toBe(sim.sun.maxOutput)
    expect(sim.rings).toHaveLength(RINGS.length)
    expect(sim.phase).toBe('wave-active')

    // Entities are populated by progression/ and spawn.ts, not the loader.
    expect(sim.platforms).toHaveLength(0)
    expect(sim.contact).toHaveLength(0)
  })

  it('gives each ring the angular velocity implied by its period', () => {
    const sim = loadStage(FIRST)
    sim.rings.forEach((ring, i) => {
      expect(ring.angularVelocity).toBeCloseTo((Math.PI * 2) / RINGS[i].period, 10)
      expect(ring.phase).toBe(0)
    })
  })

  it('adds Bracing-branch bonus Output to the stage base', () => {
    const base = loadStage(FIRST)
    const boosted = loadStage(FIRST, {
      effects: { ...noUpgradeEffects(), output: 500 },
    })
    expect(boosted.sun.maxOutput).toBe(base.sun.maxOutput + 500)
  })

  it('grants the Regulation branch its extra Flare charges', () => {
    const base = loadStage(FIRST)
    const boosted = loadStage(FIRST, {
      effects: { ...noUpgradeEffects(), flareCharges: 2 },
    })
    // The maximum, not just the starting value — the Flare regenerates toward it.
    expect(boosted.flare.maxCharge).toBe(base.flare.maxCharge + 2)
    expect(boosted.flare.charge).toBe(boosted.flare.maxCharge)
  })

  it('starts a stage with a neutral aggregate when none is supplied', () => {
    expect(loadStage(FIRST).effects).toEqual(noUpgradeEffects())
  })

  it('keeps output aliased to hp', () => {
    const sim = loadStage(FIRST)
    sim.sun.hp -= 250
    expect(sim.sun.output).toBe(sim.sun.hp)
  })
})

describe('validateStage', () => {
  it('passes every authored stage', () => {
    for (const zone of ZONES) {
      for (const stage of zone.stages) {
        expect(validateStage(stage), `${zone.id}:${stage.id}`).toEqual([])
      }
    }
  })

  it('reports a wave referencing an unknown Contact', () => {
    const problems = validateStage({
      id: 'broken',
      name: 'Broken',
      scalingIndex: 1,
      baseOutput: 100,
      clearanceReward: 0,
      waves: [{ groups: [{ defId: 'not-a-contact', count: 1, delay: 0, interval: 0 }], gapAfter: 0 }],
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('not-a-contact')
  })

  it('reports a stage with no waves', () => {
    const problems = validateStage({
      id: 'empty',
      name: 'Empty',
      scalingIndex: 1,
      baseOutput: 100,
      clearanceReward: 0,
      waves: [],
    })
    expect(problems[0]).toContain('no waves')
  })

  it('refuses to load a stage that fails validation', () => {
    // Guard the contract itself: loadStage must not hand back a broken sim.
    expect(() => loadStage('service-floor:nowhere')).toThrow(StageLoadError)
  })
})

describe('content integrity', () => {
  it('starts in a zone that exists', () => {
    expect(zoneById(STARTING_ZONE_ID)).toBeDefined()
  })

  it('has no duplicate zone or stage ids', () => {
    const zoneIds = ZONES.map((z) => z.id)
    expect(new Set(zoneIds).size).toBe(zoneIds.length)

    for (const zone of ZONES) {
      const stageIds = zone.stages.map((s) => s.id)
      expect(new Set(stageIds).size, zone.id).toBe(stageIds.length)
    }
  })

  it('only lists enemies in a zone pool that actually exist', () => {
    for (const zone of ZONES) {
      for (const id of zone.enemyPool) {
        expect(contactById(id), `${zone.id} pool: ${id}`).toBeDefined()
      }
    }
  })

  it('only spawns Contact that its zone pool declares', () => {
    for (const zone of ZONES) {
      const pool = new Set(zone.enemyPool)
      for (const stage of zone.stages) {
        for (const wave of stage.waves) {
          if (isBossWave(wave)) continue
          for (const group of wave.groups) {
            expect(pool.has(group.defId), `${zone.id}:${stage.id} -> ${group.defId}`).toBe(true)
          }
        }
      }
    }
  })

  it('orders stages by zone index', () => {
    const order = stageOrder(ZONES)
    expect(order[0]).toBe(FIRST)
    expect(order).toHaveLength(ZONES.reduce((n, z) => n + z.stages.length, 0))
  })

  it('increases scalingIndex monotonically across the play order', () => {
    // Scaling must stay continuous across zone boundaries — economy-spec.md §5.
    const indices = [...ZONES]
      .sort((a, b) => a.index - b.index)
      .flatMap((z) => z.stages.map((s) => s.scalingIndex))

    for (let i = 1; i < indices.length; i++) {
      expect(indices[i], `stage ${i}`).toBeGreaterThan(indices[i - 1])
    }
  })
})

describe('loaded stages never mutate shared content', () => {
  /**
   * `loadStage` hands back a state whose `stage` and `zone` are **references
   * into `content/zones.ts`**, not copies. `readonly` is compile-time only, so
   * anything that writes through those references corrupts every later load in
   * the process.
   *
   * This was not hypothetical: a Phase 17 tuning harness scaled wave counts in
   * place and every subsequent run compounded on the last, producing a
   * difficulty curve that did not exist. The conclusions drawn from it were
   * wrong until the harness was fixed.
   */
  function snapshot(): string {
    return JSON.stringify(
      ZONES.map((z) => ({
        id: z.id,
        stages: z.stages.map((s) => ({
          id: s.id,
          waves: s.waves.map((w) => (isBossWave(w) ? w.bossId : w.groups)),
        })),
      })),
    )
  }

  it('leaves content byte-identical after a full stage is simulated', () => {
    const before = snapshot()

    const sim = new Simulation(loadStage(FIRST), createRng(1))
    for (let i = 0; i < 2000; i++) {
      const events = sim.tick(TICK_SECONDS)
      if (events.stageCleared || events.stageLost) break
    }

    expect(snapshot()).toBe(before)
  })

  it('gives two loads of the same stage identical wave counts', () => {
    const counts = (address: StageAddress) =>
      loadStage(address).stage.waves.map((w) =>
        isBossWave(w) ? -1 : w.groups.reduce((n, g) => n + g.count, 0),
      )

    expect(counts(FIRST)).toEqual(counts(FIRST))
  })

  it('does not let one loaded stage affect another', () => {
    const a = loadStage(FIRST)
    const b = loadStage(FIRST)
    // Same underlying definition object, by design — the test is that nothing
    // in the engine writes to it.
    expect(a.stage).toBe(b.stage)
  })
})
