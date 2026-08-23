import { ARRAYS } from './arrays'
import type { TutorialStepDef } from '../entities/Tutorial'

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

export const TUTORIAL_STEP_IDS: readonly string[] = TUTORIAL_STEPS.map((step) => step.id)
