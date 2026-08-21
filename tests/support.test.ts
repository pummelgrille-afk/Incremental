import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { SUPPORT } from '../src/lib/content/economy'
import { CHIMES, chimeById } from '../src/lib/content/supportUnits'
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
import { mountChime } from '../src/lib/core/formation'
import { formationPower } from '../src/lib/systems/scaling'
import type { SaveData } from '../src/lib/core/saveSchema'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'escapement-floor:first-shift'
const CHIME = CHIMES[0]

let save: SaveData

beforeEach(() => {
  save = createDefaultSave(0)
  save.meta.keys = 10_000
  unlock(save, 'chime', CHIME.id)
})

describe('Chimes are shaped, not levelled', () => {
  it('offers three tracks that pull against each other', () => {
    // A Movement levels and gets uniformly stronger; a Chime picks between
    // burst, sustain and punch for the same scarce Keys. That difference is
    // the "distinct in feel" PLAN.md Phase 25 asks for.
    expect(SUPPORT_TRACKS).toEqual(['capacity', 'winding', 'resonance'])
  })

  it('starts every track at zero', () => {
    for (const track of SUPPORT_TRACKS) {
      expect(trackLevel(save, CHIME.id, track), track).toBe(0)
    }
  })

  it('leaves an unupgraded Chime exactly as its content authored it', () => {
    // Buying nothing must behave as though the system did not exist, or every
    // Phase 14 balance measurement moves.
    const stats = supportStats(save, CHIME)
    expect(stats.maxCharge).toBe(CHIME.maxCharge)
    expect(stats.chargeInterval).toBe(CHIME.chargeInterval)
    expect(stats.attack).toBe(CHIME.attack)
  })

  it('prices each track independently', () => {
    // Spending on capacity must not make winding dearer — they are separate
    // shapes, not one shared level.
    buyTrack(save, CHIME.id, 'capacity')
    buyTrack(save, CHIME.id, 'capacity')

    expect(trackCost(save, CHIME.id, 'winding')).toBe(
      Math.ceil(SUPPORT.trackCost.base),
    )
  })

  it('charges more for each level already held on that track', () => {
    const first = trackCost(save, CHIME.id, 'capacity')!
    buyTrack(save, CHIME.id, 'capacity')
    expect(trackCost(save, CHIME.id, 'capacity')!).toBeGreaterThan(first)
  })

  it('refuses a track on a Chime that is not unlocked', () => {
    const fresh = createDefaultSave(0)
    fresh.meta.keys = 1000

    expect(trackCost(fresh, CHIME.id, 'capacity')).toBeNull()
    expect(buyTrack(fresh, CHIME.id, 'capacity')).toBe(false)
  })

  it('refuses without the Keys, and takes nothing', () => {
    save.meta.keys = 0
    expect(buyTrack(save, CHIME.id, 'capacity')).toBe(false)
    expect(trackLevel(save, CHIME.id, 'capacity')).toBe(0)
  })
})

describe('the tracks do what they say', () => {
  const fill = (track: SupportTrack) => {
    for (let i = 0; i < 10; i++) buyTrack(save, CHIME.id, track)
  }

  it('capacity holds more shots', () => {
    fill('capacity')
    expect(supportStats(save, CHIME).maxCharge).toBe(
      CHIME.maxCharge + SUPPORT.capacity.maxLevel * SUPPORT.capacity.chargesPerLevel,
    )
  })

  it('winding recharges faster', () => {
    fill('winding')
    expect(supportStats(save, CHIME).chargeInterval).toBeLessThan(CHIME.chargeInterval)
  })

  it('resonance strikes harder', () => {
    fill('resonance')
    expect(supportStats(save, CHIME).attack).toBeGreaterThan(CHIME.attack)
  })

  it('stops each track at its ceiling', () => {
    for (const track of SUPPORT_TRACKS) {
      fill(track)
      expect(trackLevel(save, CHIME.id, track), track).toBe(
        track === 'capacity'
          ? SUPPORT.capacity.maxLevel
          : track === 'winding'
            ? SUPPORT.winding.maxLevel
            : SUPPORT.resonance.maxLevel,
      )
      // Null rather than a price that can never be paid.
      expect(trackCost(save, CHIME.id, track), track).toBeNull()
    }
  })
})

describe('winding cannot cross the class-balance lever', () => {
  /**
   * `chargeInterval` is the lever between Chimes and Movements. Phase 14
   * measured 4 s as the point where a Chime is strictly better per Filing than
   * the Movements it competes with, 6 s as the crossover, 7 s the other way.
   * A Chime that could wind past that stops being a trade.
   */
  it('never drops below the authored floor, however many levels are bought', () => {
    for (let i = 0; i < 50; i++) buyTrack(save, CHIME.id, 'winding')
    expect(supportStats(save, CHIME).chargeInterval).toBeGreaterThanOrEqual(
      SUPPORT.winding.floorSeconds,
    )
  })

  it('keeps a fully wound Chime short of the dominance point', () => {
    // Phase 14's measurement: 4 s is where a Chime becomes strictly better.
    for (let i = 0; i < SUPPORT.winding.maxLevel; i++) {
      buyTrack(save, CHIME.id, 'winding')
    }
    expect(supportStats(save, CHIME).chargeInterval).toBeGreaterThan(4)
  })

  it('floors even if a later re-balance raises the level cap', () => {
    // The floor is enforced in `supportStats`, not by the cap, so widening the
    // cap cannot cross the lever by accident.
    save.meta.chimeUpgrades[CHIME.id] = { winding: 99 }
    expect(supportStats(save, CHIME).chargeInterval).toBe(SUPPORT.winding.floorSeconds)
  })
})

