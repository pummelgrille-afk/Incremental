/**
 * Currency tuning, as data.
 *
 * Every number here mirrors a row of docs/design/balancing.csv, which is the
 * source of truth. `progression/currencies.ts` reads them and hardcodes none of
 * them (CLAUDE.md, "Tuning numbers live in content/").
 *
 * Two of these were already live but written inline — the zone drop scaling in
 * `systems/combat.ts` and the repair curve as default parameters on
 * `Sun.repairCost`. Both now read from here.
 */

/** Salvage: the run currency. economy-spec.md §1. */
export const SALVAGE = {
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
  /** Deliberately pricier than a Platform — a Array is a bigger commitment. */
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
 * stages deeper worth roughly 1.8× the award — enough that depth flares breadth,
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
 * Clearance: roster tokens. Flat, and **first clear only**.
 *
 * Not farmable by design — Clearance measure how much content a player has *seen*,
 * which is what makes the roster unlock curve authored rather than grindable.
 * Phase 29's roster balance depends on that.
 */
export const CLEARANCE = {
  normalStageFirstClear: 1,
  bossStageFirstClear: 5,
  zoneComplete: 10,
  /** A re-clear awards nothing. Named so the zero is a decision, not a gap. */
  reclear: 0,
} as const

/**
 * The Almanac. economy-spec.md §2.
 *
 * Growth keys on the **branch**, not the whole tree, which is what makes
 * spreading investment cheaper than driving one branch deep — a specialist
 * build pays for the privilege rather than being handed it.
 */
export const TREE = {
  nodeCostGrowth: 1.9,
} as const

/**
 * The roster: unlocking and levelling Platforms and Arrays.
 *
 * Both cost **Clearance** (economy-spec.md §1), which are first-clear only. That is
 * the whole point of keeping them separate from Recollection: roster breadth
 * and depth are gated on *seeing content*, not on grinding it, so Phase 29 can
 * author the unlock curve rather than discover it.
 */
export const ROSTER = {
  /** `base × growth^(levels already held)`, in Clearance. */
  levelCost: { base: 1, growth: 1.55 },

  /**
   * Ceiling per unit.
   *
   * A cap exists so Clearance stays meaningful late: without one, every point past the
   * roster's breadth would funnel into a single favourite, which is the
   * "funnel everything into one axis" that §1 separates the currencies to
   * prevent.
   */
  maxLevel: 10,

  /**
   * Stat multiplier per level above 1, applied to HP and attack alike.
   *
   * Flat rather than compounding: ten levels is +108%, which is a real
   * investment without outrunning the enemy HP curve (1.14 per stage). A
   * compounding 12% would be +210% and would make levelling strictly better
   * than breadth at every point.
   */
  levelScaling: 0.12,
} as const

/**
 * Array upgrade tracks — Phase 25.
 *
 * **Deliberately not levelling.** A Platform levels: it gets uniformly
 * stronger. A Array is *shaped*: you choose burst, sustain, or punch, and the
 * three pull against each other for the same scarce Clearance. That is the
 * "distinct in feel from front-line allies" PLAN.md asks for, expressed as
 * mechanics rather than as different numbers on the same lever.
 *
 * Each track keys on what makes an Array an Array (combat-spec.md §4): Charge is
 * the resource that defines the class, so two of the three tracks are about it.
 */
export const SUPPORT = {
  /** `base × growth^(levels already held on this track)`, in Clearance. */
  trackCost: { base: 2, growth: 1.7 },

  capacity: {
    maxLevel: 3,
    /** Whole extra shots held at once. Burst. */
    chargesPerLevel: 1,
  },

  recharge: {
    /**
     * Faster regeneration. Sustain.
     *
     * **Bounded hard, and the bound is measured.** `chargeInterval` is the
     * balance lever between the two unit classes: Phase 14 found 4 s makes a
     * Array strictly better per Filing than the Platforms it competes with, 6 s
     * is the crossover, and 7 s tips the other way. Two levels of −0.5 s put a
     * fully wound Array at 5 s — better, and still short of dominant.
     */
    maxLevel: 2,
    secondsPerLevel: 0.5,
    /** Never below this, whatever a later re-balance does to the levels. */
    floorSeconds: 4.5,
  },

  resonance: {
    maxLevel: 3,
    /** Fraction added to attack. Punch. */
    attackPerLevel: 0.15,
  },
} as const

/**
 * Offline progress. economy-spec.md §4.
 *
 * **Salvage only.** No conjunctions fire, no stage progress accrues, and so no
 * Clearance can ever be earned while away. Those are not omissions — they are the
 * three gaps that keep active play dominant, and P1 is honoured precisely by
 * them: the machine runs without you, but not as well.
 */
export const OFFLINE = {
  /** Seconds of absence that count at all. Beyond this, nothing accrues. */
  capSeconds: 4 * 3600,
  /** The ceiling the Recovery branch can raise the cap to. */
  maxCapSeconds: 24 * 3600,

  /**
   * Fraction of the player's active earning rate that applies while away.
   *
   * **Must stay below 1 forever** (balancing.csv, `efficiency_max`). An offline
   * rate at parity would make leaving the game the optimal play, which is the
   * failure mode this whole section exists to avoid.
   */
  efficiency: 0.4,
  maxEfficiency: 0.75,

  /**
   * `diminishing(t) = 1 / (1 + t / halflife)`.
   *
   * Halves the marginal rate every four hours, so a long absence is worth
   * progressively less per hour rather than being cut off at a cliff. A hard
   * cap alone would make the player feel robbed at the boundary; a curve makes
   * the boundary uninteresting.
   */
  diminishingHalflifeSeconds: 4 * 3600,
} as const
