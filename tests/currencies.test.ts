import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { FILINGS, KEYS, RECOLLECTION } from '../src/lib/content/economy'
import {
  applyStageClear,
  canAfford,
  clearReward,
  earnFilings,
  filingsDrop,
  minimumRewindDepth,
  mountCost,
  recollectionFor,
  recordDepth,
  reinforceCost,
  repairCost,
  slotCost,
  spendFilings,
} from '../src/lib/progression/currencies'
import { ZONES } from '../src/lib/content/zones'
import { SLACK, slackById } from '../src/lib/content/enemies'
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

describe('Filings drops', () => {
  it('pays the base drop in the first zone', () => {
    expect(filingsDrop(5, 0)).toBeCloseTo(5, 10)
  })

  it('scales with zone index', () => {
    expect(filingsDrop(5, 2)).toBeCloseTo(5 * (1 + 2 * FILINGS.zoneScaling), 10)
  })

  it('applies the tree bonus on top', () => {
    const bonus = { filings: 0.5, recollection: 0 }
    expect(filingsDrop(10, 0, bonus)).toBeCloseTo(15, 10)
  })

  it('does not round, so thousands of small drops do not compound', () => {
    // The same argument damage uses. The HUD rounds for display.
    const drop = filingsDrop(5, 1)
    expect(Number.isInteger(drop)).toBe(false)
  })

  it('gives every Slack something to drop', () => {
    for (const def of SLACK) {
      expect(def.baseDrop, def.id).toBeGreaterThan(0)
    }
  })
})

describe('Filings sinks', () => {
  it('charges the authored base for the first of each', () => {
    expect(slotCost(0)).toBe(FILINGS.slot.base)
    expect(mountCost(0)).toBe(FILINGS.mount.base)
    expect(repairCost(0)).toBe(FILINGS.repair.base)
    expect(reinforceCost(0)).toBe(FILINGS.reinforce.base)
  })

  it('prices a Chime above a Movement, as economy-spec §1 requires', () => {
    // A Chime is the bigger commitment; if this inverts, the intended order in
    // which a player meets the sinks inverts with it.
    expect(mountCost(0)).toBeGreaterThan(slotCost(0))
  })

  it('escalates repairs faster than anything else', () => {
    // Repair is a panic button, not a strategy — economy-spec invariant 6.
    expect(FILINGS.repair.growth).toBeGreaterThan(FILINGS.slot.growth)
    expect(FILINGS.repair.growth).toBeGreaterThan(FILINGS.mount.growth)
    expect(FILINGS.repair.growth).toBeGreaterThan(FILINGS.reinforce.growth)
  })

  it('keeps the tenth slot reachable and the twentieth not', () => {
    /*
     * The load-bearing claim about the 1.18 growth in economy-spec.md §1:
     * "shallow enough that the tenth slot is reachable in a first run, steep
     * enough that the twentieth requires tree investment".
     *
     * Measured against what zone 1 actually pays out rather than against a
     * threshold picked to fit — an invented number here would assert nothing
     * about the design and would silently stop meaning anything the first time
     * a wave count changed.
     */
    const total = (n: number) =>
      Array.from({ length: n }, (_, i) => slotCost(i)).reduce((a, b) => a + b, 0)

    let zoneYield = 0
    for (const stage of ZONE.stages) {
      for (const wave of stage.waves) {
        if (isBossWave(wave)) continue
        for (const group of wave.groups) {
          const def = slackById(group.defId)
          if (!def) continue
          const count = scaledCount(group.count, stage.scalingIndex)
          zoneYield += count * filingsDrop(def.baseDrop, ZONE.index)
        }
      }
    }

    /*
     * Ten slots cost 1179 against zone 1's yield of 1175 — the two were
     * authored two stages apart (the cost curve in Phase 6, the densities in
     * Phases 17 and 20) and landed within 0.3% of each other. Asserted as a
     * band rather than that coincidence, since "a first run" spans more than
     * one zone once Phase 33 authors the rest.
     */
    expect(total(10)).toBeLessThan(zoneYield * 1.5)
    expect(total(20)).toBeGreaterThan(zoneYield * 4)
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
    save.run.filings = 10
    expect(canAfford(save, 50)).toBe(false)
    expect(spendFilings(save, 50)).toBe(false)
    expect(save.run.filings).toBe(10)
  })

  it('allows spending exactly the balance', () => {
    save.run.filings = 50
    expect(spendFilings(save, 50)).toBe(true)
    expect(save.run.filings).toBe(0)
  })

  it('banks a drop and the lifetime statistic together', () => {
    earnFilings(save, 12)
    earnFilings(save, 8)
    expect(save.run.filings).toBe(20)
    expect(save.statistics.totalFilingsEarned).toBe(20)
  })

  it('ignores a non-positive gain rather than recording a phantom one', () => {
    earnFilings(save, 0)
    earnFilings(save, -5)
    expect(save.run.filings).toBe(0)
    expect(save.statistics.totalFilingsEarned).toBe(0)
  })
})

