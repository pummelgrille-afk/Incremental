import { OFFLINE } from '../content/economy'
import { noUpgradeEffects, type UpgradeEffects } from '../entities/Upgrade'

export interface OfflineInput {
  elapsedSeconds: number

  salvagePerSecond: number
  effects?: UpgradeEffects
}

export interface OfflineResult {
  effectiveSeconds: number

  wastedSeconds: number
  salvage: number

  capSeconds: number
  efficiency: number

  activeEquivalent: number
}

export function diminishing(seconds: number): number {
  return 1 / (1 + Math.max(0, seconds) / OFFLINE.diminishingHalflifeSeconds)
}

export function offlineCap(effects: UpgradeEffects): number {
  return Math.min(OFFLINE.maxCapSeconds, OFFLINE.capSeconds + Math.max(0, effects.offlineCap))
}

export function offlineEfficiency(effects: UpgradeEffects): number {
  return Math.min(
    OFFLINE.maxEfficiency,
    OFFLINE.efficiency + Math.max(0, effects.offlineEfficiency),
  )
}

export function calculateOffline({
  elapsedSeconds,
  salvagePerSecond,
  effects = noUpgradeEffects(),
}: OfflineInput): OfflineResult {
  const capSeconds = offlineCap(effects)
  const efficiency = offlineEfficiency(effects)

  const elapsed = Math.max(0, elapsedSeconds)
  const effectiveSeconds = Math.min(elapsed, capSeconds)
  const wastedSeconds = elapsed - effectiveSeconds

  const rate = Math.max(0, salvagePerSecond) * efficiency
  const salvage = effectiveSeconds * rate * diminishing(effectiveSeconds)

  return {
    effectiveSeconds,
    wastedSeconds,
    salvage,
    capSeconds,
    efficiency,
    activeEquivalent: elapsed * Math.max(0, salvagePerSecond),
  }
}

export const RATE_WINDOW_SECONDS = 90

export function updateEarningRate(
  current: number,
  salvageDropped: number,
  seconds: number,
  windowSeconds = RATE_WINDOW_SECONDS,
): number {
  if (seconds <= 0) return current

  const perSecond = salvageDropped / seconds
  const smoothing = Math.min(1, seconds / windowSeconds)
  return current + (perSecond - current) * smoothing
}

export const MIN_REPORTABLE_SECONDS = 60

export function isWorthReporting(result: OfflineResult): boolean {
  return result.effectiveSeconds >= MIN_REPORTABLE_SECONDS && result.salvage >= 1
}
