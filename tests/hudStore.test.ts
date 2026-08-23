import { beforeEach, describe, expect, it } from 'vitest'
import { game } from '../src/lib/stores/game.svelte'
import { FLARE } from '../src/lib/content/field'

beforeEach(() => {
  game.phase = 'wave-active'
  game.flareMaxCharge = FLARE.maxCharges
  game.flareCharge = 0
  game.flareCooldown = 0
})

describe('the Flare charge bar', () => {
  it('is full whenever a strike is available', () => {
    game.flareCharge = 2.4
    expect(game.canStrike).toBe(true)
    expect(game.flareProgress).toBe(1)
  })

  it('ignores the post-strike cooldown entirely', () => {
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
    game.flareCharge = 0.5
    game.flareCooldown = FLARE.cooldown
    expect(game.flareProgress).toBeCloseTo(0.5, 6)
  })

  it('never jumps backwards while a charge regenerates', () => {
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
    game.flareCharge = 3
    game.phase = 'cleared'
    expect(game.canStrike).toBe(false)
    expect(game.flareProgress).toBe(0)
  })
})

describe('the Salvage counter', () => {
  beforeEach(() => {
    game.primeSalvage(0)
    game.salvageGain = 0
  })

  it('shows the spendable balance, not a stage total', () => {
    game.publishSalvage(1702, 10)
    expect(game.salvage).toBe(1702)
  })

  it('pools a gain', () => {
    game.publishSalvage(10, 0)
    game.publishSalvage(25, 0.2)
    expect(game.salvageGain).toBe(25)
  })

  it('does not read a purchase as a gain', () => {
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
