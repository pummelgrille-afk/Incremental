import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { ROSTER, SALVAGE } from '../src/lib/content/economy'
import { PLATFORMS, STARTING_PLATFORM_ID } from '../src/lib/content/platforms'
import { ARRAYS } from '../src/lib/content/arrays'
import {
  isUnlocked,
  levelCost,
  levelOf,
  levelScale,
  levelUp,
  rosterOf,
  unlock,
} from '../src/lib/progression/roster'
import {
  clearFormation,
  deletePreset,
  grantStartingLoadout,
  loadPreset,
  MAX_PRESETS,
  mountArray,
  OPENING_SLOTS,
  nextSlotCost,
  placePlatform,
  removePlatform,
  savePreset,
  slotsUsed,
  unmountArray,
} from '../src/lib/progression/loadout'
import { slotCost } from '../src/lib/progression/currencies'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { applyFormation, placePlatform as placeUnit } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { attackScaleOf } from '../src/lib/systems/buffs'
import { levelsOf } from '../src/lib/progression/roster'
import type { StageAddress } from '../src/lib/entities/Zone'
import type { SaveData } from '../src/lib/core/saveSchema'

const STAGE: StageAddress = 'service-floor:first-shift'

let save: SaveData

beforeEach(() => {
  save = createDefaultSave(0)
})

describe('the starting loadout', () => {
  it('gives a new save a unit and puts it on the field', () => {
    /*
     * Without this the opening state is a deadlock: Salvage buy slots, Salvage
     * come from kills, kills need a unit. `content/platforms.ts` already declares
     * the intent and economy-spec.md §6 wants the first Platform slotted inside
     * thirty seconds, which no amount of earning achieves from zero.
     */
    grantStartingLoadout(save)

    expect(isUnlocked(save, 'platform', STARTING_PLATFORM_ID)).toBe(true)
    expect(slotsUsed(save)).toBe(OPENING_SLOTS.length)
    for (const defId of Object.values(save.run.formation)) {
      expect(defId).toBe(STARTING_PLATFORM_ID)
    }
  })

  it('spreads the opening across two rings', () => {
    /*
     * Coverage matters more than count at this size. Four Hammers all on ring 2
     * lose 24 of 24 runs without the Flare; two-and-two clear all of them. Ring 1
     * is the last line — the only ring that reaches the Sun.
     *
     * It also means conjunction can fire in the first stage, since that needs
     * two Platforms on *different* rings.
     */
    grantStartingLoadout(save)
    const rings = new Set(Object.keys(save.run.formation).map((k) => k.split(':')[0]))
    expect(rings.size).toBeGreaterThan(1)
    expect(rings.has('1')).toBe(true)
  })

  it('does not discount the slots that follow', () => {
    // The granted four count toward the curve: the fifth Platform costs what
    // the fifth Platform costs. A grant, not a discount.
    grantStartingLoadout(save)
    expect(nextSlotCost(save)).toBe(slotCost(OPENING_SLOTS.length))
  })

  it('costs nothing, because there is nothing to spend', () => {
    grantStartingLoadout(save)
    expect(save.run.salvage).toBe(0)
  })

  it('does not hand a unit back to a player who cleared their field', () => {
    grantStartingLoadout(save)
    clearFormation(save)
    grantStartingLoadout(save)

    expect(slotsUsed(save)).toBe(0)
  })

  it('is free only once, however many times it runs', () => {
    for (let i = 0; i < 5; i++) grantStartingLoadout(save)
    expect(slotsUsed(save)).toBe(OPENING_SLOTS.length)
  })
})

describe('unlocking', () => {
  it('charges the authored Key cost', () => {
    const rake = PLATFORMS.find((m) => m.id === 'rake')!
    save.meta.clearance = 10

    expect(unlock(save, 'platform', 'rake')).toBe(true)
    expect(save.meta.clearance).toBe(10 - rake.unlockCost)
    expect(levelOf(save, 'platform', 'rake')).toBe(1)
  })

  it('refuses without the Clearance, and takes nothing', () => {
    save.meta.clearance = 0
    expect(unlock(save, 'platform', 'rake')).toBe(false)
    expect(save.meta.clearance).toBe(0)
    expect(isUnlocked(save, 'platform', 'rake')).toBe(false)
  })

  it('will not unlock the same unit twice', () => {
    save.meta.clearance = 100
    unlock(save, 'platform', 'rake')
    const after = save.meta.clearance

    expect(unlock(save, 'platform', 'rake')).toBe(false)
    expect(save.meta.clearance).toBe(after)
  })

  it('ignores an unknown id', () => {
    save.meta.clearance = 100
    expect(unlock(save, 'platform', 'nobody')).toBe(false)
    expect(save.meta.clearance).toBe(100)
  })

  it('unlocks Arrays from their own ledger', () => {
    // The two rosters are separate, so unlocking a Platform must not appear to
    // unlock a Array with the same index.
    save.meta.clearance = 100
    unlock(save, 'array', ARRAYS[0].id)

    expect(isUnlocked(save, 'array', ARRAYS[0].id)).toBe(true)
    expect(isUnlocked(save, 'platform', ARRAYS[0].id)).toBe(false)
  })
})

