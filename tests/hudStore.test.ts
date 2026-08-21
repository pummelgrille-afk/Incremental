import { beforeEach, describe, expect, it } from 'vitest'
import { game } from '../src/lib/stores/game.svelte'
import { BEAT } from '../src/lib/content/field'

/**
 * The reactive projection is the only Svelte-side logic in the codebase, and
 * `beatProgress` is the one piece of it that decides what a player sees rather
 * than merely copying a number across. The rest of the store is assignments.
 */

beforeEach(() => {
  game.phase = 'wave-active'
  game.beatMaxCharge = BEAT.maxCharges
  game.beatCharge = 0
  game.beatCooldown = 0
})

describe('the Beat charge bar', () => {
  it('is full whenever a strike is available', () => {
    // Nothing is being waited for, so there is no progress to report.
    game.beatCharge = 2.4
    expect(game.canStrike).toBe(true)
    expect(game.beatProgress).toBe(1)
  })

  it('ignores the post-strike cooldown entirely', () => {
    // Playtest: reporting the 0.25 s cooldown made the bar race from empty to
    // full and then snap back to the real charge fraction. The cooldown is a
    // double-click guard, not a wait, so the bar must not move for it at all.
    game.beatCharge = 2.4
    game.beatCooldown = BEAT.cooldown
    expect(game.beatProgress).toBe(1)

    game.beatCooldown = BEAT.cooldown / 2
    expect(game.beatProgress).toBe(1)
  })

  it('tracks the regenerating fraction when out of charge', () => {
    game.beatCharge = 0.25
    expect(game.canStrike).toBe(false)
    expect(game.beatProgress).toBeCloseTo(0.25, 6)

    game.beatCharge = 0.9
    expect(game.beatProgress).toBeCloseTo(0.9, 6)
  })

  it('shows the regenerating fraction even while the cooldown runs', () => {
    // Straight after a strike that emptied the last charge. The wait that
    // matters is the 3 s recharge, not the 0.25 s guard.
    game.beatCharge = 0.5
    game.beatCooldown = BEAT.cooldown
    expect(game.beatProgress).toBeCloseTo(0.5, 6)
  })

  it('never jumps backwards while a charge regenerates', () => {
    // The snap the playtest reported. Walk a charge from empty to whole across
    // a live cooldown and assert the bar only ever climbs.
    let previous = -1
    for (let charge = 0; charge <= 1.0001; charge += 0.05) {
      game.beatCharge = charge
      game.beatCooldown = charge < 0.2 ? BEAT.cooldown : 0
      expect(game.beatProgress, `charge ${charge.toFixed(2)}`).toBeGreaterThanOrEqual(previous)
      previous = game.beatProgress
    }
    expect(previous).toBe(1)
  })

  it('does not creep toward a charge the player cannot spend', () => {
    // With two whole charges banked a third is regenerating, but the bar must
    // read full — a strike is available right now, and a bar counting toward
    // something unactionable is noise.
    game.beatCharge = 2.6
    expect(game.beatProgress).toBe(1)
  })

  it('stays within 0 and 1 in every state', () => {
    for (const charge of [0, 0.5, 1, 2.99, BEAT.maxCharges]) {
      for (const cooldown of [0, BEAT.cooldown / 3, BEAT.cooldown]) {
        game.beatCharge = charge
        game.beatCooldown = cooldown
        expect(game.beatProgress, `charge ${charge} cooldown ${cooldown}`).toBeGreaterThanOrEqual(0)
        expect(game.beatProgress).toBeLessThanOrEqual(1)
      }
    }
  })

  it('reports no progress while the stage is over', () => {
    // canStrike is gated on `running`, so a resolved stage must not show a
    // full bar inviting an input that will be refused.
    game.beatCharge = 3
    game.phase = 'cleared'
    expect(game.canStrike).toBe(false)
    expect(game.beatProgress).toBe(0)
  })
})
