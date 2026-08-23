import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { SALVAGE, CLEARANCE, RECOLLECTION } from '../src/lib/content/economy'
import {
  applyStageClear,
  canAfford,
  clearReward,
  earnSalvage,
  salvageDrop,
  minimumRewindDepth,
  mountCost,
  recollectionFor,
  recordDepth,
  reinforceCost,
  repairCost,
  slotCost,
  spendSalvage,
} from '../src/lib/progression/currencies'
import { ZONES } from '../src/lib/content/zones'
import { CONTACT, contactById } from '../src/lib/content/contacts'
import { scaledCount } from '../src/lib/systems/scaling'
import { isBossWave } from '../src/lib/entities/Wave'
import type { SaveData } from '../src/lib/core/saveSchema'
import type { StageAddress } from '../src/lib/entities/Zone'

const ZONE = ZONES[0]
const STAGES = ZONE.stages.map((s) => `${ZONE.id}:${s.id}` as StageAddress)

let save: SaveData

beforeEach(() => {
  save = createDefaultSave(0)
})

describe('Salvage drops', () => {
  it('pays the base drop in the first zone', () => {
    expect(salvageDrop(5, 0)).toBeCloseTo(5, 10)
  })

  it('scales with zone index', () => {
    expect(salvageDrop(5, 2)).toBeCloseTo(5 * (1 + 2 * SALVAGE.zoneScaling), 10)
  })

  it('applies the tree bonus on top', () => {
    const bonus = { salvage: 0.5, recollection: 0 }
    expect(salvageDrop(10, 0, bonus)).toBeCloseTo(15, 10)
  })

  it('does not round, so thousands of small drops do not compound', () => {
    const drop = salvageDrop(5, 1)
    expect(Number.isInteger(drop)).toBe(false)
  })

  it('gives every Contact something to drop', () => {
    for (const def of CONTACT) {
      expect(def.baseDrop, def.id).toBeGreaterThan(0)
    }
  })
})

describe('Salvage sinks', () => {
  it('charges the authored base for the first of each', () => {
    expect(slotCost(0)).toBe(SALVAGE.slot.base)
    expect(mountCost(0)).toBe(SALVAGE.mount.base)
    expect(repairCost(0)).toBe(SALVAGE.repair.base)
    expect(reinforceCost(0)).toBe(SALVAGE.reinforce.base)
  })

  it('prices a Array above a Platform, as economy-spec §1 requires', () => {
    expect(mountCost(0)).toBeGreaterThan(slotCost(0))
  })

  it('escalates repairs faster than anything else', () => {
    expect(SALVAGE.repair.growth).toBeGreaterThan(SALVAGE.slot.growth)
    expect(SALVAGE.repair.growth).toBeGreaterThan(SALVAGE.mount.growth)
    expect(SALVAGE.repair.growth).toBeGreaterThan(SALVAGE.reinforce.growth)
  })

  it('keeps the tenth slot reachable and the twentieth not', () => {
    const total = (n: number) =>
      Array.from({ length: n }, (_, i) => slotCost(i)).reduce((a, b) => a + b, 0)

    let zoneYield = 0
    for (const stage of ZONE.stages) {
      for (const wave of stage.waves) {
        if (isBossWave(wave)) continue
        for (const group of wave.groups) {
          const def = contactById(group.defId)
          if (!def) continue
          const count = scaledCount(group.count, stage.scalingIndex)
          zoneYield += count * salvageDrop(def.baseDrop, ZONE.index)
        }
      }
    }

    expect(total(10)).toBeLessThan(zoneYield * 1.5)

    expect(total(20) / total(10)).toBeGreaterThan(5)
    expect(total(20)).toBeGreaterThan(zoneYield * 3)
  })

  it('never charges a fraction', () => {
    for (let i = 0; i < 12; i++) {
      expect(Number.isInteger(slotCost(i)), `slot ${i}`).toBe(true)
      expect(Number.isInteger(repairCost(i)), `repair ${i}`).toBe(true)
    }
  })

  it('treats a negative count as none bought', () => {
    expect(slotCost(-3)).toBe(slotCost(0))
  })
})

describe('spending', () => {
  it('refuses a purchase the player cannot afford, and changes nothing', () => {
    save.run.salvage = 10
    expect(canAfford(save, 50)).toBe(false)
    expect(spendSalvage(save, 50)).toBe(false)
    expect(save.run.salvage).toBe(10)
  })

  it('allows spending exactly the balance', () => {
    save.run.salvage = 50
    expect(spendSalvage(save, 50)).toBe(true)
    expect(save.run.salvage).toBe(0)
  })

  it('banks a drop and the lifetime statistic together', () => {
    earnSalvage(save, 12)
    earnSalvage(save, 8)
    expect(save.run.salvage).toBe(20)
    expect(save.statistics.totalSalvageEarned).toBe(20)
  })

  it('ignores a non-positive gain rather than recording a phantom one', () => {
    earnSalvage(save, 0)
    earnSalvage(save, -5)
    expect(save.run.salvage).toBe(0)
    expect(save.statistics.totalSalvageEarned).toBe(0)
  })
})