describe('upgrades reach the field', () => {
  function fielded(stats?: ReturnType<typeof supportStats>) {
    const sim = new Simulation(loadStage(STAGE), createRng(1))
    sim.state.chimes.length = 0
    return mountChime(sim.state, CHIME, 0, 1, stats)
  }

  it('gives the live Chime its upgraded charge economy', () => {
    for (let i = 0; i < SUPPORT.capacity.maxLevel; i++) {
      buyTrack(save, CHIME.id, 'capacity')
    }
    buyTrack(save, CHIME.id, 'winding')

    const stats = supportStats(save, CHIME)
    const chime = fielded(stats)

    expect(chime.maxCharge).toBe(stats.maxCharge)
    expect(chime.chargeInterval).toBe(stats.chargeInterval)
    // It starts full, so extra capacity is usable immediately.
    expect(chime.charge).toBe(stats.maxCharge)
  })

  it('leaves an unupgraded Chime on its authored numbers', () => {
    const chime = fielded()
    expect(chime.maxCharge).toBe(CHIME.maxCharge)
    expect(chime.chargeInterval).toBe(CHIME.chargeInterval)
    expect(chime.attackScale).toBe(1)
  })

  it('regenerates on the upgraded interval, not the authored one', () => {
    for (let i = 0; i < SUPPORT.winding.maxLevel; i++) {
      buyTrack(save, CHIME.id, 'winding')
    }
    const stats = supportStats(save, CHIME)

    const slow = new Simulation(loadStage(STAGE), createRng(1))
    slow.state.chimes.length = 0
    const plain = mountChime(slow.state, CHIME, 0)
    plain.charge = 0

    const fast = new Simulation(loadStage(STAGE), createRng(1))
    fast.state.chimes.length = 0
    const wound = mountChime(fast.state, CHIME, 0, 1, stats)
    wound.charge = 0

    for (let i = 0; i < 60; i++) {
      slow.tick(TICK_SECONDS)
      fast.tick(TICK_SECONDS)
    }
    expect(wound.charge).toBeGreaterThan(plain.charge)
  })

  it('raises the formation power the difficulty director reads', () => {
    // Phase 19 rates a Chime by its Charge economy, so upgrading it must move
    // that number — otherwise the director would under-read an upgraded build.
    const bare = new Simulation(loadStage(STAGE), createRng(1))
    bare.state.chimes.length = 0
    mountChime(bare.state, CHIME, 0)
    const before = formationPower(bare.state)

    for (let i = 0; i < SUPPORT.resonance.maxLevel; i++) {
      buyTrack(save, CHIME.id, 'resonance')
    }
    const strong = new Simulation(loadStage(STAGE), createRng(1))
    strong.state.chimes.length = 0
    mountChime(strong.state, CHIME, 0, 1, supportStats(save, CHIME))

    expect(formationPower(strong.state)).toBeGreaterThan(before)
  })
})

describe('the editor view', () => {
  it('reports every Chime with its tracks', () => {
    const roster = supportRoster(save)
    expect(roster).toHaveLength(CHIMES.length)
    expect(roster[0].tracks).toHaveLength(SUPPORT_TRACKS.length)
  })

  it('marks a locked Chime as such and offers it nothing', () => {
    const fresh = createDefaultSave(0)
    fresh.meta.keys = 1000
    const [entry] = supportRoster(fresh)

    expect(entry.unlocked).toBe(false)
    for (const track of entry.tracks) {
      expect(track.cost, track.track).toBeNull()
      expect(track.affordable).toBe(false)
    }
  })

  it('totals what has been sunk into a Chime', () => {
    const before = save.meta.keys
    buyTrack(save, CHIME.id, 'capacity')
    buyTrack(save, CHIME.id, 'resonance')

    expect(investedIn(save, CHIME.id)).toBe(before - save.meta.keys)
  })

  it('reports nothing invested in a Chime that does not exist', () => {
    expect(investedIn(save, 'no-such-chime')).toBe(0)
  })

  it('does not confuse one Chime with another', () => {
    // The ledger is keyed per def; Phase 30 adds four to six more.
    buyTrack(save, CHIME.id, 'capacity')
    expect(trackLevel(save, 'another-chime', 'capacity')).toBe(0)
    expect(chimeById(CHIME.id)).toBeDefined()
  })
})
