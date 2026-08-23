import type { ContentDef } from './types'
import type { AnyWaveDef } from './Wave'

export interface StageDef {
  readonly id: string
  readonly name: string

  readonly waves: readonly AnyWaveDef[]

  readonly scalingIndex: number

  readonly baseOutput: number

  readonly clearanceReward: number
}

export interface ZoneDef extends ContentDef {
  readonly index: number

  readonly epigraph: string
  readonly epigraphAttribution: string

  readonly scalingMultiplier: number

  readonly enemyPool: readonly string[]

  readonly stages: readonly StageDef[]

  readonly requires?: string
}

export type StageAddress = `${string}:${string}`

export function stageAddress(zoneId: string, stageId: string): StageAddress {
  return `${zoneId}:${stageId}`
}

export function parseStageAddress(address: StageAddress): {
  zoneId: string
  stageId: string
} {
  const separator = address.indexOf(':')
  return {
    zoneId: address.slice(0, separator),
    stageId: address.slice(separator + 1),
  }
}
