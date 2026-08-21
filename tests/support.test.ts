import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { SUPPORT } from '../src/lib/content/economy'
import { ARRAYS, arrayById } from '../src/lib/content/arrays'
import { unlock } from '../src/lib/progression/roster'
import {
  buyTrack,
  investedIn,
  supportRoster,
  supportStats,
  SUPPORT_TRACKS,
  trackCost,
  trackLevel,
  type SupportTrack,
} from '../src/lib/progression/support'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { mountArray } from '../src/lib/core/formation'
import { formationPower } from '../src/lib/systems/scaling'
import type { SaveData } from '../src/lib/core/saveSchema'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'
const ARRAY = ARRAYS[0]

let save: SaveData

beforeEach(() => {
  save = createDefaultSave(0)
  save.meta.clearance = 10_000
  unlock(save, 'array', ARRAY.id)
})

describe('Arrays are shaped, not levelled', () => {
  it('offers three tracks that pull against each other', () => {
    // A Platform levels and gets uniformly stronger; a Array picks between
    // burst, sustain and punch for the same scarce Clearance. That difference is
    // the "distinct in feel" PLAN.md Phase 25 asks for.
    expect(SUPPORT_TRACKS).toEqual(['capacity', 'recharge', 'resonance'])
  })

  it('starts every track at zero', () => {
    for (const track of SUPPORT_TRACKS) {
      expect(trackLevel(save, ARRAY.id, track), track).toBe(0)
    }
  })

  it('leaves an unupgraded Array exactly as its content authored it', () => {
    // Buying nothing must behave as though the system did not exist, or every
    // Phase 14 balance measurement moves.
    const stats = supportStats(save, ARRAY)
    expect(stats.maxCharge).toBe(ARRAY.maxCharge)
    expect(stats.chargeInterval).toBe(ARRAY.chargeInterval)
    expect(stats.attack).toBe(ARRAY.attack)
  })

  it('prices each track independently', () => {
    // Spending on capacity must not make recharge dearer — they are separate
    // shapes, not one shared level.
    buyTrack(save, ARRAY.id, 'capacity')
    buyTrack(save, ARRAY.id, 'capacity')

    expect(trackCost(save, ARRAY.id, 'recharge')).toBe(
      Math.ceil(SUPPORT.trackCost.base),
    )
  })

  it('charges more for each level already held on that track', () => {
    const first = trackCost(save, ARRAY.id, 'capacity')!
    buyTrack(save, ARRAY.id, 'capacity')
    expect(trackCost(save, ARRAY.id, 'capacity')!).toBeGreaterThan(first)
  })

  it('refuses a track on a Array that is not unlocked', () => {
    const fresh = createDefaultSave(0)
    fresh.meta.clearance = 1000

    expect(trackCost(fresh, ARRAY.id, 'capacity')).toBeNull()
    expect(buyTrack(fresh, ARRAY.id, 'capacity')).toBe(false)
  })

  it('refuses without the Clearance, and takes nothing', () => {
    save.meta.clearance = 0
    expect(buyTrack(save, ARRAY.id, 'capacity')).toBe(false)
    expect(trackLevel(save, ARRAY.id, 'capacity')).toBe(0)
  })
})

describe('the tracks do what they say', () => {
  const fill = (track: SupportTrack) => {
    for (let i = 0; i < 10; i++) buyTrack(save, ARRAY.id, track)
  }

  it('capacity holds more shots', () => {
    fill('capacity')
    expect(supportStats(save, ARRAY).maxCharge).toBe(
      ARRAY.maxCharge + SUPPORT.capacity.maxLevel * SUPPORT.capacity.chargesPerLevel,
    )
  })

  it('recharge recharges faster', () => {
    fill('recharge')
    expect(supportStats(save, ARRAY).chargeInterval).toBeLessThan(ARRAY.chargeInterval)
  })

  it('resonance strikes harder', () => {
    fill('resonance')
    expect(supportStats(save, ARRAY).attack).toBeGreaterThan(ARRAY.attack)
  })

  it('stops each track at its ceiling', () => {
    for (const track of SUPPORT_TRACKS) {
      fill(track)
      expect(trackLevel(save, ARRAY.id, track), track).toBe(
        track === 'capacity'
          ? SUPPORT.capacity.maxLevel
          : track === 'recharge'
            ? SUPPORT.recharge.maxLevel
            : SUPPORT.resonance.maxLevel,
      )
      // Null rather than a price that can never be paid.
      expect(trackCost(save, ARRAY.id, track), track).toBeNull()
    }
  })
})

