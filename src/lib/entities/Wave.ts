import type { ContentDef } from './types'

/**
 * Wave definitions — what spawns, how much, and when.
 *
 * Data lives in content/waves.ts. systems/spawn.ts reads these and never
 * hardcodes a spawn (CLAUDE.md, "Game content is data").
 */

/** One group within a wave. A wave is several of these, staggered. */
export interface SpawnGroup {
  /** SlackDef id from content/enemies.ts. */
  readonly defId: string
  readonly count: number

  /** Seconds after wave start before this group begins spawning. */
  readonly delay: number
  /** Seconds between individuals within the group. 0 spawns them together. */
  readonly interval: number

  /**
   * Arc of the rim to spawn across, in radians. Omitted means the full circle.
   * Concentrating a group on one arc is what makes a ring nudge meaningful.
   */
  readonly arc?: { centre: number; width: number }
}

export interface WaveDef {
  readonly groups: readonly SpawnGroup[]
  /**
   * Seconds to wait after the last Slack dies before the next wave.
   * The player's re-slotting window — see game-loop.md.
   */
  readonly gapAfter: number
}

/** A boss wave replaces the group list with a single scripted encounter. */
export interface BossWaveDef {
  /** BossDef id from content/bosses.ts. */
  readonly bossId: string
  readonly gapAfter: number
}

export type AnyWaveDef = WaveDef | BossWaveDef

export function isBossWave(wave: AnyWaveDef): wave is BossWaveDef {
  return 'bossId' in wave
}

/** Named wave templates, reused across stages with scaling applied. */
export interface WaveTemplate extends ContentDef {
  readonly wave: WaveDef
}