describe('levelling', () => {
  beforeEach(() => {
    save.meta.clearance = 10_000
    unlock(save, 'platform', 'rake')
  })

  it('leaves level 1 at exactly no bonus', () => {
    // An unlevelled roster must behave as though levelling did not exist.
    expect(levelScale(1)).toBe(1)
    expect(levelScale(0)).toBe(1)
  })

  it('is flat, not compounding', () => {
    // Compounding 12% over ten levels is +210% and would outrun the enemy HP
    // curve; flat is +108%, a real investment that does not.
    const ten = levelScale(ROSTER.maxLevel)
    expect(ten).toBeCloseTo(1 + (ROSTER.maxLevel - 1) * ROSTER.levelScaling, 10)
    expect(ten).toBeLessThan((1 + ROSTER.levelScaling) ** (ROSTER.maxLevel - 1))
  })

  it('charges more for each level already held', () => {
    const first = levelCost(save, 'platform', 'rake')!
    levelUp(save, 'platform', 'rake')
    const second = levelCost(save, 'platform', 'rake')!

    expect(second).toBeGreaterThan(first)
  })

  it('stops at the ceiling', () => {
    for (let i = 1; i < ROSTER.maxLevel; i++) {
      expect(levelUp(save, 'platform', 'rake'), `level ${i}`).toBe(true)
    }
    expect(levelOf(save, 'platform', 'rake')).toBe(ROSTER.maxLevel)

    // Null rather than an unaffordable price the player can never reach.
    expect(levelCost(save, 'platform', 'rake')).toBeNull()
    expect(levelUp(save, 'platform', 'rake')).toBe(false)
  })

  it('refuses to level a unit that is not owned', () => {
    expect(levelCost(save, 'platform', 'anchor')).toBeNull()
    expect(levelUp(save, 'platform', 'anchor')).toBe(false)
  })

  it('refuses without the Clearance, and takes nothing', () => {
    save.meta.clearance = 0
    expect(levelUp(save, 'platform', 'rake')).toBe(false)
    expect(levelOf(save, 'platform', 'rake')).toBe(1)
  })

  it('reports the whole roster for the editor', () => {
    const entries = rosterOf(save, 'platform')
    expect(entries).toHaveLength(PLATFORMS.length)

    const rake = entries.find((e) => e.id === 'rake')!
    expect(rake.unlocked).toBe(true)
    expect(rake.canLevel).toBe(true)
    expect(rake.atMaxLevel).toBe(false)
  })
})

