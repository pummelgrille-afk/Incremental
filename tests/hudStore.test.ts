import { beforeEach, describe, expect, it } from 'vitest'
import { game } from '../src/lib/stores/game.svelte'
import { FLARE } from '../src/lib/content/field'

/**
 * The reactive projection is the only Svelte-side logic in the codebase, and
 * `flareProgress` is the one piece of it that decides what a player sees rather
 * than merely copying a number across. The rest of the store is assignments.
 */

beforeEach(() => {
  game.phase = 'wave-active'
  game.flareMaxCharge = FLARE.maxCharges
  game.flareCharge = 0
  game.flareCooldown = 0
})

describe('the Flare charge bar', () => {
  it('is full whenever a strike is available', () => {
    // Nothing is being waited for, so there is no progress to report.
    game.flareCharge = 2.4
    expect(game.canStrike).toBe(true)
    expect(game.flareProgress).toBe(1)
  })

  it('ignores the post-strike cooldown entirely', () => {
    // Playtest: reporting the 0.25 s cooldown made the bar race from empty to
    // full and then snap back to the real charge fraction. The cooldown is a
    // double-click guard, not a wait, so the bar must not move for it at all.
    game.flareCharge = 2.4
    game.flareCooldown = FLARE.cooldown
    expect(game.flareProgress).toBe(1)

    game.flareCooldown = FLARE.cooldown / 2
    expect(game.flareProgress).toBe(1)
  })

  it('tracks the regenerating fraction when out of charge', () => {
    game.flareCharge = 0.25
    expect(game.canStrike).toBe(false)
    expect(game.flareProgress).toBeCloseTo(0.25, 6)

    game.flareCharge = 0.9
    expect(game.flareProgress).toBeCloseTo(0.9, 6)
  })

  it('shows the regenerating fraction even while the cooldown runs', () => {
    // Straight after a strike that emptied the last charge. The wait that
    // matters is the 3 s recharge, not the 0.25 s guard.
    game.flareCharge = 0.5
    game.flareCooldown = FLARE.cooldown
    expect(game.flareProgress).toBeCloseTo(0.5, 6)
  })

  it('never jumps backwards while a charge regenerates', () => {
    // The snap the playtest reported. Walk a charge from empty to whole across
    // a live cooldown and assert the bar only ever climbs.
    let previous = -1
    for (let charge = 0; charge <= 1.0001; charge += 0.05) {
      game.flareCharge = charge
      game.flareCooldown = charge < 0.2 ? FLARE.cooldown : 0
      expect(game.flareProgress, `charge ${charge.toFixed(2)}`).toBeGreaterThanOrEqual(previous)
      previous = game.flareProgress
    }
    expect(previous).toBe(1)
  })

  it('does not creep toward a charge the player cannot spend', () => {
    // With two whole charges banked a third is regenerating, but the bar must
    // read full — a strike is available right now, and a bar counting toward
    // something unactionable is noise.
    game.flareCharge = 2.6
    expect(game.flareProgress).toBe(1)
  })

  it('stays within 0 and 1 in every state', () => {
    for (const charge of [0, 0.5, 1, 2.99, FLARE.maxCharges]) {
      for (const cooldown of [0, FLARE.cooldown / 3, FLARE.cooldown]) {
        game.flareCharge = charge
        game.flareCooldown = cooldown
        expect(game.flareProgress, `charge ${charge} cooldown ${cooldown}`).toBeGreaterThanOrEqual(0)
        expect(game.flareProgress).toBeLessThanOrEqual(1)
      }
    }
  })

  it('reports no progress while the stage is over', () => {
    // canStrike is gated on `running`, so a resolved stage must not show a
    // full bar inviting an input that will be refused.
    game.flareCharge = 3
    game.phase = 'cleared'
    expect(game.canStrike).toBe(false)
    expect(game.flareProgress).toBe(0)
  })
})

describe('the Salvage counter', () => {
  beforeEach(() => {
    game.salvage = 0
    game.salvageGain = 0
  })

  it('shows the spendable balance, not a stage total', () => {
    /*
     * Those were the same number until Phase 24 gave Salvage something to buy.
     * Publishing both — the stage's earnings from `syncFrom` and the bank from
     * the save — made the counter flip between them mid-session.
     */
    game.publishSalvage(1702, 10)
    expect(game.salvage).toBe(1702)
  })

  it('pools a gain', () => {
    game.publishSalvage(10, 0)
    game.publishSalvage(25, 0.2)
    expect(game.salvageGain).toBe(25)
  })

  it('does not read a purchase as a gain', () => {
    // Spending must never animate as income.
    game.publishSalvage(100, 0)
    game.salvageGain = 0
    game.publishSalvage(41, 0.1)

    expect(game.salvage).toBe(41)
    expect(game.salvageGain).toBe(0)
  })

  it('expires the pooled gain', () => {
    game.publishSalvage(50, 0)
    expect(game.salvageGain).toBeGreaterThan(0)

    game.publishSalvage(50, 5)
    expect(game.salvageGain).toBe(0)
  })

  it('primes a starting balance without it reading as income', () => {
    // The projection starts at zero and a loaded save does not, so the first
    // publish of a session would otherwise flash the entire balance as though
    // it had just been earned.
    game.primeSalvage(880)

    expect(game.salvage).toBe(880)
    expect(game.salvageGain).toBe(0)
  })

  it('reports a gain against a primed balance, not against zero', () => {
    game.primeSalvage(880)
    game.publishSalvage(890, 0.5)

    expect(game.salvageGain).toBe(10)
  })
})
