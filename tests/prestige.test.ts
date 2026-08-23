import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { STARTING_ZONE_ID } from '../src/lib/content/zones'
import { isRewindUnlocked, rewind, rewindPreview } from '../src/lib/progression/prestige'
import { recollectionFor } from '../src/lib/progression/currencies'
import { grantStartingLoadout, OPENING_SLOTS, slotsUsed } from '../src/lib/progression/loadout'
import { unlock } from '../src/lib/progression/roster'
import { pathTo, purchase } from '../src/lib/progression/upgradeTree'
import { buyTrack } from '../src/lib/progression/support'
import type { SaveData } from '../src/lib/core/saveSchema'
import type { StageAddress } from '../src/lib/entities/Zone'

let save: SaveData

function playedRun(): SaveData {
  const s = createDefaultSave(0)
  grantStartingLoadout(s)

  s.meta.rewindCount = 1
  s.meta.clearance = 50
  s.meta.recollection = 40
  s.meta.unlockedZones = [STARTING_ZONE_ID, 'somewhere-else']
  s.meta.clearedStages = [`${STARTING_ZONE_ID}:first-shift` as StageAddress]
  s.meta.achievements = ['within-tolerance']

  unlock(s, 'platform', 'anchor')
  unlock(s, 'array', 'long-baseline')
  buyTrack(s, 'long-baseline', 'capacity')
  purchase(s, 'aperture-force-of-the-pulse')

  s.run.salvage = 1200
  s.run.deepestScalingIndex = 20
  s.run.repairsThisStage = 3
  s.run.reinforcements = 2
  s.run.currentStage = `${STARTING_ZONE_ID}:noted-in-the-log` as StageAddress

  return s
}

beforeEach(() => {
  save = playedRun()
})

describe('the gate', () => {
  it('is closed on a fresh save', () => {
    expect(isRewindUnlocked(createDefaultSave(0))).toBe(false)
  })

  it('stays closed after ordinary stage clears', () => {
    const fresh = createDefaultSave(0)
    fresh.meta.clearedStages = [`${STARTING_ZONE_ID}:first-shift` as StageAddress]
    expect(isRewindUnlocked(fresh)).toBe(false)
  })

  it('opens once a Rewind has happened', () => {
    expect(isRewindUnlocked(save)).toBe(true)
  })

  it('refuses while locked, whatever the depth', () => {
    const locked = playedRun()
    locked.meta.rewindCount = 0

    const preview = rewindPreview(locked)
    expect(preview.canRewind).toBe(false)
    expect(preview.refusedBecause).toBe('locked')
    expect(rewind(locked).rewound).toBe(false)
  })
})

describe('the zero-award guard', () => {
  it('refuses a run that would pay nothing', () => {
    save.run.deepestScalingIndex = 0

    const preview = rewindPreview(save)
    expect(preview.award).toBe(0)
    expect(preview.canRewind).toBe(false)
    expect(preview.refusedBecause).toBe('no-award')
  })

  it('changes nothing when it refuses', () => {
    save.run.deepestScalingIndex = 0
    const before = JSON.stringify(save)

    expect(rewind(save).rewound).toBe(false)
    expect(JSON.stringify(save)).toBe(before)
  })

  it('reports a threshold that is actually the threshold', () => {
    const preview = rewindPreview(save)
    expect(recollectionFor(preview.threshold)).toBeGreaterThan(0)
    expect(recollectionFor(preview.threshold - 1)).toBe(0)
  })

  it('allows a run that has reached the threshold', () => {
    save.run.deepestScalingIndex = rewindPreview(save).threshold
    expect(rewindPreview(save).canRewind).toBe(true)
  })
})

