import { ARRAYS } from './arrays'
import type { TutorialStepDef } from '../entities/Tutorial'

/**
 * The onboarding sequence.
 *
 * PLAN.md Phase 36 asks for formation, support units and the Almanac
 * "in sequence", by way of first-time popups rather than a forced tutorial.
 * Both halves are honoured by the same mechanism: **order in this array is the
 * sequence**, and `progression/tutorial.ts` shows at most one card per moment.
 * Nothing is scripted, nothing blocks, and a player who never reads one loses
 * only the explanation.
 *
 * Every step waits for the system it describes to become *relevant* rather than
 * firing on a timer. A card about Clearance before any has been earned is a
 * card about an abstraction; the same card at the moment the first Clearance
 * lands is a card about the number that just appeared in the HUD.
 *
 * ## Voice
 *
 * narrative.md's three rules, and rule 2 is the one that shapes these:
 * "technical vocabulary, plain meaning". The title may be log-room register;
 * the body always says plainly what the thing does and what to press. A
 * tutorial that is in character at the cost of being unclear has failed at the
 * only job it has.
 */

/** The cheapest way into the Array roster, so its step waits until it is reachable. */
const CHEAPEST_ARRAY = Math.min(...ARRAYS.map((array) => array.unlockCost))

export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  {
    id: 'standing-watch',
    name: 'Standing Watch',
    description:
      'The platforms fire on their own schedule and will keep firing whether ' +
      'you are here or not. Watch a wave before you touch anything — most of ' +
      'this job is arranging the machine, not working it.',
    key: null,
    // A save that has never cleared anything. Only ever seen once, on the first
    // load of a new game, which is the one moment "watch a wave" is advice.
    trigger: (ctx) => ctx.event === 'load' && ctx.save.meta.clearedStages.length === 0,
  },

  {
    id: 'the-flare',
    name: 'The Flare',
    description:
      'Click anywhere on the field to release a flare: instant damage in a ' +
      'small radius, three charges, one back every three seconds. It costs no ' +
      'Output and there is nothing to aim. Spending one badly costs you damage ' +
      'you did not deal, and nothing else.',
    key: null,
    trigger: (ctx) => ctx.event === 'stage-cleared',
  },

  {
    id: 'the-formation',
    name: 'The Formation',
    description:
      'Salvage buys the size of your formation. Press F, then drag a unit from ' +
      'the roster onto a ring slot. Moving a unit between slots is free and ' +
      'taking one off refunds in full — you are charged for how large a machine ' +
      'you run, never for rearranging it.',
    key: 'F',
    // Waits until the next slot is actually affordable. A card telling you to
    // spend Salvage you do not have is a card about being poor.
    trigger: (ctx) =>
      ctx.event === 'stage-cleared' && ctx.save.run.salvage >= ctx.nextSlotCost,
  },

  {
    id: 'conjunction',
    name: 'Conjunction',
    description:
      'Two platforms on different rings just came into line, and both fired ' +
      'their conjunction effect. The rings turn at different rates, so ' +
      'alignments arrive on their own — spreading units across rings is what ' +
      'makes them frequent. The formation panel counts down to the next one.',
    key: 'F',
    /*
     * Fires on its own moment, so it never competes with the stage-clear steps
     * for the one card a moment is allowed. Two participants is the minimum a
     * conjunction can have — combat-spec.md §3 calls it a Minor — and it is the
     * one a first formation will actually produce.
     */
    trigger: (ctx) => ctx.event === 'conjunction' && ctx.largestConjunction >= 2,
  },

  {
    id: 'clearance',
    name: 'Clearance',
    description:
      'Clearance is paid for clearing a stage you have never cleared, and for ' +
      'nothing else — it cannot be farmed and it does not accrue while you are ' +
      'away. It buys the roster itself: new units, and levels on the ones you ' +
      'have. Spend it in the formation panel.',
    key: 'F',
    trigger: (ctx) => ctx.event === 'stage-cleared' && ctx.save.meta.clearance >= 1,
  },

  {
    id: 'the-arrays',
    name: 'The Arrays',
    description:
      'Arrays mount on the static rim instead of a rotating ring. They reach ' +
      'the whole field and lead moving targets, they fire from a charge that ' +
      'refills rather than on a cooldown, and they never join a conjunction. ' +
      'They are support, not a second front line.',
    key: 'F',
    trigger: (ctx) =>
      ctx.event === 'stage-cleared' && ctx.save.meta.clearance >= CHEAPEST_ARRAY,
  },

  {
    id: 'the-ladder',
    name: 'The Ladder',
    description:
      'A second zone is open. Press M for the map: it shows every stage you ' +
      'can enter and what is still shut. Cleared ground stays cleared — you ' +
      'will never be asked to re-earn access you already have.',
    key: 'M',
    trigger: (ctx) => ctx.event === 'stage-cleared' && ctx.save.meta.unlockedZones.length >= 2,
  },

  {
    id: 'the-almanac',
    name: 'The Almanac',
    description:
      'The Almanac is open to you. Press T. Its nodes are bought with ' +
      'Recollection and are permanent — a Rewind never takes them back. ' +
      'Respec is free between runs, so nothing you buy here can be a mistake ' +
      'you have to live with.',
    key: 'T',
    trigger: (ctx) => ctx.event === 'stage-cleared' && ctx.treeRevealed,
  },

  {
    id: 'the-rewind',
    name: 'The Rewind',
    description:
      'You can Rewind. Press P. It ends the run and pays Recollection for the ' +
      'depth you reached: the formation and the Salvage go, the roster, the ' +
      'Almanac and every zone you have opened stay. When a stage starts taking ' +
      'much longer than the last one, that is the signal.',
    key: 'P',
    trigger: (ctx) =>
      (ctx.event === 'stage-cleared' || ctx.event === 'stage-lost') && ctx.rewindWorthwhile,
  },
]

export function tutorialStepById(id: string): TutorialStepDef | undefined {
  return TUTORIAL_STEPS.find((step) => step.id === id)
}

/** Every authored step id. The migration and the tests both want this. */
export const TUTORIAL_STEP_IDS: readonly string[] = TUTORIAL_STEPS.map((step) => step.id)
