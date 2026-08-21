import type { ContentDef } from './types'
import type { AnyWaveDef } from './Wave'

/**
 * Zone and stage structure — the progression map.
 *
 * Data lives in content/zones.ts and is populated in Phase 33. core/stageLoader.ts
 * reads these to initialize the simulation; there are no per-stage Svelte routes
 * (PLAN.md Phase 8).
 */

export interface StageDef {
  /** Unique within the zone. Save files reference `${zoneId}:${id}`. */
  readonly id: string
  readonly name: string

  /** Ordered. The stage clears when the last one is cleared. */
  readonly waves: readonly AnyWaveDef[]

  /**
   * Global difficulty index used by the scaling formulas in economy-spec.md §5.
   * Distinct from the stage's position in its zone — it keeps scaling continuous
   * across zone boundaries and past the authored content.
   */
  readonly scalingIndex: number

  /** Starting Output, before Bracing-branch bonuses. */
  readonly baseOutput: number

  /** Awarded on first clear only, so Clearance cannot be farmed (economy-spec.md §1). */
  readonly clearanceReward: number
}

export interface ZoneDef extends ContentDef {
  /** Display order and unlock chain position. */
  readonly index: number

  /** Epigraph from docs/design/narrative.md, shown on zone entry. */
  readonly epigraph: string
  readonly epigraphAttribution: string

  /** Multiplies enemy HP and damage for every stage in this zone. */
  readonly scalingMultiplier: number

  /** ContactDef ids that may appear here. Phase 31 populates. */
  readonly enemyPool: readonly string[]

  readonly stages: readonly StageDef[]

  /** Zone id that must be fully cleared first. Undefined for the first zone. */
  readonly requires?: string
}

/** Fully-qualified stage address, as stored in saves. */
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
