import { OFFLINE } from '../content/economy'
import { noUpgradeEffects, type UpgradeEffects } from '../entities/Upgrade'

/**
 * Offline progress — economy-spec.md §4.
 *
 * ```
 * effective = min(elapsed, cap)
 * rate      = filingsPerSecond × efficiency
 * filings   = effective × rate × diminishing(effective)
 * ```
 *
 * **It never reaches parity with active play**, and three separate things
 * guarantee that rather than one:
 *
 *   1. Efficiency is a fraction, capped below 1 forever.
 *   2. The diminishing curve halves the marginal rate every four hours.
 *   3. Only Filings accrue — no conjunctions fire and no stage progress
 *      happens, so **Keys are impossible to earn offline**.
 *
 * That third one is the load-bearing gap. Filings buy the size of a formation;
 * Keys buy the roster itself. A player who leaves the game running cannot
 * unlock anything, which is P1 honoured precisely: the machine runs without
 * you, but not as well.
 *
 * Pure, and deliberately in `systems/` rather than `progression/` — it takes
 * numbers and returns numbers, and knows nothing about a save.
 */

export interface OfflineInput {
  /** Seconds since the save was written. */
  elapsedSeconds: number
  /** What the player was earning per second when they stopped. */
  filingsPerSecond: number
  effects?: UpgradeEffects
}

export interface OfflineResult {
  /** Seconds that actually counted, after the cap. */
  effectiveSeconds: number
  /** Seconds beyond the cap, reported honestly rather than hidden. */
  wastedSeconds: number
  filings: number
  /** The cap in force, so the summary can say what it was. */
  capSeconds: number
  efficiency: number
  /**
   * What the same time would have paid at the active rate.
   *
   * Reported so the summary can be honest about the gap. economy-spec.md §4:
   * telling the player they lost nothing when they did is the kind of thing
   * that erodes trust in an idle game's numbers.
   */
  activeEquivalent: number
}

/** `1 / (1 + t / halflife)`. Halves the marginal rate every four hours. */
export function diminishing(seconds: number): number {
  return 1 / (1 + Math.max(0, seconds) / OFFLINE.diminishingHalflifeSeconds)
}

/** The offline window, after the Salvage branch. Clamped to its authored max. */
export function offlineCap(effects: UpgradeEffects): number {
  return Math.min(OFFLINE.maxCapSeconds, OFFLINE.capSeconds + Math.max(0, effects.offlineCap))
}

/**
 * Offline efficiency, after the Salvage branch.
 *
 * Clamped to `maxEfficiency`, which balancing.csv annotates "must stay below
 * 1.0 always". At parity, leaving the game would be the optimal play — the one
 * outcome this whole section exists to prevent — so the clamp is here rather
 * than left to the node values happening to add up correctly.
 */
export function offlineEfficiency(effects: UpgradeEffects): number {
  return Math.min(
    OFFLINE.maxEfficiency,
    OFFLINE.efficiency + Math.max(0, effects.offlineEfficiency),
  )
}

export function calculateOffline({
  elapsedSeconds,
  filingsPerSecond,
  effects = noUpgradeEffects(),
}: OfflineInput): OfflineResult {
  const capSeconds = offlineCap(effects)
  const efficiency = offlineEfficiency(effects)

  const elapsed = Math.max(0, elapsedSeconds)
  const effectiveSeconds = Math.min(elapsed, capSeconds)
  const wastedSeconds = elapsed - effectiveSeconds

  const rate = Math.max(0, filingsPerSecond) * efficiency
  const filings = effectiveSeconds * rate * diminishing(effectiveSeconds)

  return {
    effectiveSeconds,
    wastedSeconds,
    filings,
    capSeconds,
    efficiency,
    activeEquivalent: elapsed * Math.max(0, filingsPerSecond),
  }
}

/** Below this, an absence is not worth interrupting the player to report. */
export const MIN_REPORTABLE_SECONDS = 60

export function isWorthReporting(result: OfflineResult): boolean {
  return result.effectiveSeconds >= MIN_REPORTABLE_SECONDS && result.filings >= 1
}
