import type { AchievementDef } from '../entities/Achievement'

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'signed-for-the-shift',
    name: 'Signed for the Shift',
    description: 'Clear the first stage.',
    trigger: (ctx) => ctx.save.meta.clearedStages.length >= 1,
  },
  {
    id: 'within-tolerance',
    name: 'Within Tolerance',
    description: 'Clear a stage without losing a point of Output.',
    trigger: (ctx) => ctx.event === 'stage-cleared' && ctx.clearedUntouched,
  },
  {
    id: 'noted-in-the-log',
    name: 'Noted in the Log',
    description: 'Arrange a conjunction.',
    trigger: (ctx) => ctx.save.statistics.conjunctionsFired >= 1,
  },
  {
    id: 'sat-down-for-it',
    name: 'Sat Down for It',
    description: 'Arrange a conjunction of three.',

    trigger: (ctx) => ctx.largestConjunction >= 3,
  },
  {
    id: 'documented-procedure',
    name: 'Documented Procedure',
    description: 'Clear a zone without ever mounting a Array.',

    trigger: (ctx) => ctx.zoneCompleted && !ctx.save.run.arraysEverMounted,
  },
  {
    id: 'the-undermaster-will-hear-of-this',
    name: 'The Undermaster Will Hear of This',
    description: 'Lose a stage with every unlocked Platform on the field.',

    trigger: (ctx) =>
      ctx.event === 'stage-lost' &&
      ctx.unlockedPlatforms > 0 &&
      ctx.distinctPlatformsSlotted >= ctx.unlockedPlatforms,
  },
  {
    id: 'wound-it-back',
    name: 'Wound It Back',
    description: 'Rewind for the first time.',
    trigger: (ctx) => ctx.save.meta.rewindCount >= 1,
  },
] as const

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

export function achievementById(id: string): AchievementDef | undefined {
  return BY_ID.get(id)
}
