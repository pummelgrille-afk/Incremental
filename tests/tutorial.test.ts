import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave, type SaveData } from '../src/lib/core/saveSchema'
import { TUTORIAL_STEPS, TUTORIAL_STEP_IDS } from '../src/lib/content/tutorial'
import {
  evaluate,
  isSeen,
  replayTutorial,
  skipTutorial,
  tutorialProgress,
} from '../src/lib/progression/tutorial'
import { grantStartingLoadout, nextSlotCost } from '../src/lib/progression/loadout'
import { isRewindUnlocked, rewindPreview } from '../src/lib/progression/prestige'
import { isTreeRevealed } from '../src/lib/progression/upgradeTree'
import { playRun } from './support/playthrough'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { applyFormation } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { levelsOf } from '../src/lib/progression/roster'
import type { StageAddress } from '../src/lib/entities/Zone'

let save: SaveData

beforeEach(() => {
  save = createDefaultSave(0)
  grantStartingLoadout(save)
})

describe('the onboarding content', () => {
  it('has a unique id and real copy for every step', () => {
    expect(new Set(TUTORIAL_STEP_IDS).size).toBe(TUTORIAL_STEPS.length)

    for (const step of TUTORIAL_STEPS) {
      expect(step.name.length, step.id).toBeGreaterThan(0)
      // Long enough to actually say what the thing does. narrative.md rule 2:
      // technical vocabulary, plain meaning — a four-word card is flavour.
      expect(step.description.length, step.id).toBeGreaterThan(80)
    }
  })

  it('names a key that exists, or none', () => {
    // The card renders this as a keycap, and bootstrap binds exactly these.
    const bound = new Set(['F', 'M', 'T', 'P'])
    for (const step of TUTORIAL_STEPS) {
      if (step.key === null) continue
      expect(bound.has(step.key), `${step.id} → ${step.key}`).toBe(true)
    }
  })
})

describe('raising a card', () => {
  it('greets a new save and never greets it twice', () => {
    const first = evaluate(save, 'load')
    expect(first?.id).toBe('standing-watch')

    expect(evaluate(save, 'load')).toBeNull()
    expect(isSeen(save, 'standing-watch')).toBe(true)
  })

  it('says nothing on load to a save that has already cleared something', () => {
    save.meta.clearedStages.push('service-floor:first-shift' as StageAddress)
    expect(evaluate(save, 'load')).toBeNull()
  })

  it('shows at most one card per moment', () => {
    /*
     * The pacing rule, and the reason `content/tutorial.ts` is an array rather
     * than a set. Late in a first run a single clear can satisfy four triggers
     * at once; four cards at once is the forced tutorial Phase 36 rules out,
     * and teaches none of the four.
     */
    save.meta.clearance = 99
    save.run.salvage = 1e6
    save.meta.unlockedZones.push('fast-orbit')

    const first = evaluate(save, 'stage-cleared', { nextSlotCost: nextSlotCost(save) })
    expect(first).not.toBeNull()

    const second = evaluate(save, 'stage-cleared', { nextSlotCost: nextSlotCost(save) })
    expect(second).not.toBeNull()
    expect(second!.id).not.toBe(first!.id)
  })

  it('hands them out in the authored order', () => {
    save.meta.clearance = 99
    save.run.salvage = 1e6

    const raised: string[] = []
    for (let i = 0; i < 4; i++) {
      const step = evaluate(save, 'stage-cleared', { nextSlotCost: nextSlotCost(save) })
      if (step) raised.push(step.id)
    }

    const authored = TUTORIAL_STEP_IDS.filter((id) => raised.includes(id))
    expect(raised).toEqual(authored)
  })

  it('waits for a slot to be affordable before explaining the formation', () => {
    // A card telling you to spend Salvage you do not have is a card about
    // being poor.
    save.run.salvage = 0
    save.meta.tutorialSeen.push('the-flare')

    expect(evaluate(save, 'stage-cleared', { nextSlotCost: 999 })?.id).not.toBe(
      'the-formation',
    )

    save.run.salvage = 999
    expect(evaluate(save, 'stage-cleared', { nextSlotCost: 999 })?.id).toBe('the-formation')
  })

  it('defaults an unsupplied gate to closed', () => {
    // A caller reporting a conjunction supplies no slot price. Reading that as
    // "affordable" would fire the formation card at the wrong moment.
    save.meta.tutorialSeen.push('standing-watch', 'the-flare')
    save.run.salvage = 1e6

    expect(evaluate(save, 'stage-cleared')?.id).not.toBe('the-formation')
  })

  it('explains a conjunction on the tick one fires', () => {
    save.meta.tutorialSeen.push('standing-watch', 'the-flare', 'the-formation')

    expect(evaluate(save, 'conjunction', { largestConjunction: 1 })).toBeNull()
    expect(evaluate(save, 'conjunction', { largestConjunction: 2 })?.id).toBe('conjunction')
  })

  it('offers the Rewind on a loss as well as on a clear', () => {
    // The stall that ends a run is exactly when a player wants to hear about
    // prestige — game-loop.md, "the stall is the signal".
    skipTutorial(save)
    save.meta.tutorialSeen = save.meta.tutorialSeen.filter((id) => id !== 'the-rewind')

    expect(evaluate(save, 'stage-lost', { rewindWorthwhile: true })?.id).toBe('the-rewind')
  })
})

