import { minimumRewindDepth, recollectionFor } from './currencies'
import { effectsOf } from './upgradeTree'
import { placeOpeningFormation } from './loadout'
import { isBossStage } from '../systems/scaling'
import { parseStageAddress, type StageAddress } from '../entities/Zone'
import { zoneById } from '../content/zones'
import type { SaveData } from '../core/saveSchema'

export type RewindRefusal = 'no-award' | 'locked'

export interface RewindPreview {
  award: number

  after: number

  depth: number

  threshold: number
  canRewind: boolean
  refusedBecause: RewindRefusal | null

  resets: { salvage: number; platforms: number; arrays: number; stagesThisRun: number }

  keeps: { clearance: number; nodes: number; unlockedUnits: number; zones: number }
}

export function isRewindUnlocked(save: SaveData): boolean {
  if (save.meta.rewindCount > 0) return true

  return save.meta.clearedStages.some((address) => {
    const { zoneId, stageId } = parseStageAddress(address)
    const stage = zoneById(zoneId)?.stages.find((s) => s.id === stageId)
    return stage ? isBossStage(stage.scalingIndex) : false
  })
}

export function rewindPreview(save: SaveData, unlocked = isRewindUnlocked(save)): RewindPreview {
  const depth = save.run.deepestScalingIndex
  const tree = effectsOf(save)
  const award = recollectionFor(depth, tree)
  const threshold = minimumRewindDepth(tree)

  let refusedBecause: RewindRefusal | null = null
  if (!unlocked) refusedBecause = 'locked'

  else if (award <= 0) refusedBecause = 'no-award'

  return {
    award,
    after: save.meta.recollection + award,
    depth,
    threshold,
    canRewind: refusedBecause === null,
    refusedBecause,
    resets: {
      salvage: Math.floor(save.run.salvage),
      platforms: Object.keys(save.run.formation).length,
      arrays: Object.keys(save.run.mounts).length,
      stagesThisRun: depth,
    },
    keeps: {
      clearance: save.meta.clearance,
      nodes: save.meta.purchasedNodes.length,
      unlockedUnits:
        Object.keys(save.meta.platforms).length + Object.keys(save.meta.arrays).length,
      zones: save.meta.unlockedZones.length,
    },
  }
}

export interface RewindResult {
  rewound: boolean
  award: number
  refusedBecause: RewindRefusal | null
}

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
    salvage: 0,

    currentStage: null as StageAddress | null,
    deepestScalingIndex: 0,
    formation: {},
    mounts: {},
    repairsThisStage: 0,
    reinforcements: 0,
    startedAt: now,

    salvagePerSecond: 0,
    arraysEverMounted: false,
  }

  placeOpeningFormation(save)

  return { rewound: true, award: preview.award, refusedBecause: null }
}
