import { describe, expect, it } from 'vitest'
import { OFFLINE } from '../src/lib/content/economy'
import {
  calculateOffline,
  diminishing,
  isWorthReporting,
  MIN_REPORTABLE_SECONDS,
  offlineCap,
  offlineEfficiency,
} from '../src/lib/systems/offlineProgress'
import { noUpgradeEffects, type UpgradeEffects } from '../src/lib/entities/Upgrade'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { purchase } from '../src/lib/progression/upgradeTree'
import { effectsOf } from '../src/lib/progression/upgradeTree'

const HOUR = 3600

function effects(overrides: Partial<UpgradeEffects> = {}): UpgradeEffects {
  return { ...noUpgradeEffects(), ...overrides }
}

const run = (elapsedSeconds: number, salvagePerSecond = 2, e = effects()) =>
  calculateOffline({ elapsedSeconds, salvagePerSecond, effects: e })

describe('the formula', () => {
  it('follows economy-spec §4 exactly', () => {
    const seconds = HOUR
    const rate = 2
    const result = run(seconds, rate)

    const expected = seconds * rate * OFFLINE.efficiency * diminishing(seconds)
    expect(result.salvage).toBeCloseTo(expected, 8)
  })

  it('halves the marginal rate every four hours', () => {
    expect(diminishing(0)).toBe(1)
    expect(diminishing(OFFLINE.diminishingHalflifeSeconds)).toBeCloseTo(0.5, 10)
    expect(diminishing(OFFLINE.diminishingHalflifeSeconds * 3)).toBeCloseTo(0.25, 10)
  })

  it('pays nothing for no time and nothing for no rate', () => {
    expect(run(0).salvage).toBe(0)
    expect(run(HOUR, 0).salvage).toBe(0)
  })

  it('treats negative input as zero rather than paying out', () => {
    // A clock that went backwards must not become income.
    expect(run(-HOUR).salvage).toBe(0)
    expect(run(HOUR, -5).salvage).toBe(0)
  })

  it('never pays less for longer, even past the cap', () => {
    let previous = -1
    for (let hours = 0; hours <= 48; hours += 0.5) {
      const paid = run(hours * HOUR).salvage
      expect(paid, `${hours}h`).toBeGreaterThanOrEqual(previous)
      previous = paid
    }
  })
})

describe('the cap', () => {
  it('stops counting past the authored window', () => {
    const capped = run(OFFLINE.capSeconds)
    const longer = run(OFFLINE.capSeconds * 5)
    expect(longer.salvage).toBeCloseTo(capped.salvage, 8)
  })

  it('reports the overflow rather than hiding it', () => {
    // economy-spec.md §4: telling the player they lost nothing when they did
    // erodes trust in an idle game's numbers.
    const result = run(OFFLINE.capSeconds + 2 * HOUR)
    expect(result.effectiveSeconds).toBe(OFFLINE.capSeconds)
    expect(result.wastedSeconds).toBeCloseTo(2 * HOUR, 6)
  })

  it('reports no overflow inside the window', () => {
    expect(run(HOUR).wastedSeconds).toBe(0)
  })

  it('widens with the Recovery branch', () => {
    const wider = offlineCap(effects({ offlineCap: 4 * HOUR }))
    expect(wider).toBe(OFFLINE.capSeconds + 4 * HOUR)
    expect(run(12 * HOUR, 2, effects({ offlineCap: 4 * HOUR })).salvage).toBeGreaterThan(
      run(12 * HOUR).salvage,
    )
  })

  it('never exceeds the authored ceiling', () => {
    expect(offlineCap(effects({ offlineCap: 1000 * HOUR }))).toBe(OFFLINE.maxCapSeconds)
  })
})

describe('efficiency stays below parity', () => {
  /**
   * balancing.csv annotates `efficiency_max`: "must stay below 1.0 always". At
   * parity, leaving the game would be the optimal play — the one outcome this
   * whole section exists to prevent.
   */
  it('is a fraction to begin with', () => {
    expect(OFFLINE.efficiency).toBeLessThan(1)
    expect(OFFLINE.maxEfficiency).toBeLessThan(1)
  })

  it('clamps however much the tree adds', () => {
    expect(offlineEfficiency(effects({ offlineEfficiency: 10 }))).toBe(OFFLINE.maxEfficiency)
  })

  it('rises with the Recovery branch, up to the ceiling', () => {
    const better = offlineEfficiency(effects({ offlineEfficiency: 0.15 }))
    expect(better).toBeGreaterThan(OFFLINE.efficiency)
    expect(better).toBeLessThanOrEqual(OFFLINE.maxEfficiency)
  })

  it('never reaches the active rate, at any length or investment', () => {
    const maxed = effects({ offlineEfficiency: 10, offlineCap: 1000 * HOUR })
    for (const hours of [0.5, 4, 12, 24, 48, 200]) {
      const result = run(hours * HOUR, 3, maxed)
      expect(result.salvage, `${hours}h`).toBeLessThan(result.activeEquivalent)
    }
  })

  it('keeps eight offline hours well under the same time active', () => {
    // §4's stated intent: at maximum investment, eight offline hours are worth
    // roughly two active hours.
    const maxed = effects({ offlineEfficiency: 10, offlineCap: 1000 * HOUR })
    const eight = run(8 * HOUR, 3, maxed)
    const activeEight = 8 * HOUR * 3

    expect(eight.salvage / activeEight).toBeLessThan(0.5)
  })
})

describe('what the summary is told', () => {
  it('reports the active equivalent so the shortfall can be shown', () => {
    const result = run(2 * HOUR, 2)
    expect(result.activeEquivalent).toBeCloseTo(2 * HOUR * 2, 6)
    expect(result.salvage).toBeLessThan(result.activeEquivalent)
  })

  it('reports the cap and efficiency in force', () => {
    const result = run(HOUR, 2, effects({ offlineCap: HOUR, offlineEfficiency: 0.1 }))
    expect(result.capSeconds).toBe(OFFLINE.capSeconds + HOUR)
    expect(result.efficiency).toBeCloseTo(OFFLINE.efficiency + 0.1, 10)
  })

  it('does not interrupt the player over a trivial absence', () => {
    expect(isWorthReporting(run(MIN_REPORTABLE_SECONDS - 1))).toBe(false)
    expect(isWorthReporting(run(0))).toBe(false)
  })

  it('does not interrupt when nothing was earned', () => {
    // A long absence with no earning rate still has nothing to say.
    expect(isWorthReporting(run(10 * HOUR, 0))).toBe(false)
  })

  it('reports a real absence', () => {
    expect(isWorthReporting(run(2 * HOUR, 2))).toBe(true)
  })
})

describe('the Recovery nodes are wired', () => {
  it('raises the cap and the efficiency through the tree', () => {
    // A new effect kind with no node using it is untested configuration, which
    // is the failure this project keeps finding.
    const save = createDefaultSave(0)
    save.meta.recollection = 10_000

    for (const id of [
      'recovery-debris-discipline',
      'recovery-honest-accounting',
      'recovery-the-long-view',
      'recovery-the-night-shift',
      'recovery-standing-orders',
    ]) {
      expect(purchase(save, id), id).toBe(true)
    }

    const bought = effectsOf(save)
    expect(offlineCap(bought)).toBeGreaterThan(OFFLINE.capSeconds)
    expect(offlineEfficiency(bought)).toBeGreaterThan(OFFLINE.efficiency)
  })
})
