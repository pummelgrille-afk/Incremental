/**
 * Currency tuning, as data.
 *
 * Every number here mirrors a row of docs/design/balancing.csv, which is the
 * source of truth. `progression/currencies.ts` reads them and hardcodes none of
 * them (CLAUDE.md, "Tuning numbers live in content/").
 *
 * Two of these were already live but written inline — the zone drop scaling in
 * `systems/combat.ts` and the repair curve as default parameters on
 * `Mainspring.repairCost`. Both now read from here.
 */

/** Filings: the run currency. economy-spec.md §1. */
export const FILINGS = {
  /** `drop = baseDrop × (1 + zoneIndex × zoneScaling) × (1 + treeBonus)`. */
  zoneScaling: 0.35,

  /**
   * Sinks, in the order a player meets them.
   *
   * Each is `base × growth^(timesAlreadyBought)`. Slot growth of 1.18 is the
   * load-bearing number in the whole early economy: shallow enough that a tenth
   * slot is reachable in a first run, steep enough that a twentieth needs tree
   * investment.
   */
  slot: { base: 50, growth: 1.18 },
  /** Deliberately pricier than a Movement — a Chime is a bigger commitment. */
  mount: { base: 120, growth: 1.22 },
  /** Steep on purpose: repair is a panic button, never a strategy. */
  repair: { base: 40, growth: 1.5 },
  /** Expires at stage end, so it is rent rather than a purchase. */
  reinforce: { base: 200, growth: 1.25, bonus: 0.2 },
} as const

/**
 * Recollection: the prestige currency, awarded only on Rewinding.
 *
 * `floor(deepest^1.6 / 8 × (1 + treeBonus))`. The exponent makes pushing two
 * stages deeper worth roughly 1.8× the award — enough that depth beats breadth,
 * not so much that an early Rewind is ever a mistake.
 *
 * Phase 26 owns the Rewind itself. The formula lives here because it is a
 * currency rule, and because Phase 23's tree UI needs to quote it before any
 * Rewind exists.
 */
export const RECOLLECTION = {
  depthExponent: 1.6,
  depthDivisor: 8,
} as const

/**
 * Keys: roster tokens. Flat, and **first clear only**.
 *
 * Not farmable by design — Keys measure how much content a player has *seen*,
 * which is what makes the roster unlock curve authored rather than grindable.
 * Phase 29's roster balance depends on that.
 */
export const KEYS = {
  normalStageFirstClear: 1,
  bossStageFirstClear: 5,
  zoneComplete: 10,
  /** A re-clear awards nothing. Named so the zero is a decision, not a gap. */
  reclear: 0,
} as const
