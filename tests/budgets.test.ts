import { describe, expect, it } from 'vitest'
import { BUDGETS, FRAME_BUDGET_MS, TARGET_FRAME_MS } from '../src/lib/content/budgets'
import { ZONES } from '../src/lib/content/zones'
import { isBossWave } from '../src/lib/entities/Wave'
import { RIM_MOUNTS, TOTAL_SLOTS } from '../src/lib/content/field'
import { PROJECTILE_BUDGET, Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { createContact } from '../src/lib/systems/spawn'
import { contactById } from '../src/lib/content/contacts'
import type { StageAddress } from '../src/lib/entities/Zone'

describe('budget definitions', () => {
  it('leaves headroom inside the 60 fps frame', () => {
    expect(TARGET_FRAME_MS).toBeLessThan(FRAME_BUDGET_MS)

    expect(TARGET_FRAME_MS / FRAME_BUDGET_MS).toBeLessThanOrEqual(0.75)
  })

  it('matches the projectile budget the pool is built with', () => {
    expect(PROJECTILE_BUDGET).toBe(BUDGETS.projectiles)
  })

  it('sizes the unit budget to the field that exists', () => {
    expect(BUDGETS.units).toBe(TOTAL_SLOTS + RIM_MOUNTS)
  })
})

describe('content stays inside the Contact budget', () => {
  function worstCaseConcurrent(waveGroups: readonly { count: number }[]): number {
    return waveGroups.reduce((n, g) => n + g.count, 0)
  }

  it('never schedules more concurrent Contact than the budget allows', () => {
    const overruns: string[] = []

    for (const zone of ZONES) {
      for (const stage of zone.stages) {
        for (const [index, wave] of stage.waves.entries()) {
          if (isBossWave(wave)) continue
          const peak = worstCaseConcurrent(wave.groups)
          if (peak > BUDGETS.contact) {
            overruns.push(`${zone.id}:${stage.id} wave ${index} schedules ${peak}`)
          }
        }
      }
    }

    expect(overruns).toEqual([])
  })

  it('reports the actual headroom, so tightening the budget is an informed choice', () => {
    let worst = 0
    for (const zone of ZONES) {
      for (const stage of zone.stages) {
        for (const wave of stage.waves) {
          if (isBossWave(wave)) continue
          worst = Math.max(worst, worstCaseConcurrent(wave.groups))
        }
      }
    }

    expect(worst).toBeLessThan(BUDGETS.contact)
  })
})

describe('runtime instrumentation', () => {
  const STAGE: StageAddress = 'service-floor:first-shift'

  function flood(sim: Simulation, count: number): void {
    const def = contactById('skiff')!
    for (let i = sim.state.contact.length; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      sim.state.contact.push(
        createContact(sim.state, def, {
          x: Math.cos(angle) * 320,
          y: Math.sin(angle) * 320,
        }),
      )
    }
  }

  it('tracks peak Contact without clamping it', () => {
    const sim = new Simulation(loadStage(STAGE), createRng(1))
    flood(sim, 50)
    sim.tick(TICK_SECONDS)

    expect(sim.peakContact).toBeGreaterThanOrEqual(50)

    expect(sim.state.contact.length).toBeGreaterThanOrEqual(50)
  })

  it('counts ticks spent over budget rather than truncating', () => {
    const sim = new Simulation(loadStage(STAGE), createRng(1))
    expect(sim.ticksOverContactBudget).toBe(0)

    flood(sim, BUDGETS.contact + 25)
    const before = sim.state.contact.length
    sim.tick(TICK_SECONDS)

    expect(sim.ticksOverContactBudget).toBeGreaterThan(0)

    expect(sim.state.contact.length).toBe(before)
  })

  it('caps projectiles at the budget, because patterns cannot be predicted', () => {
    const sim = new Simulation(loadStage(STAGE), createRng(1))
    for (let i = 0; i < 2000; i++) sim.tick(TICK_SECONDS)
    expect(sim.projectiles.live).toBeLessThanOrEqual(BUDGETS.projectiles)
    expect(sim.projectiles.items).toHaveLength(BUDGETS.projectiles)
  })
})
