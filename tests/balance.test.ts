import { describe, expect, it } from 'vitest'
import { PLATFORMS } from '../src/lib/content/platforms'
import { ARRAYS } from '../src/lib/content/arrays'
import { UPGRADE_NODES } from '../src/lib/content/upgrades'
import { SCALING } from '../src/lib/content/scaling'
import { OFFLINE, ROSTER } from '../src/lib/content/economy'
import { TOTAL_SLOTS } from '../src/lib/content/field'
import { levelScale } from '../src/lib/progression/roster'
import {
  calculateOffline,
  offlineCap,
  offlineEfficiency,
} from '../src/lib/systems/offlineProgress'
import { noUpgradeEffects } from '../src/lib/entities/Upgrade'
import { playCampaign } from './support/playthrough'

function wallAt(n: number): number {
  const hp = Math.pow(SCALING.enemyHpGrowth, n - 1)
  const countAt = (s: number) => 20 + Math.floor(s / SCALING.enemyCountStageDivisor)
  return hp * (countAt(n) / countAt(1))
}

function playerCeiling(): number {
  const sum = (kind: string) =>
    UPGRADE_NODES.flatMap((n) => n.effects)
      .filter((e) => e.kind === kind)
      .reduce((s, e) => s + e.magnitude, 0)
  return (TOTAL_SLOTS / 4) * levelScale(ROSTER.maxLevel) * (1 + sum('attack')) * (1 + sum('haste'))
}

describe('no unit dominates', () => {
  it('gives every Platform something it is best at', () => {
    const axes: ((p: (typeof PLATFORMS)[number]) => number)[] = [
      (p) => p.attack / p.baseInterval,

      (p) => p.attack,
      (p) => p.maxHp,
      (p) => p.defence,
      (p) => p.blockArc,
      (p) => p.angularReach,
      (p) => p.radialReach,
      (p) => p.conjunctionEffect.magnitude,
      (p) => p.maxHp * p.blockArc,

      (p) => (p.attack / p.baseInterval) * p.defence,
      (p) => -p.unlockCost,

      (p) =>
        -Math.min(
          ...PLATFORMS.filter((o) => o.damageType === p.damageType).map((o) => o.unlockCost),
        ) === -p.unlockCost
          ? 1
          : 0,
    ]

    for (const unit of PLATFORMS) {
      const best = axes.some((axis) => PLATFORMS.every((other) => axis(unit) >= axis(other)))
      expect(best, `${unit.id} is not the best at anything`).toBe(true)
    }
  })

  it('never makes one Platform strictly better than another', () => {
    for (const a of PLATFORMS) {
      for (const b of PLATFORMS) {
        if (a.id === b.id) continue

        if (a.conjunctionEffect.kind !== b.conjunctionEffect.kind) continue
        const dominates =
          a.conjunctionEffect.magnitude >= b.conjunctionEffect.magnitude &&
          a.unlockCost <= b.unlockCost &&
          a.maxHp >= b.maxHp &&
          a.defence >= b.defence &&
          a.blockArc >= b.blockArc &&
          a.angularReach >= b.angularReach &&
          a.radialReach >= b.radialReach &&
          a.attack / a.baseInterval >= b.attack / b.baseInterval
        expect(dominates, `${a.id} strictly dominates ${b.id}`).toBe(false)
      }
    }
  })

  it('gives every Array something it is best at', () => {
    const axes: ((a: (typeof ARRAYS)[number]) => number)[] = [
      (a) => a.attack / a.chargeInterval,
      (a) => a.attack,
      (a) => a.maxCharge,
      (a) => -a.chargeInterval,
      (a) => a.projectileSpeed,
      (a) => -a.unlockCost,
    ]
    for (const unit of ARRAYS) {
      const best = axes.some((axis) => ARRAYS.every((other) => axis(unit) >= axis(other)))
      expect(best, `${unit.id} is not the best at anything`).toBe(true)
    }
  })

  it('lets no single tree node carry a branch', () => {
    for (const node of UPGRADE_NODES) {
      for (const effect of node.effects) {
        const granting = UPGRADE_NODES.filter(
          (n) => n.branch === node.branch && n.effects.some((e) => e.kind === effect.kind),
        )

        if (granting.length < 3) continue

        const branchTotal = granting
          .flatMap((n) => n.effects)
          .filter((e) => e.kind === effect.kind)
          .reduce((s, e) => s + e.magnitude, 0)

        expect(
          effect.magnitude / branchTotal,
          `${node.id} is ${((100 * effect.magnitude) / branchTotal).toFixed(0)}% of its branch's ${effect.kind}`,
        ).toBeLessThan(0.5)
      }
    }
  })
})

describe('offline progress is meaningful but not run-breaking', () => {
  const rate = 3

  it('pays a real fraction of active play', () => {
    const hour = calculateOffline({
      elapsedSeconds: 3600,
      salvagePerSecond: rate,
      effects: noUpgradeEffects(),
    })
    expect(hour.salvage).toBeGreaterThan(0)
    expect(hour.salvage / hour.activeEquivalent).toBeGreaterThan(0.2)
  })

  it('never pays as much as playing', () => {
    for (const hours of [1, 2, 4, 8, 24]) {
      const r = calculateOffline({
        elapsedSeconds: hours * 3600,
        salvagePerSecond: rate,
        effects: noUpgradeEffects(),
      })
      expect(r.salvage, `${hours}h`).toBeLessThan(r.activeEquivalent)
    }
  })

  it('stops paying at the cap, however long the absence', () => {
    const capped = calculateOffline({
      elapsedSeconds: 24 * 3600,
      salvagePerSecond: rate,
      effects: noUpgradeEffects(),
    })
    const atCap = calculateOffline({
      elapsedSeconds: offlineCap(noUpgradeEffects()),
      salvagePerSecond: rate,
      effects: noUpgradeEffects(),
    })
    expect(capped.salvage).toBeCloseTo(atCap.salvage, 5)
  })

  it('keeps the authored cap and rate', () => {
    expect(offlineCap(noUpgradeEffects())).toBe(OFFLINE.capSeconds)
    expect(offlineEfficiency(noUpgradeEffects())).toBe(OFFLINE.efficiency)
  })
})

describe('the ladder outruns the player, and that is recorded', () => {
  it('leaves the back of the ladder beyond the player ceiling', () => {
    const ceiling = playerCeiling()
    const wall = wallAt(40)
    expect(ceiling, `ceiling x${ceiling.toFixed(0)}`).toBeLessThan(wall)
  })

  it('keeps the first two zones inside it', () => {
    expect(playerCeiling()).toBeGreaterThan(wallAt(8))
  })

  it('notices if the gap is ever closed or widened', () => {
    const ratio = wallAt(40) / playerCeiling()
    expect(ratio, `wall is ${ratio.toFixed(2)}x the ceiling`).toBeGreaterThan(1.5)
    expect(ratio, `wall is ${ratio.toFixed(2)}x the ceiling`).toBeLessThan(4)
  })
})

describe('a modelled playthrough', () => {
  it('reaches the first boss on the opening run', () => {
    const [first] = playCampaign(1)
    expect(first.deepestScalingIndex, `reached stage ${first.deepestScalingIndex}`).toBeGreaterThanOrEqual(6)
  }, 60_000)

  it('does not get deeper forever, which is the known plateau', () => {
    const runs = playCampaign(4)
    const depths = runs.map((r) => r.deepestScalingIndex)
    expect(Math.max(...depths), `depths ${depths.join(', ')}`).toBeLessThan(25)
  }, 120_000)
})
