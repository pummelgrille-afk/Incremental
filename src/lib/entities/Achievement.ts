import type { ContentDef } from './types'
import type { SaveData } from '../core/saveSchema'

export interface AchievementContext {
  save: SaveData

  event: AchievementEvent

  clearedUntouched: boolean

  largestConjunction: number

  distinctPlatformsSlotted: number

  unlockedPlatforms: number

  zoneCompleted: boolean
}

export type AchievementEvent =
  | 'load'
  | 'stage-cleared'
  | 'stage-lost'
  | 'conjunction'
  | 'rewind'

export interface AchievementDef extends ContentDef {
  readonly trigger: (context: AchievementContext) => boolean
}