describe('the slot economy', () => {
  beforeEach(() => {
    grantStartingLoadout(save)
    save.meta.clearance = 100
    unlock(save, 'platform', 'anchor')
    save.run.salvage = 1000
  })

  it('charges the growing curve to add a unit', () => {
    const quoted = nextSlotCost(save)
    const before = save.run.salvage

    const result = placePlatform(save, 'anchor', 1, 2)
    expect(result.placed).toBe(true)
    expect(result.spent).toBe(quoted)
    expect(save.run.salvage).toBe(before - quoted)
  })

  it('charges nothing to move a unit already fielded', () => {
    /*
     * Salvage buy the *size* of a formation, not each placement. Taxing a
     * rearrangement would punish the game's main pleasure — the same argument
     * economy-spec.md §2 makes for a free respec.
     */
    placePlatform(save, 'anchor', 1, 2)
    const before = save.run.salvage

    const moved = placePlatform(save, 'anchor', 1, 4, { ring: 1, slot: 2 })
    expect(moved.placed).toBe(true)
    expect(moved.spent).toBe(0)
    expect(save.run.salvage).toBe(before)
    expect(slotsUsed(save)).toBe(OPENING_SLOTS.length + 1)
  })

  it('refunds exactly what re-adding would cost', () => {
    // The round trip has to be neutral, or removing and re-adding becomes
    // either a leak or a tax.
    placePlatform(save, 'anchor', 1, 2)
    const before = save.run.salvage

    removePlatform(save, 1, 2)
    placePlatform(save, 'anchor', 1, 2)

    expect(save.run.salvage).toBe(before)
  })

  it('refuses an occupied slot', () => {
    placePlatform(save, 'anchor', 1, 2)
    const result = placePlatform(save, 'anchor', 1, 2)
    expect(result.refusedBecause).toBe('occupied')
  })

  it('refuses a slot that does not exist', () => {
    expect(placePlatform(save, 'anchor', 1, 99).refusedBecause).toBe('invalid-slot')
  })

  it('refuses a unit that is not unlocked', () => {
    expect(placePlatform(save, 'rake', 1, 2).refusedBecause).toBe('not-unlocked')
  })

  it('refuses when the Salvage are not there, and takes nothing', () => {
    save.run.salvage = 0
    const result = placePlatform(save, 'anchor', 1, 2)

    expect(result.refusedBecause).toBe('unaffordable')
    expect(save.run.salvage).toBe(0)
    expect(slotsUsed(save)).toBe(OPENING_SLOTS.length)
  })

  it('prices the nth slot from the authored curve', () => {
    expect(nextSlotCost(save)).toBe(slotCost(slotsUsed(save)))
    expect(slotCost(0)).toBe(SALVAGE.slot.base)
  })

  it('does nothing when removing from an empty slot', () => {
    const before = save.run.salvage
    expect(removePlatform(save, 3, 5)).toBe(0)
    expect(save.run.salvage).toBe(before)
  })
})

describe('presets', () => {
  beforeEach(() => {
    grantStartingLoadout(save)
    save.meta.clearance = 100
    unlock(save, 'platform', 'anchor')
    unlock(save, 'array', ARRAYS[0].id)
    save.run.salvage = 5000

    placePlatform(save, 'anchor', 1, 2)
    placePlatform(save, 'anchor', 1, 4)
    mountArray(save, ARRAYS[0].id, 0)
  })

  it('stores the arrangement and fields it again', () => {
    savePreset(save, 'wide')
    const arrangement = { ...save.run.formation }

    clearFormation(save)
    const result = loadPreset(save, 'wide')

    expect(result.loaded).toBe(true)
    expect(save.run.formation).toEqual(arrangement)
    expect(result.skipped).toEqual([])
  })

  it('survives a Rewind, because it lives in meta', () => {
    // An arrangement you liked should outlive the reset that takes the units
    // away, or every Rewind means rebuilding from memory.
    savePreset(save, 'wide')
    save.run = createDefaultSave(0).run

    expect(save.meta.presets.map((p) => p.name)).toEqual(['wide'])
  })

  it('charges the preset its full price, not the difference', () => {
    savePreset(save, 'wide')
    const fielded = save.run.salvage

    clearFormation(save)
    save.run.salvage = fielded
    loadPreset(save, 'wide')

    // Refunding first means the player can always afford a formation they
    // already had, whatever order the slots come back in.
    expect(save.run.salvage).toBeLessThan(fielded)
    expect(slotsUsed(save)).toBe(OPENING_SLOTS.length + 2)
  })

  it('overwrites a preset of the same name rather than duplicating', () => {
    savePreset(save, 'wide')
    removePlatform(save, 1, 4)
    savePreset(save, 'wide')

    expect(save.meta.presets).toHaveLength(1)
    expect(Object.keys(save.meta.presets[0].formation)).toHaveLength(
      OPENING_SLOTS.length + 1,
    )
  })

  it('caps how many can be kept', () => {
    for (let i = 0; i < MAX_PRESETS; i++) {
      expect(savePreset(save, `p${i}`), `preset ${i}`).toBe(true)
    }
    expect(savePreset(save, 'one-too-many')).toBe(false)
    expect(save.meta.presets).toHaveLength(MAX_PRESETS)
  })

  it('deletes by name', () => {
    savePreset(save, 'wide')
    expect(deletePreset(save, 'wide')).toBe(true)
    expect(deletePreset(save, 'wide')).toBe(false)
    expect(save.meta.presets).toEqual([])
  })

  it('skips entries it can no longer field rather than refusing wholesale', () => {
    // A preset saved across a content or roster change must still do as much
    // as it can — a partial field flares none.
    savePreset(save, 'wide')
    clearFormation(save)
    delete save.meta.platforms['anchor']

    const result = loadPreset(save, 'wide')
    expect(result.loaded).toBe(true)
    expect(result.skipped.length).toBeGreaterThan(0)
    expect(mountsUsedOf(save)).toBe(1)
  })

  it('reports nothing for a preset that does not exist', () => {
    expect(loadPreset(save, 'nope').loaded).toBe(false)
  })

  it('unmounts a Array with a refund', () => {
    const before = save.run.salvage
    const refund = unmountArray(save, 0)
    expect(refund).toBeGreaterThan(0)
    expect(save.run.salvage).toBe(before + refund)
  })
})

