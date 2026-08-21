import { createMainspring } from '../entities/Mainspring'
import { isBossWave } from '../entities/Wave'
import { parseStageAddress, type StageAddress, type StageDef, type ZoneDef } from '../entities/Zone'
import { slackById } from '../content/enemies'
import { isBossStage } from '../systems/scaling'
import { zoneById } from '../content/zones'
import { createBeatState, createRingStates, type SimulationState } from './simulation'
import { CombatFeed } from '../systems/feed'
import { createTelemetry } from '../systems/telemetry'
import { noUpgradeEffects, type UpgradeEffects } from '../entities/Upgrade'
import { BEAT } from '../content/field'

/**
 * Reads a zone/stage definition from content and initializes the simulation.
 *
 * This is the scene-loading architecture PLAN.md Phase 8 asks for: stages are
 * *data loaded into one simulation*, not per-stage Svelte routes. Changing
 * stage never remounts the UI or rebuilds the Pixi scene — it swaps the state
 * the systems read.
 */

export class StageLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StageLoadError'
  }
}

export interface StageLoadOptions {
  /**
   * The Escapement Tree's aggregate for this run.
   *
   * Superseded `bonusTension`, which was a single hand-placed hook for the
   * Bracing branch; the tree now supplies every bonus through one object.
   */
  effects?: UpgradeEffects
}

export function resolveStage(address: StageAddress): { zone: ZoneDef; stage: StageDef } {
  const { zoneId, stageId } = parseStageAddress(address)

  const zone = zoneById(zoneId)
  if (!zone) throw new StageLoadError(`Unknown zone: "${zoneId}"`)

  const stage = zone.stages.find((s) => s.id === stageId)
  if (!stage) throw new StageLoadError(`Unknown stage "${stageId}" in zone "${zoneId}"`)

  return { zone, stage }
}

/**
 * Validate that every content id a stage references actually resolves.
 *
 * Called on load rather than on spawn, so a typo in content/waves.ts surfaces
 * immediately instead of thirty seconds into a wave. Phase 45 runs this across
 * every stage as a test.
 */
export function validateStage(stage: StageDef): string[] {
  const problems: string[] = []

  if (stage.waves.length === 0) {
    problems.push(`Stage "${stage.id}" has no waves`)
  }

  /*
   * Boss milestones — economy-spec.md §5, every 8th stage.
   *
   * Checked here rather than left as an unwired constant. Zone 1 stops at
   * scaling index 3 so nothing trips it today, but the moment Phase 33 authors
   * a stage on the interval without a boss, the content tests fail and say so.
   * Phase 32 owns the encounters themselves.
   */
  if (isBossStage(stage.scalingIndex) && !stage.waves.some(isBossWave)) {
    problems.push(
      `Stage "${stage.id}" is on the boss interval (scaling index ` +
        `${stage.scalingIndex}) but has no boss wave`,
    )
  }

  stage.waves.forEach((wave, index) => {
    if (isBossWave(wave)) {
      // Phase 32 adds content/bosses.ts; until then boss ids cannot be checked.
      return
    }
    if (wave.groups.length === 0) {
      problems.push(`Stage "${stage.id}" wave ${index} has no spawn groups`)
    }
    for (const group of wave.groups) {
      if (!slackById(group.defId)) {
        problems.push(
          `Stage "${stage.id}" wave ${index} references unknown Slack "${group.defId}"`,
        )
      }
      if (group.count <= 0) {
        problems.push(`Stage "${stage.id}" wave ${index} spawns ${group.count} of "${group.defId}"`)
      }
    }
  })

  return problems
}

/**
 * Build a fresh SimulationState for a stage.
 *
 * Entities are not populated here: the player's formation is applied by
 * progression/, and Slack are spawned over time by systems/spawn.ts. What comes
 * back is an empty field with the Mainspring wound and the rings turning.
 */
export function loadStage(
  address: StageAddress,
  options: StageLoadOptions = {},
): SimulationState {
  const { zone, stage } = resolveStage(address)

  const problems = validateStage(stage)
  if (problems.length > 0) {
    throw new StageLoadError(
      `Stage "${address}" failed validation:\n  ${problems.join('\n  ')}`,
    )
  }

  const effects = options.effects ?? noUpgradeEffects()
  const maxTension = stage.baseTension + effects.tension

  return {
    zone,
    stage,

    phase: 'wave-active',
    elapsed: 0,

    waveIndex: 0,
    waveElapsed: 0,
    waveArcOffset: 0,
    formationVersion: 0,
    activeWave: null,
    telemetry: createTelemetry(),
    effects,
    gapRemaining: 0,

    mainspring: createMainspring(maxTension),
    rings: createRingStates(),
    // Regulation grants whole extra charges, so it changes the maximum the
    // Beat regenerates toward, not just the starting value.
    beat: createBeatState(BEAT.maxCharges + Math.floor(effects.beatCharges)),
    feed: new CombatFeed(),

    movements: [],
    chimes: [],
    slack: [],
    projectiles: [],

    filingsEarned: 0,
    synergyAccumulator: 0,

    nextEntityId: 1,
  }
}

/** Stages in play order across every zone, respecting unlock chains. */
export function stageOrder(zones: readonly ZoneDef[]): StageAddress[] {
  return [...zones]
    .sort((a, b) => a.index - b.index)
    .flatMap((zone) => zone.stages.map((stage) => `${zone.id}:${stage.id}` as StageAddress))
}
