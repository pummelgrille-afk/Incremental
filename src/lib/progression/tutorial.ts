import { TUTORIAL_STEPS, tutorialStepById } from '../content/tutorial'
import type {
  TutorialContext,
  TutorialEvent,
  TutorialStepDef,
} from '../entities/Tutorial'
import type { SaveData } from '../core/saveSchema'

export interface TutorialSnapshot {
  nextSlotCost?: number
  largestConjunction?: number
  treeRevealed?: boolean
  rewindWorthwhile?: boolean
}

export function isSeen(save: SaveData, id: string): boolean {
  return save.meta.tutorialSeen.includes(id)
}

export function contextFor(
  save: SaveData,
  event: TutorialEvent,
  snapshot: TutorialSnapshot = {},
): TutorialContext {
  return {
    save,
    event,

    nextSlotCost: snapshot.nextSlotCost ?? Infinity,
    largestConjunction: snapshot.largestConjunction ?? 0,
    treeRevealed: snapshot.treeRevealed ?? false,
    rewindWorthwhile: snapshot.rewindWorthwhile ?? false,
  }
}

export function evaluate(
  save: SaveData,
  event: TutorialEvent,
  snapshot: TutorialSnapshot = {},
): TutorialStepDef | null {
  const context = contextFor(save, event, snapshot)

  for (const step of TUTORIAL_STEPS) {
    if (isSeen(save, step.id)) continue

    let due = false
    try {
      due = step.trigger(context)
    } catch {
      continue
    }
    if (!due) continue

    save.meta.tutorialSeen.push(step.id)
    return step
  }

  return null
}

export function skipTutorial(save: SaveData): void {
  for (const step of TUTORIAL_STEPS) {
    if (!isSeen(save, step.id)) save.meta.tutorialSeen.push(step.id)
  }
}

export function replayTutorial(save: SaveData): readonly TutorialStepDef[] {
  skipTutorial(save)
  return TUTORIAL_STEPS
}

export function tutorialProgress(save: SaveData): { seen: number; total: number } {
  return {
    seen: TUTORIAL_STEPS.filter((step) => isSeen(save, step.id)).length,
    total: TUTORIAL_STEPS.length,
  }
}

export { tutorialStepById }
