import type { ContentDef } from './types'

/**
 * The Almanac — permanent upgrades bought with Recollection.
 *
 * Rules in docs/design/economy-spec.md §2. The system lives in
 * `progression/upgradeTree.ts`; the nodes are authored in `content/upgrades.ts`
 * and Phase 34 fills out the full ~72.
 */

/**
 * The four branches.
 *
 * **Regulation is the one with an identity to protect.** It buys *reach and
 * readability* — Flare charges, blast radius, conjunction tolerance, preview
 * horizon — not numbers. It changes how the game plays rather than how hard it
 * hits, and economy-spec.md §2 asks Phase 34 to keep it that way.
 */
export type UpgradeBranch = 'aperture' | 'shielding' | 'recovery' | 'regulation'

export const UPGRADE_BRANCHES: readonly UpgradeBranch[] = [
  'aperture',
  'shielding',
  'recovery',
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
  /** Multiplier on Platform attack. */
  | 'attack'
  /** Attack-speed bonus, as haste. */
  | 'haste'
  /** Multiplier on conjunction effect magnitude. */
  | 'conjunctionPotency'
  // Bracing — defence.
  /** Flat Output added to a stage's base. */
  | 'output'
  /** Multiplier on Platform defence. */
  | 'defence'
  /** Radians added to every Platform's block arc. */
  | 'blockArc'
  // Recovery — economy.
  /** Multiplier on Salvage dropped. */
  | 'salvage'
  /** Multiplier on Recollection awarded. */
  | 'recollection'
  /** Reduction in emergency repair cost, as a fraction. */
  | 'repairCost'
  /** Seconds added to the offline cap. */
  | 'offlineCap'
  /** Fraction added to offline efficiency. */
  | 'offlineEfficiency'
  // Regulation — reach and readability.
  /** Extra whole Flare charges. */
  | 'flareCharges'
  /**
   * Fraction taken off the Flare's recharge interval.
   *
   * economy-spec.md §2 names "Flare charges *and regeneration*" as Regulation's
   * remit and there was no kind for the second half, so the branch had three
   * levers for fourteen nodes. Clamped where it is applied, not here: content
   * should not have to know the floor.
   */
  | 'flareRecharge'
  /** Pixels added to the Flare's blast radius. */
  | 'flareRadius'
  /** Radians added to the conjunction tolerance window. */
  | 'conjunctionTolerance'
  /**
   * Seconds added to how far ahead the conjunction preview looks.
   *
   * The "preview quality" economy-spec.md §2 asks Regulation to govern. It buys
   * *knowing sooner*, which is the branch's identity — reach and readability,
   * never numbers.
   */
  | 'previewHorizon'

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

