import { describe, expect, it } from 'vitest'
import {
  loadStage,
  resolveStage,
  StageLoadError,
  stageOrder,
  validateStage,
} from '../src/lib/core/stageLoader'
import { ZONES, zoneById, STARTING_ZONE_ID } from '../src/lib/content/zones'
import { slackById } from '../src/lib/content/enemies'
import { isBossWave } from '../src/lib/entities/Wave'
import { RINGS } from '../src/lib/content/field'
import type { StageAddress } from '../src/lib/entities/Zone'

const FIRST: StageAddress = 'escapement-floor:first-shift'

describe('resolveStage', () => {
  it('resolves a zone and stage from an address', () => {
    const { zone, stage } = resolveStage(FIRST)
    expect(zone.id).toBe('escapement-floor')
    expect(stage.id).toBe('first-shift')
  })

  it('throws a typed error for an unknown zone', () => {
    expect(() => resolveStage('nowhere:first-shift')).toThrow(StageLoadError)
  })

  it('throws a typed error for an unknown stage', () => {
    expect(() => resolveStage('escapement-floor:nowhere')).toThrow(StageLoadError)
  })
})

describe('loadStage', () => {
  it('builds an empty field with the Mainspring wound and rings turning', () => {
    const sim = loadStage(FIRST)

    expect(sim.mainspring.tension).toBe(sim.mainspring.maxTension)
    expect(sim.rings).toHaveLength(RINGS.length)
    expect(sim.phase).toBe('wave-active')

    // Entities are populated by progression/ and spawn.ts, not the loader.
    expect(sim.movements).toHaveLength(0)
    expect(sim.slack).toHaveLength(0)
  })

  it('gives each ring the angular velocity implied by its period', () => {
    const sim = loadStage(FIRST)
    sim.rings.forEach((ring, i) => {
      expect(ring.angularVelocity).toBeCloseTo((Math.PI * 2) / RINGS[i].period, 10)
      expect(ring.phase).toBe(0)
    })
  })

  it('adds Bracing-branch bonus Tension to the stage base', () => {
    const base = loadStage(FIRST)
    const boosted = loadStage(FIRST, { bonusTension: 500 })
    expect(boosted.mainspring.maxTension).toBe(base.mainspring.maxTension + 500)
  })

  it('keeps tension aliased to hp', () => {
    const sim = loadStage(FIRST)
    sim.mainspring.hp -= 250
    expect(sim.mainspring.tension).toBe(sim.mainspring.hp)
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

  it('reports a wave referencing an unknown Slack', () => {
    const problems = validateStage({
      id: 'broken',
      name: 'Broken',
      scalingIndex: 1,
      baseTension: 100,
      keyReward: 0,
      waves: [{ groups: [{ defId: 'not-a-slack', count: 1, delay: 0, interval: 0 }], gapAfter: 0 }],
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('not-a-slack')
  })

  it('reports a stage with no waves', () => {
    const problems = validateStage({
      id: 'empty',
      name: 'Empty',
      scalingIndex: 1,
      baseTension: 100,
      keyReward: 0,
      waves: [],
    })
    expect(problems[0]).toContain('no waves')
  })

  it('refuses to load a stage that fails validation', () => {
    // Guard the contract itself: loadStage must not hand back a broken sim.
    expect(() => loadStage('escapement-floor:nowhere')).toThrow(StageLoadError)
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
        expect(slackById(id), `${zone.id} pool: ${id}`).toBeDefined()
      }
    }
  })

  it('only spawns Slack that its zone pool declares', () => {
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
