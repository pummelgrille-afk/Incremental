import type { ContentDef } from './types'
import type { SaveData } from '../core/saveSchema'

/**
 * A tutorial step.
 *
 * PLAN.md Phase 36 asks for "contextual tooltips/first-time popups rather than
 * a forced tutorial", and economy-spec.md §3 already sets the pace: a
 * first-time player should meet **one progression system at a time**. So a step
 * is not a scripted beat with a next button. It is a card that appears the
 * first time a system it describes becomes relevant, and never again.
 *
 * Modelled on `Achievement.ts` deliberately — same shape, same evaluation
 * moments, same idempotence. The difference is that an achievement fires on
 * something the player *did* and a tutorial step fires on something that has
 * become *possible*.
 */

/**
 * What prompted an evaluation.
 *
 * The same moments `progression/achievements.ts` evaluates on, for the same
 * reason: these questions change a handful of times per run, and running eight
 * predicates sixty times a second to answer them would be waste.
 */
export type TutorialEvent = 'load' | 'stage-cleared' | 'stage-lost' | 'conjunction'

/**
 * What a trigger gets to look at.
 *
 * A mix of the save and a snapshot of the moment, like `AchievementContext`.
 * Several conditions are state ("a second zone is open") and one is an event
 * ("a conjunction of three just fired"); a trigger that could only see the save
 * could not express the second kind.
 */
export interface TutorialContext {
  save: SaveData
  event: TutorialEvent

  /** What the next Platform slot would cost, so a step can wait until it is affordable. */
  nextSlotCost: number
  /** Participants in the largest conjunction this tick. */
  largestConjunction: number
  /** The Almanac is visible — economy-spec.md §3 gates this on a first boss clear. */
  treeRevealed: boolean
  /** A Rewind is available *and* would pay something. */
  rewindWorthwhile: boolean
}

export interface TutorialStepDef extends ContentDef {
  /**
   * The key that opens what this step is about, if any.
   *
   * Rendered as a keycap in the card. Null for a step that is not about a
   * panel — the opening one is about doing nothing at all.
   */
  readonly key: string | null

  /**
   * True when this step should be shown now.
   *
   * Must be **pure and side-effect free**: it is asked on several moments per
   * run, and its answer may not depend on how many times it has been asked.
   */
  readonly trigger: (context: TutorialContext) => boolean
}
