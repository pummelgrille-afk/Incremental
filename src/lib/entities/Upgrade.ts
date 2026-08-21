import type { ContentDef } from './types'

/**
 * The Escapement Tree — permanent upgrades bought with Recollection.
 *
 * Rules in docs/design/economy-spec.md §2. The system lives in
 * `progression/upgradeTree.ts`; the nodes are authored in `content/upgrades.ts`
 * and Phase 34 fills out the full ~72.
 */

/**
 * The four branches.
 *
 * **Regulation is the one with an identity to protect.** It buys *reach and
 * readability* — Beat charges, blast radius, conjunction tolerance, preview
 * horizon — not numbers. It changes how the game plays rather than how hard it
 * hits, and economy-spec.md §2 asks Phase 34 to keep it that way.
 */
export type UpgradeBranch = 'winding' | 'bracing' | 'salvage' | 'regulation'

export const UPGRADE_BRANCHES: readonly UpgradeBranch[] = [
  'winding',
  'bracing',
  'salvage',
  'regulation',
] as const

/**
 * What a node does.
 *
 * Every kind maps to a field of `UpgradeEffects`, and every kind is applied by
 * a system that already exists. A kind with no live consumer is untested
 * configuration — the failure mode this project keeps finding — so new kinds
 * arrive with their wiring, not before it.
 */
export type UpgradeEffectKind =
  // Winding — offence.
  /** Multiplier on Movement attack. */
  | 'attack'
  /** Attack-speed bonus, as haste. */
  | 'haste'
  /** Multiplier on conjunction effect magnitude. */
  | 'conjunctionPotency'
  // Bracing — defence.
  /** Flat Tension added to a stage's base. */
  | 'tension'
  /** Multiplier on Movement defence. */
  | 'defence'
  /** Radians added to every Movement's block arc. */
  | 'blockArc'
  // Salvage — economy.
  /** Multiplier on Filings dropped. */
  | 'filings'
  /** Multiplier on Recollection awarded. */
  | 'recollection'
  /** Reduction in emergency repair cost, as a fraction. */
  | 'repairCost'
  // Regulation — reach and readability.
  /** Extra whole Beat charges. */
  | 'beatCharges'
  /** Pixels added to the Beat's blast radius. */
  | 'beatRadius'
  /** Radians added to the conjunction tolerance window. */
  | 'conjunctionTolerance'

export interface UpgradeEffect {
  readonly kind: UpgradeEffectKind
  /**
   * How much. Additive across every purchased node of the same kind —
   * multiplicative stacking across ~72 nodes compounds past any curve the
   * balance table can hold (economy-spec.md §7).
   */
  readonly magnitude: number
}

export interface UpgradeNodeDef extends ContentDef {
  readonly branch: UpgradeBranch
  /** 1-based. Tiers gate cost, not availability — prerequisites do that. */
  readonly tier: number
  /** Node ids that must all be purchased first. Empty means a branch root. */
  readonly requires: readonly string[]
  /** Before the branch growth multiplier. */
  readonly baseCost: number
  readonly effects: readonly UpgradeEffect[]
}

/**
 * The aggregate a run is played with.
 *
 * Neutral values are the identity for how each is applied: multipliers are
 * expressed as *bonuses* (0 = no change) so summing them stays meaningful, and
 * flat additions start at zero.
 */
export interface UpgradeEffects {
  attack: number
  haste: number
  conjunctionPotency: number
  tension: number
  defence: number
  blockArc: number
  filings: number
  recollection: number
  repairCost: number
  beatCharges: number
  beatRadius: number
  conjunctionTolerance: number
}

export function noUpgradeEffects(): UpgradeEffects {
  return {
    attack: 0,
    haste: 0,
    conjunctionPotency: 0,
    tension: 0,
    defence: 0,
    blockArc: 0,
    filings: 0,
    recollection: 0,
    repairCost: 0,
    beatCharges: 0,
    beatRadius: 0,
    conjunctionTolerance: 0,
  }
}
