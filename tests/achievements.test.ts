import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { ACHIEVEMENTS } from '../src/lib/content/achievements'
import {
  achievementList,
  contextFor,
  earnedCount,
  evaluate,
  isEarned,
} from '../src/lib/progression/achievements'
import { STARTING_ZONE_ID, ZONES } from '../src/lib/content/zones'
import { grantStartingLoadout, mountArray } from '../src/lib/progression/loadout'
import { unlock } from '../src/lib/progression/roster'
import type { AchievementDef } from '../src/lib/entities/Achievement'
import type { SaveData } from '../src/lib/core/saveSchema'
import type { StageAddress } from '../src/lib/entities/Zone'

const FIRST = `${STARTING_ZONE_ID}:first-shift` as StageAddress

let save: SaveData

beforeEach(() => {
  save = createDefaultSave(0)
})

describe('the authored list', () => {
  it('transcribes the names narrative.md authored', () => {
    // The copy belongs to the design doc, not to content/achievements.ts. If
    // these drift, the doc is no longer the source of truth it claims to be.
    const names = ACHIEVEMENTS.map((a) => a.name)
    expect(names).toEqual([
      'Signed for the Shift',
      'Within Tolerance',
      'Noted in the Log',
      'Sat Down for It',
      'Documented Procedure',
      'The Undermaster Will Hear of This',
      'Wound It Back',
    ])
  })

  it('has no duplicate ids', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every achievement something to say', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.description.length, a.id).toBeGreaterThan(0)
    }
  })

  it('earns nothing on a fresh save', () => {
    // Every trigger must be false for a player who has done nothing, or the
    // list opens half-complete.
    expect(evaluate(save, 'load')).toEqual([])
    expect(earnedCount(save)).toBe(0)
  })
})

describe('awarding', () => {
  it('awards on the moment that earns it', () => {
    save.meta.clearedStages.push(FIRST)
    const earned = evaluate(save, 'stage-cleared')

    expect(earned.map((a) => a.id)).toContain('signed-for-the-shift')
    expect(isEarned(save, 'signed-for-the-shift')).toBe(true)
  })

  it('never awards the same achievement twice', () => {
    // Safe to call on every stage clear forever, which is how it is used.
    save.meta.clearedStages.push(FIRST)
    evaluate(save, 'stage-cleared')

    for (let i = 0; i < 5; i++) {
      expect(evaluate(save, 'stage-cleared')).toEqual([])
    }
    expect(save.meta.achievements.filter((id) => id === 'signed-for-the-shift')).toHaveLength(1)
  })

  it('returns only what was newly earned, so it can be announced', () => {
    save.meta.clearedStages.push(FIRST)
    const first = evaluate(save, 'stage-cleared')
    expect(first).toHaveLength(1)

    save.meta.rewindCount = 1
    const second = evaluate(save, 'rewind')
    expect(second.map((a) => a.id)).toEqual(['wound-it-back'])
  })

  it('can award several at once', () => {
    // A first clear that was also untouched lands two on the same tick, which
    // is why the UI queues rather than replaces.
    save.meta.clearedStages.push(FIRST)
    const earned = evaluate(save, 'stage-cleared', { clearedUntouched: true })

    expect(earned.map((a) => a.id).sort()).toEqual([
      'signed-for-the-shift',
      'within-tolerance',
    ])
  })

  it('survives a trigger that throws rather than taking the run with it', () => {
    // Content is data; one bad predicate must not crash a session.
    const exploding: AchievementDef = {
      id: 'boom',
      name: 'Boom',
      description: '',
      trigger: () => {
        throw new Error('bad predicate')
      },
    }
    const context = contextFor(save, 'load')
    expect(() => exploding.trigger(context)).toThrow()
    expect(() => evaluate(save, 'load')).not.toThrow()
  })
})

