import type { ContentDef } from './types'
import type { SaveData } from '../core/saveSchema'

/**
 * An achievement.
 *
 * Names and copy are authored in docs/design/narrative.md; `content/
 * achievements.ts` transcribes them and attaches a trigger.
 *
 * **Tracked locally in the save file.** There is no native achievement API on
 * the web (PLAN.md Phase 28), and store-specific hooks belong to Phase 47 if a
 * storefront wrapper ever happens. Nothing here reaches outside the save.
 */

/**
 * What a trigger gets to look at.
 *
 * Deliberately a mix of the save and a snapshot of the moment: some conditions
 * are state ("has cleared a stage") and some are events ("a conjunction of
 * three just fired"), and a trigger that could only see the save would be
 * unable to express the second kind without something recording it first.
 */
export interface AchievementContext {
  save: SaveData

  /** What prompted this evaluation. */
  event: AchievementEvent

  /** The stage just cleared cost no Output at all. */
  clearedUntouched: boolean
  /** Participants in the largest conjunction this tick. */
  largestConjunction: number
  /** How many *different* Platform types are on the field. */
  distinctPlatformsSlotted: number
  /** How many Platform types the player owns. */
  unlockedPlatforms: number
  /** This clear finished every stage in its zone. */
  zoneCompleted: boolean
}

export type AchievementEvent =
  | 'load'
  | 'stage-cleared'
  | 'stage-lost'
  | 'conjunction'
  | 'rewind'

export interface AchievementDef extends ContentDef {
  /**
   * True when it should be awarded.
   *
   * Must be **pure and side-effect free** — it is called on several events per
   * run and its answer is not allowed to depend on how many times it has been
   * asked.
   */
  readonly trigger: (context: AchievementContext) => boolean
}
