import type { ContentDef } from './types'

export type UpgradeBranch = 'aperture' | 'shielding' | 'recovery' | 'regulation'

export const UPGRADE_BRANCHES: readonly UpgradeBranch[] = [
  'aperture',
  'shielding',
  'recovery',
  'regulation',
] as const

export type UpgradeEffectKind =

  | 'attack'

  | 'haste'

  | 'conjunctionPotency'

  | 'output'

  | 'defence'

  | 'blockArc'

  | 'salvage'

  | 'recollection'

  | 'repairCost'

  | 'offlineCap'

  | 'offlineEfficiency'

  | 'flareCharges'

  | 'flareRecharge'

  | 'flareRadius'

  | 'conjunctionTolerance'

  | 'previewHorizon'

export interface UpgradeEffect {
  readonly kind: UpgradeEffectKind

  readonly magnitude: number
}

export interface UpgradeNodeDef extends ContentDef {
  readonly branch: UpgradeBranch

  readonly tier: number

  readonly requires: readonly string[]

  readonly baseCost: number
  readonly effects: readonly UpgradeEffect[]
}

export interface UpgradeEffects {
  attack: number
  haste: number
  conjunctionPotency: number
  output: number
  defence: number
  blockArc: number
  salvage: number
  recollection: number
  repairCost: number
  offlineCap: number
  offlineEfficiency: number
  flareCharges: number
  flareRecharge: number
  flareRadius: number
  conjunctionTolerance: number
  previewHorizon: number
}

export function noUpgradeEffects(): UpgradeEffects {
  return {
    attack: 0,
    haste: 0,
    conjunctionPotency: 0,
    output: 0,
    defence: 0,
    blockArc: 0,
    salvage: 0,
    recollection: 0,
    repairCost: 0,
    offlineCap: 0,
    offlineEfficiency: 0,
    flareCharges: 0,
    flareRecharge: 0,
    flareRadius: 0,
    conjunctionTolerance: 0,
    previewHorizon: 0,
  }
}