describe('recharge cannot cross the class-balance lever', () => {
  /**
   * `chargeInterval` is the lever between Arrays and Platforms. Phase 14
   * measured 4 s as the point where a Array is strictly better per Filing than
   * the Platforms it competes with, 6 s as the crossover, 7 s the other way.
   * A Array that could wind past that stops being a trade.
   */
  it('never drops below the authored floor, however many levels are bought', () => {
    for (let i = 0; i < 50; i++) buyTrack(save, ARRAY.id, 'recharge')
    expect(supportStats(save, ARRAY).chargeInterval).toBeGreaterThanOrEqual(
      SUPPORT.recharge.floorSeconds,
    )
  })

  it('keeps a fully wound Array short of the dominance point', () => {
    // Phase 14's measurement: 4 s is where a Array becomes strictly better.
    for (let i = 0; i < SUPPORT.recharge.maxLevel; i++) {
      buyTrack(save, ARRAY.id, 'recharge')
    }
    expect(supportStats(save, ARRAY).chargeInterval).toBeGreaterThan(4)
  })

  it('floors even if a later re-balance raises the level cap', () => {
    // The floor is enforced in `supportStats`, not by the cap, so widening the
    // cap cannot cross the lever by accident.
    save.meta.arrayUpgrades[ARRAY.id] = { recharge: 99 }
    expect(supportStats(save, ARRAY).chargeInterval).toBe(SUPPORT.recharge.floorSeconds)
  })
})

describe('upgrades reach the field', () => {
  function fielded(stats?: ReturnType<typeof supportStats>) {
    const sim = new Simulation(loadStage(STAGE), createRng(1))
    sim.state.arrays.length = 0
    return mountArray(sim.state, ARRAY, 0, 1, stats)
  }

  it('gives the live Array its upgraded charge economy', () => {
    for (let i = 0; i < SUPPORT.capacity.maxLevel; i++) {
      buyTrack(save, ARRAY.id, 'capacity')
    }
    buyTrack(save, ARRAY.id, 'recharge')

    const stats = supportStats(save, ARRAY)
    const array = fielded(stats)

    expect(array.maxCharge).toBe(stats.maxCharge)
    expect(array.chargeInterval).toBe(stats.chargeInterval)
    // It starts full, so extra capacity is usable immediately.
    expect(array.charge).toBe(stats.maxCharge)
  })

  it('leaves an unupgraded Array on its authored numbers', () => {
    const array = fielded()
    expect(array.maxCharge).toBe(ARRAY.maxCharge)
    expect(array.chargeInterval).toBe(ARRAY.chargeInterval)
    expect(array.attackScale).toBe(1)
  })

  it('regenerates on the upgraded interval, not the authored one', () => {
    for (let i = 0; i < SUPPORT.recharge.maxLevel; i++) {
      buyTrack(save, ARRAY.id, 'recharge')
    }
    const stats = supportStats(save, ARRAY)

    const slow = new Simulation(loadStage(STAGE), createRng(1))
    slow.state.arrays.length = 0
    const plain = mountArray(slow.state, ARRAY, 0)
    plain.charge = 0

    const fast = new Simulation(loadStage(STAGE), createRng(1))
    fast.state.arrays.length = 0
    const wound = mountArray(fast.state, ARRAY, 0, 1, stats)
    wound.charge = 0

    for (let i = 0; i < 60; i++) {
      slow.tick(TICK_SECONDS)
      fast.tick(TICK_SECONDS)
    }
    expect(wound.charge).toBeGreaterThan(plain.charge)
  })

  it('raises the formation power the difficulty director reads', () => {
    // Phase 19 rates a Array by its Charge economy, so upgrading it must move
    // that number — otherwise the director would under-read an upgraded build.
    const bare = new Simulation(loadStage(STAGE), createRng(1))
    bare.state.arrays.length = 0
    mountArray(bare.state, ARRAY, 0)
    const before = formationPower(bare.state)

    for (let i = 0; i < SUPPORT.resonance.maxLevel; i++) {
      buyTrack(save, ARRAY.id, 'resonance')
    }
    const strong = new Simulation(loadStage(STAGE), createRng(1))
    strong.state.arrays.length = 0
    mountArray(strong.state, ARRAY, 0, 1, supportStats(save, ARRAY))

    expect(formationPower(strong.state)).toBeGreaterThan(before)
  })
})

describe('the editor view', () => {
  it('reports every Array with its tracks', () => {
    const roster = supportRoster(save)
    expect(roster).toHaveLength(ARRAYS.length)
    expect(roster[0].tracks).toHaveLength(SUPPORT_TRACKS.length)
  })

  it('marks a locked Array as such and offers it nothing', () => {
    const fresh = createDefaultSave(0)
    fresh.meta.clearance = 1000
    const [entry] = supportRoster(fresh)

    expect(entry.unlocked).toBe(false)
    for (const track of entry.tracks) {
      expect(track.cost, track.track).toBeNull()
      expect(track.affordable).toBe(false)
    }
  })

  it('totals what has been sunk into a Array', () => {
    const before = save.meta.clearance
    buyTrack(save, ARRAY.id, 'capacity')
    buyTrack(save, ARRAY.id, 'resonance')

    expect(investedIn(save, ARRAY.id)).toBe(before - save.meta.clearance)
  })

  it('reports nothing invested in a Array that does not exist', () => {
    expect(investedIn(save, 'no-such-array')).toBe(0)
  })

  it('does not confuse one Array with another', () => {
    // The ledger is keyed per def; Phase 30 adds four to six more.
    buyTrack(save, ARRAY.id, 'capacity')
    expect(trackLevel(save, 'another-array', 'capacity')).toBe(0)
    expect(arrayById(ARRAY.id)).toBeDefined()
  })
})