function mountsUsedOf(save: SaveData): number {
  return Object.keys(save.run.mounts).length
}

describe('levelling reaches the field', () => {
  /**
   * The half that matters. `levelScale` being correct is worth nothing if the
   * simulation does not read it — and Phase 18 found that levelling had been
   * silently erased by the buff decay for exactly that reason.
   */
  it('gives a levelled Platform more HP and more damage', () => {
    const sim = new Simulation(loadStage(STAGE), createRng(1))
    const def = platformById('bolt')!

    const plain = placeUnit(sim.state, def, 2, 0, 1)
    const levelled = placeUnit(sim.state, def, 2, 5, ROSTER.maxLevel)

    expect(levelled.maxHp).toBeCloseTo(plain.maxHp * levelScale(ROSTER.maxLevel), 6)
    expect(attackScaleOf(levelled)).toBeCloseTo(
      attackScaleOf(plain) * levelScale(ROSTER.maxLevel),
      6,
    )
  })

  it('leaves an unlevelled Platform exactly as it was', () => {
    // Level 1 must be a no-op, or every existing balance measurement moves.
    const sim = new Simulation(loadStage(STAGE), createRng(1))
    const def = platformById('bolt')!
    const unit = placeUnit(sim.state, def, 2, 0, 1)

    expect(unit.levelScale).toBe(1)
    expect(unit.maxHp).toBe(def.maxHp)
  })

  it('fields the levels the save records', () => {
    const sim = new Simulation(loadStage(STAGE), createRng(1))
    grantStartingLoadout(save)
    save.meta.platforms[STARTING_PLATFORM_ID] = 4

    applyFormation(
      sim.state,
      save.run.formation,
      platformById,
      levelsOf(save, 'platform'),
    )

    const unit = sim.state.platforms[0]
    expect(unit.level).toBe(4)
    expect(unit.levelScale).toBeCloseTo(levelScale(4), 10)
  })
})

describe('a brand-new save can actually play', () => {
  /**
   * The opening is the one part of the game every player sees, and it was
   * broken until measured: Phase 24 replaced the hardcoded starting formation
   * with the saved one, and a fresh save fields exactly one unit.
   *
   * Measured over 16 seeds, one Bolt on ring 1 clears First Shift every
   * time; the same Bolt on ring 2 loses 12 of them. This asserts the
   * outcome rather than the placement, so a later change that moves the unit
   * somewhere equally good still passes.
   */
  function playOpening(seed: number, useFlare = true): { cleared: boolean; lowest: number } {
    const fresh = createDefaultSave(0)
    grantStartingLoadout(fresh)

    const sim = new Simulation(loadStage(STAGE), createRng(seed))
    applyFormation(
      sim.state,
      fresh.run.formation,
      platformById,
      levelsOf(fresh, 'platform'),
    )

    let lowest = 1
    let cleared = false
    let lost = false
    for (let i = 0; i < 6000 && !cleared && !lost; i++) {
      // The Flare, played the way the balance harness plays it.
      const contact = sim.state.contact
      if (useFlare && contact.length > 1 && sim.state.flare.charge >= 1) {
        sim.strike(contact[0].position.x, contact[0].position.y)
      }
      const events = sim.tick(TICK_SECONDS)
      cleared = events.stageCleared
      lost = events.stageLost
      lowest = Math.min(lowest, sim.state.sun.hp / sim.state.sun.maxHp)
    }
    return { cleared, lowest }
  }

  it('clears the opening stage with what the game hands it', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(playOpening(seed).cleared, `seed ${seed}`).toBe(true)
    }
  })

  it('does so with real margin, not a knife edge', () => {
    // A first stage won on the last point of Output teaches nothing except
    // that the game is unfair.
    const lows = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => playOpening(s).lowest)
    expect(Math.min(...lows)).toBeGreaterThan(0.25)
  })

  it('clears it without a single Flare', () => {
    /*
     * Pillar P1, "the machine really does run without you" — combat-spec.md §1.
     * This is the whole reason the opening grant is four units rather than one:
     * at one unit the property failed 16 times in 16.
     */
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const result = playOpening(seed, false)
      expect(result.cleared, `seed ${seed}`).toBe(true)
    }
  })
})
