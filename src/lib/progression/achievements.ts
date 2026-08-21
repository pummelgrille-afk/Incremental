import { ACHIEVEMENTS, achievementById } from '../content/achievements'
import type {
  AchievementContext,
  AchievementDef,
  AchievementEvent,
} from '../entities/Achievement'
import type { SaveData } from '../core/saveSchema'

/**
 * Awarding achievements.
 *
 * Evaluated on **moments, not frames**: a stage clearing, a stage being lost, a
 * conjunction firing, a Rewind, and once on load. Running seven predicates
 * sixty times a second to answer questions that change a handful of times per
 * run would be waste, and the event is what several of the triggers are
 * actually about.
 *
 * Like the rest of `progression/`, pure functions over the save. The one
 * mutation is `award`, and it is idempotent.
 */

export interface AchievementSnapshot {
  clearedUntouched?: boolean
  largestConjunction?: number
  distinctMovementsSlotted?: number
  unlockedMovements?: number
  zoneCompleted?: boolean
}

export function isEarned(save: SaveData, id: string): boolean {
  return save.meta.achievements.includes(id)
}

/**
 * Build the context a trigger sees.
 *
 * Defaults everything the caller did not supply, so a caller reporting a Rewind
 * need not invent a conjunction size — and a trigger reading a field the moment
 * did not produce sees a falsy value rather than stale data from an earlier one.
 */
export function contextFor(
  save: SaveData,
  event: AchievementEvent,
  snapshot: AchievementSnapshot = {},
): AchievementContext {
  return {
    save,
    event,
    clearedUntouched: snapshot.clearedUntouched ?? false,
    largestConjunction: snapshot.largestConjunction ?? 0,
    distinctMovementsSlotted: snapshot.distinctMovementsSlotted ?? 0,
    unlockedMovements: snapshot.unlockedMovements ?? 0,
    zoneCompleted: snapshot.zoneCompleted ?? false,
  }
}

/**
 * Evaluate every achievement and award any newly earned.
 *
 * Returns only what was *newly* awarded, so a caller can announce it. Already
 * earned achievements never re-fire, whatever their trigger says — which is
 * what makes it safe to call this on every stage clear forever.
 *
 * A trigger that throws is treated as not-yet-earned rather than crashing the
 * run: content is data, and one bad predicate must not take a session with it.
 */
export function evaluate(
  save: SaveData,
  event: AchievementEvent,
  snapshot: AchievementSnapshot = {},
): AchievementDef[] {
  const context = contextFor(save, event, snapshot)
  const awarded: AchievementDef[] = []

  for (const achievement of ACHIEVEMENTS) {
    if (isEarned(save, achievement.id)) continue

    let earned = false
    try {
      earned = achievement.trigger(context)
    } catch {
      continue
    }
    if (!earned) continue

    save.meta.achievements.push(achievement.id)
    awarded.push(achievement)
  }

  return awarded
}

export interface AchievementView {
  id: string
  name: string
  description: string
  earned: boolean
}

/** Every achievement with its state, for a listing. */
export function achievementList(save: SaveData): AchievementView[] {
  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    earned: isEarned(save, a.id),
  }))
}

export function earnedCount(save: SaveData): number {
  // Counted against content rather than by array length: a save carrying an id
  // that no longer exists must not report more earned than there are.
  return ACHIEVEMENTS.filter((a) => isEarned(save, a.id)).length
}

export { achievementById }