describe('each trigger', () => {
  it('Signed for the Shift — needs a clear', () => {
    expect(evaluate(save, 'stage-cleared')).toEqual([])
    save.meta.clearedStages.push(FIRST)
    expect(evaluate(save, 'stage-cleared').map((a) => a.id)).toContain('signed-for-the-shift')
  })

  it('Within Tolerance — needs an untouched clear, on the clear itself', () => {
    save.meta.clearedStages.push(FIRST)

    // Losing Output: not earned.
    evaluate(save, 'stage-cleared', { clearedUntouched: false })
    expect(isEarned(save, 'within-tolerance')).toBe(false)

    evaluate(save, 'stage-cleared', { clearedUntouched: true })
    expect(isEarned(save, 'within-tolerance')).toBe(true)
  })

  it('Within Tolerance — is not earned by an untouched *loss*', () => {
    // The flag only means anything on a clear; a stage lost at full Output is
    // not a thing, but the trigger should not depend on that staying true.
    evaluate(save, 'stage-lost', { clearedUntouched: true })
    expect(isEarned(save, 'within-tolerance')).toBe(false)
  })

  it('Noted in the Log — needs a conjunction to have fired', () => {
    evaluate(save, 'conjunction')
    expect(isEarned(save, 'noted-in-the-log')).toBe(false)

    save.statistics.conjunctionsFired = 1
    evaluate(save, 'conjunction')
    expect(isEarned(save, 'noted-in-the-log')).toBe(true)
  })

  it('Sat Down for It — needs three participants, not three conjunctions', () => {
    save.statistics.conjunctionsFired = 20
    evaluate(save, 'conjunction', { largestConjunction: 2 })
    expect(isEarned(save, 'sat-down-for-it')).toBe(false)

    evaluate(save, 'conjunction', { largestConjunction: 3 })
    expect(isEarned(save, 'sat-down-for-it')).toBe(true)
  })

  it('Documented Procedure — needs a zone cleared with no Array ever mounted', () => {
    evaluate(save, 'stage-cleared', { zoneCompleted: false })
    expect(isEarned(save, 'documented-procedure')).toBe(false)

    evaluate(save, 'stage-cleared', { zoneCompleted: true })
    expect(isEarned(save, 'documented-procedure')).toBe(true)
  })

  it('Documented Procedure — is denied by a Array mounted earlier in the run', () => {
    /*
     * The whole reason the flag is sticky and lives on the run: a per-zone or
     * per-moment check would let a player unmount before the final clear and
     * collect it on a technicality.
     */
    grantStartingLoadout(save)
    save.meta.clearance = 100
    save.run.salvage = 10_000
    unlock(save, 'array', 'long-baseline')
    mountArray(save, 'long-baseline', 0)

    // Unmounting does not clear the flag.
    save.run.mounts = {}

    evaluate(save, 'stage-cleared', { zoneCompleted: true })
    expect(isEarned(save, 'documented-procedure')).toBe(false)
  })

  it('The Undermaster Will Hear of This — needs a loss with everything owned fielded', () => {
    save.meta.platforms = { bolt: 1, anchor: 1 }

    // Only one of the two types on the field.
    evaluate(save, 'stage-lost', { distinctPlatformsSlotted: 1, unlockedPlatforms: 2 })
    expect(isEarned(save, 'the-undermaster-will-hear-of-this')).toBe(false)

    evaluate(save, 'stage-lost', { distinctPlatformsSlotted: 2, unlockedPlatforms: 2 })
    expect(isEarned(save, 'the-undermaster-will-hear-of-this')).toBe(true)
  })

  it('The Undermaster — is not earned by a *clear* with everything fielded', () => {
    save.meta.platforms = { bolt: 1 }
    evaluate(save, 'stage-cleared', { distinctPlatformsSlotted: 1, unlockedPlatforms: 1 })
    expect(isEarned(save, 'the-undermaster-will-hear-of-this')).toBe(false)
  })

  it('The Undermaster — is not earned by owning nothing', () => {
    // A player with an empty roster trivially has "all of it" fielded.
    evaluate(save, 'stage-lost', { distinctPlatformsSlotted: 0, unlockedPlatforms: 0 })
    expect(isEarned(save, 'the-undermaster-will-hear-of-this')).toBe(false)
  })

  it('Wound It Back — needs a Rewind', () => {
    evaluate(save, 'rewind')
    expect(isEarned(save, 'wound-it-back')).toBe(false)

    save.meta.rewindCount = 1
    evaluate(save, 'rewind')
    expect(isEarned(save, 'wound-it-back')).toBe(true)
  })
})

describe('catching up on load', () => {
  it('awards state-shaped achievements a save already qualifies for', () => {
    // A save from before this phase must not be permanently denied them.
    save.meta.clearedStages.push(FIRST)
    save.statistics.conjunctionsFired = 4
    save.meta.rewindCount = 2

    const earned = evaluate(save, 'load').map((a) => a.id)
    expect(earned).toContain('signed-for-the-shift')
    expect(earned).toContain('noted-in-the-log')
    expect(earned).toContain('wound-it-back')
  })

  it('does not award event-shaped ones on load', () => {
    // "A conjunction of three just fired" is not something a save records, so
    // loading must not invent it.
    save.statistics.conjunctionsFired = 99
    const earned = evaluate(save, 'load').map((a) => a.id)

    expect(earned).not.toContain('sat-down-for-it')
    expect(earned).not.toContain('within-tolerance')
  })
})

describe('the listing', () => {
  it('reports every achievement with its state', () => {
    save.meta.rewindCount = 1
    evaluate(save, 'rewind')

    const list = achievementList(save)
    expect(list).toHaveLength(ACHIEVEMENTS.length)
    expect(list.find((a) => a.id === 'wound-it-back')?.earned).toBe(true)
    expect(list.find((a) => a.id === 'signed-for-the-shift')?.earned).toBe(false)
  })

  it('counts against content, not against the save array', () => {
    // A save carrying an id that no longer exists must not report more earned
    // than there are — the same content-drift tolerance the rest of the save
    // layer has.
    save.meta.achievements.push('removed-in-a-later-version')
    expect(earnedCount(save)).toBe(0)
  })
})

describe('a real zone completion', () => {
  it('is reachable with the authored zone', () => {
    // Guards against the trigger asking for something the content cannot
    // produce — a permanently grey row.
    const zone = ZONES[0]
    for (const stage of zone.stages) {
      save.meta.clearedStages.push(`${zone.id}:${stage.id}` as StageAddress)
    }

    evaluate(save, 'stage-cleared', { zoneCompleted: true })
    expect(isEarned(save, 'documented-procedure')).toBe(true)
  })
})
