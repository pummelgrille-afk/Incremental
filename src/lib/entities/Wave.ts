import type { ContentDef } from './types'

export interface SpawnGroup {
  readonly defId: string
  readonly count: number

  readonly delay: number

  readonly interval: number

  readonly arc?: { centre: number; width: number }
}

export interface WaveDef {
  readonly groups: readonly SpawnGroup[]

  readonly gapAfter: number
}

export interface BossWaveDef {
  readonly bossId: string
  readonly gapAfter: number
}

export type AnyWaveDef = WaveDef | BossWaveDef

export function isBossWave(wave: AnyWaveDef): wave is BossWaveDef {
  return 'bossId' in wave
}

export interface WaveTemplate extends ContentDef {
  readonly wave: WaveDef
}
