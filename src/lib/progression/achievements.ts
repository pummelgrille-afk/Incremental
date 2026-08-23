import { ACHIEVEMENTS, achievementById } from '../content/achievements'
import type {
  AchievementContext,
  AchievementDef,
  AchievementEvent,
} from '../entities/Achievement'
import type { SaveData } from '../core/saveSchema'

export interface AchievementSnapshot {
  clearedUntouched?: boolean
  largestConjunction?: number
  distinctPlatformsSlotted?: number
  unlockedPlatforms?: number
  zoneCompleted?: boolean
}

export function isEarned(save: SaveData, id: string): boolean {
  return save.meta.achievements.includes(id)
}

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
    distinctPlatformsSlotted: snapshot.distinctPlatformsSlotted ?? 0,
    unlockedPlatforms: snapshot.unlockedPlatforms ?? 0,
    zoneCompleted: snapshot.zoneCompleted ?? false,
  }
}

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

export function achievementList(save: SaveData): AchievementView[] {
  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    earned: isEarned(save, a.id),
  }))
}

export function earnedCount(save: SaveData): number {
  return ACHIEVEMENTS.filter((a) => isEarned(save, a.id)).length
}

export { achievementById }
