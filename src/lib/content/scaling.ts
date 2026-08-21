/**
 * The difficulty curve, as data.
 *
 * Every number here mirrors a `scaling` row of docs/design/balancing.csv, which
 * is the source of truth. `systems/scaling.ts` reads them and hardcodes none of
 * them (CLAUDE.md, "Tuning numbers live in content/").
 *
 * Two of these were already live but written inline in `spawn.ts` — the HP and
 * damage growth factors — which is exactly the drift this convention exists to
 * prevent. The count formula had never been implemented at all.
 */
export const SCALING = {
  /**
   * Per-stage enemy growth. economy-spec.md §5.
   *
   * HP grows faster than damage on purpose, so the failure mode is *a stage
   * taking too long* before it is *dying suddenly*. A player who has out-scaled
   * their build should feel a stall, not a wall — the stall is what tells them
   * to Rewind (game-loop.md).
   */
  enemyHpGrowth: 1.14,
  enemyDamageGrowth: 1.09,

  /** `count = base + floor(stage / divisor)`. */
  enemyCountStageDivisor: 3,

  /** Every Nth stage is a boss. Content arrives in Phase 32. */
  bossInterval: 8,
  bossHpMultiplier: 12,
  bossDamageMultiplier: 1.5,
} as const

/**
 * Over-level pressure.
 *
 * PLAN.md Phase 19 asks for a curve "tied to the player's current power".
 * Taken literally in both directions that is rubber-banding, and it would break
 * the design: economy-spec.md §5 and game-loop.md both rest on **the stall
 * being the signal** to Rewind. A director that quietly eases off when the
 * player is weak removes the stall, and with it the only thing telling them the
 * run is over.
 *
 * So the response is deliberately **one-sided**. Being over-levelled adds
 * pressure; being under-levelled adds nothing. Replaying a cleared stage with a
 * much stronger formation stops being free, and no wall is ever hidden.
 *
 * "Power" is measured against the wave itself rather than against an authored
 * power curve — see `systems/scaling.ts` — so this needs no magic baseline that
 * would silently rot as the roster grows.
 */
export const OVER_LEVEL = {
  /**
   * Pressure below which nothing happens at all.
   *
   * Pressure is the player's sustained damage per second divided by the rate at
   * which the wave delivers HP. At 1.0 the player exactly keeps pace with
   * arrivals, which is already a comfortable clear.
   *
   * **Calibrated so the reference formation never triggers it.** Six Movements
   * and two Chimes at level 1 — the build every balance pass since Phase 14 has
   * been measured against — peaks at 2.39 pressure, on First Shift, which is
   * deliberately the gentlest stage in the zone. A director that fired there
   * would be rebalancing the game rather than answering farming, and it would
   * invalidate every number in docs/phases/phase-17.md and phase-19.md.
   *
   * 3.0 leaves that build untouched on every stage while still catching a
   * formation roughly twice its strength replaying early content.
   */
  threshold: 3,

  /** Extra count per unit of pressure above the threshold. */
  countPerPressure: 0.35,

  /**
   * Ceiling on the added count, as a fraction of the authored count.
   *
   * Capped because the authored wave is still the *shape* of the question being
   * asked (waves.ts). Doubling a wave would not make it a harder version of the
   * same question, it would make it a different one — and it would sail past
   * the entity budget the engine is measured against.
   */
  maxCountBonus: 0.5,
} as const
