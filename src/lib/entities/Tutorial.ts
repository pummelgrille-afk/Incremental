import type { ContentDef } from './types'
import type { SaveData } from '../core/saveSchema'

export type TutorialEvent = 'load' | 'stage-cleared' | 'stage-lost' | 'conjunction'

export interface TutorialContext {
  save: SaveData
  event: TutorialEvent

  nextSlotCost: number

  largestConjunction: number

  treeRevealed: boolean

  rewindWorthwhile: boolean
}

export interface TutorialStepDef extends ContentDef {
  readonly key: string | null

  readonly trigger: (context: TutorialContext) => boolean
}
