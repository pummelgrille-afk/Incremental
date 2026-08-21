import { minimumRewindDepth, recollectionFor } from './currencies'
import { effectsOf } from './upgradeTree'
import { placeOpeningFormation } from './loadout'
import { isBossStage } from '../systems/scaling'
import { parseStageAddress, type StageAddress } from '../entities/Zone'
import { zoneById } from '../content/zones'
import type { SaveData } from '../core/saveSchema'

/**
 * The Rewind — "go again but stronger".
 *
 * economy-spec.md §3 is the contract, and its central claim is the one this
 * module exists to honour: **a Rewind resets your power within a run, not your
 * access to content.** Re-traversing cleared ground is the commonest reason
 * players stop returning to a prestige loop, so zone unlocks, the roster and
 * the whole Escapement Tree survive.
 *
 * Everything here is a pure function of the save, like the rest of
 * `progression/`. `core/bootstrap.ts` is what rebuilds the simulation
 * afterwards.
 */

export type RewindRefusal = 'no-award' | 'locked'

export interface RewindPreview {
  /** Recollection this Rewind would grant. */
  award: number
  /** Recollection held afterwards. */
  after: number
  /** Depth the run reached, which drives the award. */
  depth: number
  /** Shallowest depth that pays anything, for the explanation. */
  threshold: number
  canRewind: boolean
  refusedBecause: RewindRefusal | null

  /** What the Rewind clears. */
  resets: { filings: number; movements: number; chimes: number; stagesThisRun: number }
  /** What it keeps. */
  keeps: { keys: number; nodes: number; unlockedUnits: number; zones: number }
}

/**
 * Whether the Rewind is available at all.
 *
 * economy-spec.md §3 gates it on the first boss clear, so a first-time player
 * meets one progression system at a time. Bosses arrive in Phase 32, so the
 * second condition — having already Rewound — is what keeps the gate coherent
 * if that phase lands after this one.
 */
export function isRewindUnlocked(save: SaveData): boolean {
  if (save.meta.rewindCount > 0) return true

  return save.meta.clearedStages.some((address) => {
    const { zoneId, stageId } = parseStageAddress(address)
    const stage = zoneById(zoneId)?.stages.find((s) => s.id === stageId)
    return stage ? isBossStage(stage.scalingIndex) : false
  })
}

/**
 * What a Rewind would do, without doing it.
 *
 * The before/after PLAN.md Phase 26 asks the modal for. Quoted rather than
 * recomputed in the component so the number the player is shown is the number
 * they get — the same reason the tree's path preview lives in the backend.
 *
 * `unlocked` is an argument rather than read inside, so `bootstrap` can widen
 * the gate for a dev build without `isRewindUnlocked` itself becoming
 * environment-dependent — which would make every test of it vacuous, since
 * Vitest runs with DEV true.
 */
export function rewindPreview(save: SaveData, unlocked = isRewindUnlocked(save)): RewindPreview {
  const depth = save.run.deepestScalingIndex
  const tree = effectsOf(save)
  const award = recollectionFor(depth, tree)
  const threshold = minimumRewindDepth(tree)

  let refusedBecause: RewindRefusal | null = null
  if (!unlocked) refusedBecause = 'locked'
  // The zero-award guard economy-spec.md §1 requires: a player must never be
  // able to burn a run for nothing.
  else if (award <= 0) refusedBecause = 'no-award'

  return {
    award,
    after: save.meta.recollection + award,
    depth,
    threshold,
    canRewind: refusedBecause === null,
    refusedBecause,
    resets: {
      filings: Math.floor(save.run.filings),
      movements: Object.keys(save.run.formation).length,
      chimes: Object.keys(save.run.mounts).length,
      stagesThisRun: depth,
    },
    keeps: {
      keys: save.meta.keys,
      nodes: save.meta.purchasedNodes.length,
      unlockedUnits:
        Object.keys(save.meta.movements).length + Object.keys(save.meta.chimes).length,
      zones: save.meta.unlockedZones.length,
    },
  }
}

export interface RewindResult {
  rewound: boolean
  award: number
  refusedBecause: RewindRefusal | null
}

/**
 * Perform the Rewind.
 *
 * `run` is replaced wholesale rather than field-by-field. That is the shape
 * `saveSchema.ts` was built around — "prestige is a field swap rather than a
 * field-by-field audit, and a new persistent value cannot be reset by
 * accident". A future field added to `run` is therefore cleared for free, and a
 * future field added to `meta` survives for free.
 */
export function rewind(
  save: SaveData,
  now = Date.now(),
  unlocked = isRewindUnlocked(save),
): RewindResult {
  const preview = rewindPreview(save, unlocked)
  if (!preview.canRewind) {
    return { rewound: false, award: 0, refusedBecause: preview.refusedBecause }
  }

  save.meta.recollection += preview.award
  save.meta.rewindCount += 1

  save.run = {
    filings: 0,
    // Null rather than the starting address: `bootstrap` resolves it, and
    // hard-coding it here would put the play order in two places.
    currentStage: null as StageAddress | null,
    deepestScalingIndex: 0,
    formation: {},
    mounts: {},
    repairsThisStage: 0,
    reinforcements: 0,
    startedAt: now,
  }

  /*
   * Hand back the opening formation.
   *
   * Without this a Rewind lands the player in exactly the deadlock Phase 24
   * found at a fresh save: no units on the field, no Filings to buy any, and
   * Filings only come from kills. The roster survives a Rewind, so the usual
   * first-time grant would decline to fire.
   */
  placeOpeningFormation(save)

  return { rewound: true, award: preview.award, refusedBecause: null }
}