describe('reading the Manual on demand', () => {
  it('hands back every card, in authored order', () => {
    const steps = replayTutorial(save)
    expect(steps.map((s) => s.id)).toEqual([...TUTORIAL_STEP_IDS])
  })

  it('works for a save that has already been through the sequence', () => {
    // The case it exists for: a save the schema 6 → 7 migration opted out of,
    // or simply one that has read them all. Both are "everything seen".
    skipTutorial(save)
    expect(replayTutorial(save)).toHaveLength(TUTORIAL_STEPS.length)
  })

  it('leaves every step marked seen, so nothing re-fires later', () => {
    /*
     * Re-arming the triggers instead would drip the same nine cards out over
     * the next hour of play, long after the player asked to read them.
     */
    replayTutorial(save)

    expect(tutorialProgress(save).seen).toBe(TUTORIAL_STEPS.length)
    expect(evaluate(save, 'stage-cleared', { nextSlotCost: 0 })).toBeNull()
    expect(evaluate(save, 'conjunction', { largestConjunction: 4 })).toBeNull()
  })
})

describe('opting out', () => {
  it('marks everything seen', () => {
    skipTutorial(save)

    expect(tutorialProgress(save)).toEqual({
      seen: TUTORIAL_STEPS.length,
      total: TUTORIAL_STEPS.length,
    })
    expect(evaluate(save, 'load')).toBeNull()
  })

  it('does not double-mark on a second call', () => {
    skipTutorial(save)
    skipTutorial(save)

    expect(save.meta.tutorialSeen).toHaveLength(TUTORIAL_STEPS.length)
  })

  it('counts against content, not against the array', () => {
    save.meta.tutorialSeen.push('a-step-from-a-build-that-no-longer-exists')
    expect(tutorialProgress(save).seen).toBe(0)
  })
})

/*
 * The pacing, traced through a real first run.
 *
 * PLAN.md Phase 36 asks for playtesting with new users, which is not something
 * this can substitute for and is not claimed to be. What it *can* answer is the
 * half a playtest would find first and that no unit test touches: across an
 * actual opening run — the real economy, the real waves, the real clear times —
 * do the cards arrive spread out and in order, or do they all pile onto the
 * first two clears?
 *
 * The harness plays the deliberately poor player Phase 35 built (cheapest
 * useful thing, always), so this is a floor: a real player reaches these
 * moments sooner, never later.
 */
describe('a first run, traced', () => {
  interface Raised {
    id: string
    stage: number
  }

  function traceFirstRun(): Raised[] {
    const fresh = createDefaultSave(0)
    grantStartingLoadout(fresh)

    const raised: Raised[] = []
    let stage = 0

    const pump = (event: 'stage-cleared' | 'stage-lost' | 'load') => {
      // Drain, because a moment raises at most one card — the player sees the
      // rest at the following moments, and the trace should show that.
      const step = evaluate(fresh, event, {
        nextSlotCost: nextSlotCost(fresh),
        treeRevealed: isTreeRevealed(fresh),
        rewindWorthwhile: isRewindUnlocked(fresh) && rewindPreview(fresh).award > 0,
      })
      if (step) raised.push({ id: step.id, stage })
    }

    pump('load')

    playRun(fresh, 1, {
      onStageResolved: (_save, result) => {
        stage = result.scalingIndex
        pump(result.cleared ? 'stage-cleared' : 'stage-lost')
      },
    })

    return raised
  }

  it('opens with the watch, before anything has been cleared', () => {
    const raised = traceFirstRun()
    expect(raised[0]).toEqual({ id: 'standing-watch', stage: 0 })
  })

  it('never raises two cards at the same stage', () => {
    const raised = traceFirstRun()
    const stages = raised.map((r) => r.stage)
    expect(new Set(stages).size).toBe(stages.length)
  })

  it('keeps them in the authored order', () => {
    const raised = traceFirstRun().map((r) => r.id)
    const authored = TUTORIAL_STEP_IDS.filter((id) => raised.includes(id))
    expect(raised).toEqual(authored)
  })

  it('teaches the three systems Phase 36 names, within the first run', () => {
    // Formation, support units and the Almanac — PLAN.md Phase 36. The first
    // two must land in the opening run or the panel they are about goes
    // unexplained for the whole of it.
    const raised = traceFirstRun().map((r) => r.id)

    expect(raised).toContain('the-formation')
    expect(raised).toContain('the-arrays')
  })

  it('reaches a conjunction with the formation the game hands out', () => {
    /*
     * The conjunction card fires on its own moment, so the stage trace above
     * cannot see it. What matters is that the moment is reachable *at all* with
     * the opening four Platforms — a card whose trigger the starting loadout
     * cannot produce is dead content, and the opening grant is two-and-two
     * across different rings precisely so alignments happen (loadout.ts).
     */
    const fresh = createDefaultSave(0)
    grantStartingLoadout(fresh)

    const sim = new Simulation(loadStage('service-floor:first-shift'), createRng(1))
    applyFormation(sim.state, fresh.run.formation, platformById, levelsOf(fresh, 'platform'))

    let largest = 0
    for (let t = 0; t < 120 / TICK_SECONDS; t++) {
      largest = Math.max(largest, sim.tick(TICK_SECONDS).largestConjunction)
      if (sim.state.phase === 'cleared' || sim.state.phase === 'overwhelmed') break
    }

    expect(largest).toBeGreaterThanOrEqual(2)
  })

  it('spreads the opening cards out rather than front-loading them', () => {
    // Everything at stage 1 would be a wall of text at the worst moment.
    const raised = traceFirstRun()
    const onFirstStage = raised.filter((r) => r.stage <= 1)
    expect(onFirstStage.length).toBeLessThanOrEqual(2)
  })
})