describe('Recollection', () => {
  it('awards nothing for a run that cleared nothing', () => {
    expect(recollectionFor(0)).toBe(0)
  })

  it('rewards depth super-linearly', () => {
    const ratio = recollectionFor(20) / recollectionFor(10)
    expect(ratio).toBeGreaterThan(2)
    expect(RECOLLECTION.depthExponent).toBeGreaterThan(1)
  })

  it('never decreases with depth', () => {
    let previous = -1
    for (let depth = 0; depth <= 60; depth++) {
      const award = recollectionFor(depth)
      expect(award, `depth ${depth}`).toBeGreaterThanOrEqual(previous)
      previous = award
    }
  })

  it('always awards a whole number', () => {
    for (let depth = 1; depth <= 40; depth++) {
      expect(Number.isInteger(recollectionFor(depth)), `depth ${depth}`).toBe(true)
    }
  })

  it('applies the tree bonus', () => {
    const bare = recollectionFor(20)
    const boosted = recollectionFor(20, { salvage: 0, recollection: 1 })
    expect(boosted).toBeGreaterThan(bare)
  })

  it('reports the depth below which a Rewind pays nothing', () => {
    const threshold = minimumRewindDepth()
    expect(recollectionFor(threshold)).toBeGreaterThan(0)
    expect(recollectionFor(threshold - 1)).toBe(0)
  })
})

describe('Clearance', () => {
  it('pays for a first clear', () => {
    const reward = applyStageClear(save, STAGES[0])
    expect(reward.firstClear).toBe(true)
    expect(reward.clearance).toBe(CLEARANCE.normalStageFirstClear)
    expect(save.meta.clearance).toBe(CLEARANCE.normalStageFirstClear)
  })

  it('pays nothing for a re-clear, so Clearance cannot be farmed', () => {
    applyStageClear(save, STAGES[0])
    const again = applyStageClear(save, STAGES[0])

    expect(again.firstClear).toBe(false)
    expect(again.clearance).toBe(CLEARANCE.reclear)
    expect(save.meta.clearance).toBe(CLEARANCE.normalStageFirstClear)
  })

  it('is idempotent, so a doubled clear event cannot double-pay', () => {
    for (let i = 0; i < 5; i++) applyStageClear(save, STAGES[0])
    expect(save.meta.clearance).toBe(CLEARANCE.normalStageFirstClear)
    expect(save.meta.clearedStages).toEqual([STAGES[0]])
  })

  it('adds the zone bonus on the clear that completes a zone', () => {
    for (const address of STAGES.slice(0, -1)) applyStageClear(save, address)
    const last = applyStageClear(save, STAGES[STAGES.length - 1])

    expect(last.zoneCompleted).toBe(true)
    expect(last.clearance).toBe(CLEARANCE.normalStageFirstClear + CLEARANCE.zoneComplete)
  })

  it('does not call a zone complete before it is', () => {
    const first = applyStageClear(save, STAGES[0])
    expect(first.zoneCompleted).toBe(false)
  })

  it('reports a reward without granting it', () => {
    const quoted = clearReward(save, STAGES[0])
    expect(quoted.clearance).toBeGreaterThan(0)
    expect(save.meta.clearance).toBe(0)
    expect(save.meta.clearedStages).toEqual([])
  })

  it('awards nothing for an address that does not exist', () => {
    const reward = applyStageClear(save, 'nowhere:nothing' as StageAddress)
    expect(reward.clearance).toBe(0)
    expect(save.meta.clearance).toBe(0)
  })

  it('pays more for a boss stage than a normal one', () => {
    expect(CLEARANCE.bossStageFirstClear).toBeGreaterThan(CLEARANCE.normalStageFirstClear)
  })
})

describe('depth tracking', () => {
  it('records the deepest stage of the run and of all time', () => {
    recordDepth(save, 3)
    expect(save.run.deepestScalingIndex).toBe(3)
    expect(save.statistics.deepestScalingIndexEver).toBe(3)
  })

  it('never moves backwards on a shallower clear', () => {
    recordDepth(save, 5)
    recordDepth(save, 2)
    expect(save.run.deepestScalingIndex).toBe(5)
  })

  it('keeps the all-time figure when the run figure is reset', () => {
    recordDepth(save, 7)
    save.run.deepestScalingIndex = 0
    recordDepth(save, 2)

    expect(save.run.deepestScalingIndex).toBe(2)
    expect(save.statistics.deepestScalingIndexEver).toBe(7)
  })
})

describe('currencies stay separate', () => {
  it('leaves the permanent currencies untouched by Salvage activity', () => {
    earnSalvage(save, 500)
    spendSalvage(save, 100)

    expect(save.meta.recollection).toBe(0)
    expect(save.meta.clearance).toBe(0)
  })

  it('leaves Salvage untouched by a stage clear', () => {
    save.run.salvage = 42
    applyStageClear(save, STAGES[0])
    expect(save.run.salvage).toBe(42)
  })
})