describe('what a Rewind resets', () => {
  beforeEach(() => {
    rewind(save, 1000)
  })

  it('clears the run currency', () => {
    expect(save.run.salvage).toBe(0)
  })

  it('clears stage progress and the in-run counters', () => {
    expect(save.run.deepestScalingIndex).toBe(0)
    expect(save.run.repairsThisStage).toBe(0)
    expect(save.run.reinforcements).toBe(0)
    expect(save.run.currentStage).toBeNull()
  })

  it('clears the mounts', () => {
    expect(save.run.mounts).toEqual({})
  })

  it('hands back the opening formation', () => {
    expect(slotsUsed(save)).toBe(OPENING_SLOTS.length)
    const rings = new Set(Object.keys(save.run.formation).map((k) => k.split(':')[0]))
    expect(rings.has('1')).toBe(true)
  })

  it('stamps a fresh run start', () => {
    expect(save.run.startedAt).toBe(1000)
  })
})

describe('what a Rewind keeps', () => {
  let award = 0
  let heldBefore = 0

  beforeEach(() => {
    heldBefore = save.meta.recollection
    award = rewindPreview(save).award
    rewind(save)
  })

  it('pays the Recollection it quoted', () => {
    expect(award).toBeGreaterThan(0)
    expect(save.meta.recollection).toBe(heldBefore + award)
  })

  it('keeps Clearance and the roster with its levels', () => {
    expect(save.meta.clearance).toBeGreaterThan(0)
    expect(save.meta.platforms['anchor']).toBe(1)
    expect(save.meta.arrays['long-baseline']).toBe(1)
  })

  it('keeps the Almanac', () => {
    expect(save.meta.purchasedNodes).toContain('aperture-force-of-the-pulse')
  })

  it('keeps Array upgrade tracks', () => {
    expect(save.meta.arrayUpgrades['long-baseline']?.capacity).toBe(1)
  })

  it('keeps zone unlocks — you never re-clear a zone to reach it', () => {
    expect(save.meta.unlockedZones).toContain('somewhere-else')
    expect(save.meta.clearedStages).toHaveLength(1)
  })

  it('keeps achievements and statistics', () => {
    expect(save.meta.achievements).toContain('within-tolerance')
    expect(save.statistics.deepestScalingIndexEver).toBeGreaterThanOrEqual(0)
  })

  it('counts the Rewind', () => {
    expect(save.meta.rewindCount).toBe(2)
  })
})

describe('the preview matches what happens', () => {
  it('quotes the award the Rewind pays', () => {
    const preview = rewindPreview(save)
    const result = rewind(save)
    expect(result.award).toBe(preview.award)
  })

  it('quotes what is on the field before it is cleared', () => {
    const preview = rewindPreview(save)
    expect(preview.resets.platforms).toBe(OPENING_SLOTS.length)
    expect(preview.resets.salvage).toBe(1200)
  })

  it('applies the Recovery bonus to the quote', () => {
    const bare = rewindPreview(save).award

    const boosted = playedRun()
    boosted.meta.recollection = 10_000

    for (const step of pathTo(boosted, 'recovery-the-long-view').steps) {
      purchase(boosted, step.node.id)
    }

    expect(rewindPreview(boosted).award).toBeGreaterThan(bare)
  })

  it('changes nothing when only previewing', () => {
    const before = JSON.stringify(save)
    rewindPreview(save)
    expect(JSON.stringify(save)).toBe(before)
  })
})

describe('runs get deeper, and the award follows', () => {
  it('pays more for a deeper run', () => {
    const shallow = playedRun()
    shallow.run.deepestScalingIndex = 8

    const deep = playedRun()
    deep.run.deepestScalingIndex = 22

    expect(rewindPreview(deep).award).toBeGreaterThan(rewindPreview(shallow).award * 2)
  })

  it('lands near the authored cadence for a first Rewind', () => {
    const first = playedRun()
    first.run.deepestScalingIndex = 8
    expect(rewindPreview(first).award).toBeGreaterThanOrEqual(3)
    expect(rewindPreview(first).award).toBeLessThanOrEqual(6)
  })
})
