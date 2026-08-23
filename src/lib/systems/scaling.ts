import type { AnyWaveDef, SpawnGroup, WaveDef } from '../entities/Wave'
import { isBossWave } from '../entities/Wave'
import { contactById } from '../content/contacts'
import { OVER_LEVEL, SCALING } from '../content/scaling'
import type { SimulationState } from '../core/simulation'

export function scaleHp(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return base * SCALING.enemyHpGrowth ** scalingIndex * zoneMultiplier
}

export function scaleDamage(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return base * SCALING.enemyDamageGrowth ** scalingIndex * zoneMultiplier
}

export function scaledCount(base: number, scalingIndex: number): number {
  return base + Math.floor(scalingIndex / SCALING.enemyCountStageDivisor)
}

export function isBossStage(scalingIndex: number): boolean {
  return scalingIndex > 0 && scalingIndex % SCALING.bossInterval === 0
}

export function stagesToNextBoss(scalingIndex: number): number {
  if (isBossStage(scalingIndex)) return 0
  const next = Math.ceil((scalingIndex + 1) / SCALING.bossInterval) * SCALING.bossInterval
  return next - scalingIndex
}

export function bossHp(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return scaleHp(base, scalingIndex, zoneMultiplier) * SCALING.bossHpMultiplier
}

export function bossDamage(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return scaleDamage(base, scalingIndex, zoneMultiplier) * SCALING.bossDamageMultiplier
}

export function formationPower(sim: SimulationState): number {
  let power = 0

  for (const platform of sim.platforms) {
    if (platform.disabledFor > 0) continue
    const attack =
      platform.def.attack * platform.levelScale * (1 + platform.bonuses.attack)
    power += attack / platform.def.baseInterval
  }

  for (const array of sim.arrays) {
    if (array.disabledFor > 0) continue
    const attack = array.def.attack * array.levelScale * array.attackScale

    power += attack / array.chargeInterval
  }

  return power
}

export function waveHpRate(sim: SimulationState, wave: AnyWaveDef): number {
  if (isBossWave(wave)) return 0

  let totalHp = 0
  let duration = 0

  for (const group of wave.groups) {
    const def = contactById(group.defId)
    if (!def) continue

    const count = scaledCount(group.count, sim.stage.scalingIndex)
    totalHp += count * scaleHp(def.maxHp, sim.stage.scalingIndex, sim.zone.scalingMultiplier)
    duration = Math.max(duration, group.delay + group.interval * Math.max(0, count - 1))
  }

  return totalHp / Math.max(1, duration)
}

export function pressure(sim: SimulationState, wave: AnyWaveDef): number {
  const rate = waveHpRate(sim, wave)
  return rate <= 0 ? 0 : formationPower(sim) / rate
}

export function overLevelBonus(sim: SimulationState, wave: AnyWaveDef): number {
  const excess = pressure(sim, wave) - OVER_LEVEL.threshold
  if (excess <= 0) return 0
  return Math.min(OVER_LEVEL.maxCountBonus, excess * OVER_LEVEL.countPerPressure)
}

export function directWave(sim: SimulationState, wave: AnyWaveDef): AnyWaveDef {
  if (isBossWave(wave)) return wave

  const bonus = overLevelBonus(sim, wave)

  const groups: SpawnGroup[] = wave.groups.map((group) => {
    const base = scaledCount(group.count, sim.stage.scalingIndex)

    const def = contactById(group.defId)
    const scalable = def === undefined || def.tier === 'basic'
    const count = scalable ? Math.round(base * (1 + bonus)) : base

    const duration = group.interval * Math.max(0, group.count - 1)
    const interval = count > 1 ? duration / (count - 1) : group.interval

    return { ...group, count, interval }
  })

  const directed: WaveDef = { ...wave, groups }
  return directed
}
