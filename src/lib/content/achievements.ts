import type { AchievementDef } from '../entities/Achievement'

/**
 * Achievements.
 *
 * **The names are not invented here.** All seven are authored in
 * docs/design/narrative.md, "Achievement names", in the Manual's register — dry,
 * procedural, occasionally rueful. This file transcribes that table and attaches
 * a trigger to each; the copy is the design doc's, not this file's.
 *
 * Sized to the content that exists (PLAN.md Phase 28). Phase 36's polish pass
 * and Phase 33's zones are where more belong — an achievement for content
 * nobody can reach yet would be a permanently grey row.
 */

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
    description: 'Clear a stage without losing a point of Tension.',
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
    // Three *participants*, not three conjunctions — a Major, in the language
    // of combat-spec.md §3.
    trigger: (ctx) => ctx.largestConjunction >= 3,
  },
  {
    id: 'documented-procedure',
    name: 'Documented Procedure',
    description: 'Clear a zone without ever mounting a Chime.',
    /*
     * narrative.md words this as "using only Movements from the Manual's
     * roster". Read as: the front line alone, no support.
     *
     * Checked against the *run* rather than the zone, because a per-zone check
     * is gameable — a player could unmount before the final clear and collect
     * it anyway. Whole-run is stricter and simpler, and an achievement that
     * rewards a technicality is worse than one that asks for a little more.
     */
    trigger: (ctx) => ctx.zoneCompleted && !ctx.save.run.chimesEverMounted,
  },
  {
    id: 'the-undermaster-will-hear-of-this',
    name: 'The Undermaster Will Hear of This',
    description: 'Lose a stage with every unlocked Movement on the field.',
    /*
     * "A full roster slotted" read as *every Movement you own*, not every slot
     * on every ring. Thirty slots is unreachable for most of the game, and the
     * joke lands better when the player plainly had everything available and
     * still lost.
     */
    trigger: (ctx) =>
      ctx.event === 'stage-lost' &&
      ctx.unlockedMovements > 0 &&
      ctx.distinctMovementsSlotted >= ctx.unlockedMovements,
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
