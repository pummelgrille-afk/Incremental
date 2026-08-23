import { createSun } from '../entities/Sun'
import { isBossWave } from '../entities/Wave'
import { parseStageAddress, type StageAddress, type StageDef, type ZoneDef } from '../entities/Zone'
import { contactById } from '../content/contacts'
import { bossById } from '../content/bosses'
import { isBossStage } from '../systems/scaling'
import { zoneById } from '../content/zones'
import { createFlareState, createRingStates, type SimulationState } from './simulation'
import { CombatFeed } from '../systems/feed'
import { TracerFeed } from '../systems/tracers'
import { ParticleField } from '../systems/particles'
import { createTelemetry } from '../systems/telemetry'
import { noUpgradeEffects, type UpgradeEffects } from '../entities/Upgrade'
import { FLARE } from '../content/field'

export class StageLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StageLoadError'
  }
}

export interface StageLoadOptions {
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

export function validateStage(stage: StageDef): string[] {
  const problems: string[] = []

  if (stage.waves.length === 0) {
    problems.push(`Stage "${stage.id}" has no waves`)
  }

  if (isBossStage(stage.scalingIndex) && !stage.waves.some(isBossWave)) {
    problems.push(
      `Stage "${stage.id}" is on the boss interval (scaling index ` +
        `${stage.scalingIndex}) but has no boss wave`,
    )
  }

  stage.waves.forEach((wave, index) => {
    if (isBossWave(wave)) {
      if (!bossById(wave.bossId)) {
        problems.push(
          `Stage "${stage.id}" wave ${index} references unknown boss "${wave.bossId}"`,
        )
      }
      return
    }
    if (wave.groups.length === 0) {
      problems.push(`Stage "${stage.id}" wave ${index} has no spawn groups`)
    }
    for (const group of wave.groups) {
      if (!contactById(group.defId)) {
        problems.push(
          `Stage "${stage.id}" wave ${index} references unknown Contact "${group.defId}"`,
        )
      }
      if (group.count <= 0) {
        problems.push(`Stage "${stage.id}" wave ${index} spawns ${group.count} of "${group.defId}"`)
      }
    }
  })

  return problems
}

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
  const maxOutput = stage.baseOutput + effects.output

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

    sun: createSun(maxOutput),
    rings: createRingStates(),

    flare: createFlareState(FLARE.maxCharges + Math.floor(effects.flareCharges)),
    feed: new CombatFeed(),
    tracers: new TracerFeed(),
    particles: new ParticleField(),

    platforms: [],
    arrays: [],
    contact: [],
    boss: null,
    bossSpawnedFor: -1,
    projectiles: [],

    salvageEarned: 0,
    synergyAccumulator: 0,

    nextEntityId: 1,
  }
}

export function stageOrder(zones: readonly ZoneDef[]): StageAddress[] {
  return [...zones]
    .sort((a, b) => a.index - b.index)
    .flatMap((zone) => zone.stages.map((stage) => `${zone.id}:${stage.id}` as StageAddress))
}
