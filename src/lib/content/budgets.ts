/**
 * Performance budgets. Mirrors the `budget` rows of docs/design/balancing.csv
 * and the reasoning in docs/architecture.md, "Performance budgets".
 *
 * These are **content constraints**, not runtime clamps. A wave that would
 * exceed the Slack budget is a content bug caught by tests, not something the
 * engine silently truncates — clamping spawns would change authored difficulty
 * invisibly, which is worse than a brief frame dip.
 *
 * The projectile budget is the exception: it *is* a runtime cap, because
 * patterns emit far more than content can predict, and refusing a spawn there
 * degrades gracefully (fewer bullets, no stutter).
 */

export const BUDGETS = {
  /**
   * Concurrent Slack a stage may schedule. Measured cost is ~5.8 us each per
   * frame after the Phase 11 render fix; 200 leaves roughly 7x headroom on the
   * reference machine, which is the low-spec margin.
   */
  slack: 200,

  /** Hard cap on live projectiles. Enforced by the pool in core/loop.ts. */
  projectiles: 600,

  /** Particle budget for Phase 40's VFX library. Not yet spent. */
  particles: 400,

  /** Movements plus Chimes. Bounded by TOTAL_SLOTS + RIM_MOUNTS anyway. */
  units: 38,
} as const

/**
 * Frame budget at 60 fps, in milliseconds. Rendering plus simulation must fit
 * inside this with room for the browser's own work.
 */
export const FRAME_BUDGET_MS = 1000 / 60

/**
 * Share of the frame the game may use before it is considered at risk. The
 * remainder is left for style recalculation, compositing and GC.
 */
export const FRAME_SAFETY_FACTOR = 0.6

export const TARGET_FRAME_MS = FRAME_BUDGET_MS * FRAME_SAFETY_FACTOR