describe('Recollection', () => {
  it('awards nothing for a run that cleared nothing', () => {
    expect(recollectionFor(0)).toBe(0)
  })

  it('rewards depth super-linearly', () => {
    // The 1.6 exponent: two stages deeper is worth roughly 1.8x, so depth beats
    // breadth without making an early Rewind a mistake.
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
    const boosted = recollectionFor(20, { filings: 0, recollection: 1 })
    expect(boosted).toBeGreaterThan(bare)
  })

  it('reports the depth below which a Rewind pays nothing', () => {
    // economy-spec.md §1 requires the zero-award guard to explain a threshold.
    // Deriving it from the formula stops the explanation drifting from it.
    const threshold = minimumRewindDepth()
    expect(recollectionFor(threshold)).toBeGreaterThan(0)
    expect(recollectionFor(threshold - 1)).toBe(0)
  })
})

describe('Keys', () => {
  it('pays for a first clear', () => {
    const reward = applyStageClear(save, STAGES[0])
    expect(reward.firstClear).toBe(true)
    expect(reward.keys).toBe(KEYS.normalStageFirstClear)
    expect(save.meta.keys).toBe(KEYS.normalStageFirstClear)
  })

  it('pays nothing for a re-clear, so Keys cannot be farmed', () => {
    // The property Phase 29's roster balance depends on.
    applyStageClear(save, STAGES[0])
    const again = applyStageClear(save, STAGES[0])

    expect(again.firstClear).toBe(false)
    expect(again.keys).toBe(KEYS.reclear)
    expect(save.meta.keys).toBe(KEYS.normalStageFirstClear)
  })

  it('is idempotent, so a doubled clear event cannot double-pay', () => {
    for (let i = 0; i < 5; i++) applyStageClear(save, STAGES[0])
    expect(save.meta.keys).toBe(KEYS.normalStageFirstClear)
    expect(save.meta.clearedStages).toEqual([STAGES[0]])
  })

  it('adds the zone bonus on the clear that completes a zone', () => {
    for (const address of STAGES.slice(0, -1)) applyStageClear(save, address)
    const last = applyStageClear(save, STAGES[STAGES.length - 1])

    expect(last.zoneCompleted).toBe(true)
    expect(last.keys).toBe(KEYS.normalStageFirstClear + KEYS.zoneComplete)
  })

  it('does not call a zone complete before it is', () => {
    const first = applyStageClear(save, STAGES[0])
    expect(first.zoneCompleted).toBe(false)
  })

  it('reports a reward without granting it', () => {
    // `clearReward` is what the UI quotes; only `applyStageClear` pays.
    const quoted = clearReward(save, STAGES[0])
    expect(quoted.keys).toBeGreaterThan(0)
    expect(save.meta.keys).toBe(0)
    expect(save.meta.clearedStages).toEqual([])
  })

  it('awards nothing for an address that does not exist', () => {
    const reward = applyStageClear(save, 'nowhere:nothing' as StageAddress)
    expect(reward.keys).toBe(0)
    expect(save.meta.keys).toBe(0)
  })

  it('pays more for a boss stage than a normal one', () => {
    expect(KEYS.bossStageFirstClear).toBeGreaterThan(KEYS.normalStageFirstClear)
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
    // What a Rewind will do in Phase 26: `run` is discarded, `statistics` is not.
    recordDepth(save, 7)
    save.run.deepestScalingIndex = 0
    recordDepth(save, 2)

    expect(save.run.deepestScalingIndex).toBe(2)
    expect(save.statistics.deepestScalingIndexEver).toBe(7)
  })
})

describe('currencies stay separate', () => {
  it('leaves the permanent currencies untouched by Filings activity', () => {
    // economy-spec.md §1: if two currencies ever bought the same thing, one
    // would be redundant. The sources must not leak into each other either.
    earnFilings(save, 500)
    spendFilings(save, 100)

    expect(save.meta.recollection).toBe(0)
    expect(save.meta.keys).toBe(0)
  })

  it('leaves Filings untouched by a stage clear', () => {
    save.run.filings = 42
    applyStageClear(save, STAGES[0])
    expect(save.run.filings).toBe(42)
  })
})
