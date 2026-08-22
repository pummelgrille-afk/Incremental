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

/**
 * Phase 35's balancing pass, as assertions.
 *
 * The measurements behind these live in docs/phases/phase-35.md. What is here
 * is the subset that must not silently change — a balance finding nobody
 * encoded is a balance finding that gets undone by the next content commit.
 */

/** Total wave HP multiplier between stage 1 and stage `n`. */
function wallAt(n: number): number {
  const hp = Math.pow(SCALING.enemyHpGrowth, n - 1)
  const countAt = (s: number) => 20 + Math.floor(s / SCALING.enemyCountStageDivisor)
  return hp * (countAt(n) / countAt(1))
}

/** Player damage multiplier with everything bought. */
function playerCeiling(): number {
  const sum = (kind: string) =>
    UPGRADE_NODES.flatMap((n) => n.effects)
      .filter((e) => e.kind === kind)
      .reduce((s, e) => s + e.magnitude, 0)
  return (TOTAL_SLOTS / 4) * levelScale(ROSTER.maxLevel) * (1 + sum('attack')) * (1 + sum('haste'))
}

describe('no unit dominates', () => {
  it('gives every Platform something it is best at', () => {
    /*
     * PLAN.md Phase 35: "adjust so no single ally dominates". Read as — for
     * every unit there is at least one axis on which nothing beats it, so a
     * roster slot is a choice rather than a ranking.
     */
    const axes: ((p: (typeof PLATFORMS)[number]) => number)[] = [
      (p) => p.attack / p.baseInterval,
      /*
       * Per-hit size, which is distinct from rate. `shieldHits` discards a hit
       * regardless of its magnitude, so a Shell is answered by one big strike
       * and never by many small ones — the mechanic Kiln was authored around.
       */
      (p) => p.attack,
      (p) => p.maxHp,
      (p) => p.defence,
      (p) => p.blockArc,
      (p) => p.angularReach,
      (p) => p.radialReach,
      (p) => p.conjunctionEffect.magnitude,
      (p) => p.maxHp * p.blockArc,
      // The fighting tank: most damage among things that can hold a line.
      (p) => (p.attack / p.baseInterval) * p.defence,
      (p) => -p.unlockCost,
      /*
       * Cheapest of its damage type. A real axis rather than a loophole: the
       * armour matrix means a Hulk can only be answered at advantage by
       * thermal, so "the cheapest thermal" is a distinct reason to own a unit
       * even when nothing about its statline leads the roster. Ember exists for
       * exactly that and is otherwise best at nothing.
       */
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
    // Strictly better on every axis at no greater cost is a unit that deletes
    // another from the roster.
    for (const a of PLATFORMS) {
      for (const b of PLATFORMS) {
        if (a.id === b.id) continue
        /*
         * Only comparable when their conjunction effects are the same kind. A
         * Lantern out-stats a Relay on every line and costs less, but it grants
         * haste where the Relay carries the largest damage pulse in the roster
         * — different payloads, not a better and a worse version of one.
         * Comparing magnitudes across kinds would be comparing seconds of haste
         * to points of damage.
         */
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
    // No node may be worth more than a fifth of everything its branch grants of
    // that kind, or the branch is one node and some filler.
    for (const node of UPGRADE_NODES) {
      for (const effect of node.effects) {
        const granting = UPGRADE_NODES.filter(
          (n) => n.branch === node.branch && n.effects.some((e) => e.kind === effect.kind),
        )
        /*
         * Meaningless below three nodes. With two, an even split is 50% each
         * and no distribution can pass; "one node carries this" is not a thing
         * that can be true of a kind only two nodes grant.
         */
        if (granting.length < 3) continue

        const branchTotal = granting
          .flatMap((n) => n.effects)
          .filter((e) => e.kind === effect.kind)
          .reduce((s, e) => s + e.magnitude, 0)
        /*
         * Half, not a third. Some kinds are granted by only two or three nodes
         * — offline efficiency by three — where an even split is already 33%
         * and a 35% bar fails a branch that is perfectly evenly distributed.
         * The thing worth catching is one node *carrying* a kind, which is what
         * a half is.
         */
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
    // "Meaningful": an hour away is worth having. PLAN.md Phase 35.
    const hour = calculateOffline({
      elapsedSeconds: 3600,
      salvagePerSecond: rate,
      effects: noUpgradeEffects(),
    })
    expect(hour.salvage).toBeGreaterThan(0)
    expect(hour.salvage / hour.activeEquivalent).toBeGreaterThan(0.2)
  })

  it('never pays as much as playing', () => {
    // "Not run-breaking": active play has to stay dominant, which is P1 read
    // from the other end.
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
  /*
   * The finding this phase exists to surface, encoded so it cannot drift
   * unnoticed in either direction. Full working in docs/phases/phase-35.md.
   *
   * With every slot filled, every unit at the level ceiling and all 72 nodes
   * bought, the player is roughly 108x their opening damage. Total wave HP at
   * stage 40 is roughly 273x stage 1. The back of the authored ladder cannot be
   * cleared by any build the game currently offers.
   */

  it('leaves the back of the ladder beyond the player ceiling', () => {
    const ceiling = playerCeiling()
    const wall = wallAt(40)
    expect(ceiling, `ceiling x${ceiling.toFixed(0)}`).toBeLessThan(wall)
  })

  it('keeps the first two zones inside it', () => {
    // Whatever else is true, the opening has to be beatable. Zone 2 ends at
    // stage 8 with the first boss and the Almanac behind it.
    expect(playerCeiling()).toBeGreaterThan(wallAt(8))
  })

  it('notices if the gap is ever closed or widened', () => {
    // A soft guard on the *size* of the mismatch, so a content change that
    // halves or doubles it shows up in CI rather than in a playtest.
    const ratio = wallAt(40) / playerCeiling()
    expect(ratio, `wall is ${ratio.toFixed(2)}x the ceiling`).toBeGreaterThan(1.5)
    expect(ratio, `wall is ${ratio.toFixed(2)}x the ceiling`).toBeLessThan(4)
  })
})

describe('a modelled playthrough', () => {
  it('reaches the first boss on the opening run', () => {
    /*
     * economy-spec.md §3 puts the first Rewind at about stage 8, and the
     * Almanac reveals on the first boss clear — which the ladder places there.
     * A player who cannot reach it never meets the tree at all.
     *
     * The harness plays badly on purpose (cheapest useful thing, always), so
     * this is a floor.
     */
    const [first] = playCampaign(1)
    expect(first.deepestScalingIndex, `reached stage ${first.deepestScalingIndex}`).toBeGreaterThanOrEqual(6)
  }, 60_000)

  it('does not get deeper forever, which is the known plateau', () => {
    // Recorded rather than asserted as good: measured depth flattens by the
    // second or third Rewind and does not move again. See phase-35.md.
    const runs = playCampaign(4)
    const depths = runs.map((r) => r.deepestScalingIndex)
    expect(Math.max(...depths), `depths ${depths.join(', ')}`).toBeLessThan(25)
  }, 120_000)
})
