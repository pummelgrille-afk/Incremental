import { TUTORIAL_STEPS, tutorialStepById } from '../content/tutorial'
import type {
  TutorialContext,
  TutorialEvent,
  TutorialStepDef,
} from '../entities/Tutorial'
import type { SaveData } from '../core/saveSchema'

/**
 * The onboarding sequence's rules.
 *
 * Pure functions over the save, like the rest of `progression/`. The one
 * mutation is the `seen` mark inside `evaluate`, and it is idempotent.
 *
 * Evaluated on **moments, not frames** — the same four the achievements module
 * uses, and for the same reason. Whether a second zone is open changes a
 * handful of times per run.
 */

export interface TutorialSnapshot {
  nextSlotCost?: number
  largestConjunction?: number
  treeRevealed?: boolean
  rewindWorthwhile?: boolean
}

export function isSeen(save: SaveData, id: string): boolean {
  return save.meta.tutorialSeen.includes(id)
}

/**
 * Build the context a trigger sees.
 *
 * Everything the caller did not supply defaults to a value that means "no",
 * so a caller reporting a conjunction need not invent a slot price — and a
 * trigger reading a field this moment did not produce sees a falsy value
 * rather than stale data from an earlier one.
 */
export function contextFor(
  save: SaveData,
  event: TutorialEvent,
  snapshot: TutorialSnapshot = {},
): TutorialContext {
  return {
    save,
    event,
    // Infinity rather than 0: an unsupplied price must never read as "you can
    // afford it", which is the direction that shows a card too early.
    nextSlotCost: snapshot.nextSlotCost ?? Infinity,
    largestConjunction: snapshot.largestConjunction ?? 0,
    treeRevealed: snapshot.treeRevealed ?? false,
    rewindWorthwhile: snapshot.rewindWorthwhile ?? false,
  }
}

/**
 * Find the next step to show, and mark it seen.
 *
 * **At most one per moment**, taken in authored order — which is what makes
 * `content/tutorial.ts` a sequence rather than a set. A stage clear can satisfy
 * three triggers at once late in a first run; showing three cards at once
 * would be the forced tutorial PLAN.md Phase 36 rules out, and would teach
 * three systems in the moment the player learns none of them. The rest keep,
 * and arrive at the next clear.
 *
 * Returns null when nothing is due. A trigger that throws is treated as not
 * due rather than crashing the run: content is data, and one bad predicate
 * must not take a session with it.
 */
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

/**
 * Mark every step seen without showing any.
 *
 * The opt-out. Two callers want it: a player who turns onboarding off, and the
 * schema 6 → 7 migration, which must not greet a save with forty stages
 * cleared as though it had just started. The migration carries its own literal
 * list rather than calling this — it runs on raw JSON, before validation, and
 * may not reach into content.
 */
export function skipTutorial(save: SaveData): void {
  for (const step of TUTORIAL_STEPS) {
    if (!isSeen(save, step.id)) save.meta.tutorialSeen.push(step.id)
  }
}

/**
 * Hand back the whole sequence, to be read on demand.
 *
 * Not a re-run of the triggers, and that distinction is the whole design. A
 * player asking to see this has already passed most of the moments — a replay
 * that waited for them again would show one card and then nothing for an hour,
 * which is indistinguishable from broken.
 *
 * So it queues every step in authored order and marks them all seen. The
 * sequence reads as what its header always claimed to be: the Manual, front to
 * back, rather than nine things that happen to you.
 *
 * Marking them seen matters for the case this exists for — a save the schema
 * 6 → 7 migration opted out of. Those steps are already marked, and re-clearing
 * them would arm nine triggers that then fire one at a time over the next hour
 * of play, long after the player asked to read them.
 */
export function replayTutorial(save: SaveData): readonly TutorialStepDef[] {
  skipTutorial(save)
  return TUTORIAL_STEPS
}

/** How far through onboarding a save is, for a settings screen to report. */
export function tutorialProgress(save: SaveData): { seen: number; total: number } {
  // Counted against content rather than by array length, so a save carrying an
  // id that no longer exists cannot report more seen than there are.
  return {
    seen: TUTORIAL_STEPS.filter((step) => isSeen(save, step.id)).length,
    total: TUTORIAL_STEPS.length,
  }
}

export { tutorialStepById }
