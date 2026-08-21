import type { DamageType, Vec2 } from '../entities/types'

/**
 * Bullet patterns.
 *
 * Pure functions returning spawn descriptors — they allocate nothing into the
 * world and never touch simulation state. The caller decides whether the pool
 * has room. This is what keeps patterns data rather than behaviour, per
 * combat-spec.md §5.
 *
 * All six shapes from combat-spec.md §5 are implemented. Phase 31 assigns them
 * across the full tiered roster; Phase 32 adds boss-specific multi-phase
 * variants on top.
 */

export interface ProjectileSpawn {
  position: Vec2
  velocity: Vec2
  damage: number
  damageType: DamageType
  radius: number
  lifetime: number
  angularVelocity: number
}

export interface PatternContext {
  /** Where the emitter is. */
  origin: Vec2
  /** Usually the Sun at the origin, or a lead-corrected point. */
  target: Vec2
  damage: number
  damageType: DamageType
  /** Advances per emission, so successive volleys of a spiral rotate. */
  emitterPhase: number
}

export interface PatternDef {
  readonly id: string
  /** Seconds of warning before the first projectile exists. Never below 0.4. */
  readonly telegraphMs: number
  readonly build: (ctx: PatternContext) => ProjectileSpawn[]
}

/** combat-spec.md §5: a pattern that can kill without warning is a bug. */
export const MIN_TELEGRAPH_MS = 400

const DEFAULT_RADIUS = 3.5
const DEFAULT_LIFETIME = 6

function aimAngle(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

function spawnAt(
  origin: Vec2,
  angle: number,
  speed: number,
  ctx: PatternContext,
  angularVelocity = 0,
): ProjectileSpawn {
  return {
    position: { x: origin.x, y: origin.y },
    velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    damage: ctx.damage,
    damageType: ctx.damageType,
    radius: DEFAULT_RADIUS,
    lifetime: DEFAULT_LIFETIME,
    angularVelocity,
  }
}

/**
 * Evenly spaced angles across an arc, centred on `centre`.
 *
 * **A single angle sits on the centre** — not at the arc's edge, and never NaN.
 *
 * This exists because the same three-line calculation was written out
 * independently in `spread`, `wall` and `converge`, and got it wrong in two of
 * them: `spread(1)` and `converge(1)` aimed half an arc wide, and `wall(1)`
 * divided by zero and produced a NaN velocity — a projectile that would hold a
 * pool slot without ever moving, colliding, or leaving by the distance check.
 *
 * No content uses a count of 1 today, so none of it reached play. Phases 31 and
 * 32 author a lot of patterns, and one shared implementation is the only way
 * this stays fixed.
 */
export function arcAngles(centre: number, arc: number, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [centre]

  const step = arc / (count - 1)
  const start = centre - arc / 2
  return Array.from({ length: count }, (_, i) => start + step * i)
}

/** *n* projectiles across an arc, centred on the target. Absorbed by the line. */
export function spread(count: number, arc: number, speed: number) {
  return (ctx: PatternContext): ProjectileSpawn[] =>
    arcAngles(aimAngle(ctx.origin, ctx.target), arc, count).map((angle) =>
      spawnAt(ctx.origin, angle, speed, ctx),
    )
}

/** A single shot straight at the target. Break the sightline. */
export function aimed(speed: number) {
  return (ctx: PatternContext): ProjectileSpawn[] => [
    spawnAt(ctx.origin, aimAngle(ctx.origin, ctx.target), speed, ctx),
  ]
}

/** Full 360° shell. Absorb it with a defended ring. */
export function ring(count: number, speed: number) {
  return (ctx: PatternContext): ProjectileSpawn[] => {
    const out: ProjectileSpawn[] = []
    const step = (Math.PI * 2) / count
    for (let i = 0; i < count; i++) {
      // Offset by emitter phase so successive shells interleave rather than
      // stacking into corridors the player can stand in forever.
      out.push(spawnAt(ctx.origin, ctx.emitterPhase + step * i, speed, ctx))
    }
    return out
  }
}

/**
 * Continuous curving stream. Wait out the sweep.
 *
 * A true spiral falls out of `angularVelocity`: every projectile curves as it
 * travels, so one emission traces arms rather than needing a stream of
 * emissions. Cheap — collision.ts already rotates velocity vectors, and this is
 * the reason that support exists.
 */
export function spiral(arms: number, speed: number, curve: number) {
  return (ctx: PatternContext): ProjectileSpawn[] => {
    const out: ProjectileSpawn[] = []
    const step = (Math.PI * 2) / arms
    for (let i = 0; i < arms; i++) {
      out.push(spawnAt(ctx.origin, ctx.emitterPhase + step * i, speed, ctx, curve))
    }
    return out
  }
}

/**
 * A line across an arc with one gap. Put the gap over something that can take
 * it, or break the wall with a Flare.
 *
 * The gap is deliberately wide enough to read at a glance — a wall whose gap
 * has to be hunted for is a guessing game, which P4 rules out.
 */
export function wall(count: number, arc: number, speed: number, gapWidth = 2) {
  return (ctx: PatternContext): ProjectileSpawn[] => {
    const angles = arcAngles(aimAngle(ctx.origin, ctx.target), arc, count)

    // Gap position varies per emission so the same wall is not solvable once.
    const span = Math.max(0, count - gapWidth)
    const gapStart = Math.floor(Math.abs(Math.sin(ctx.emitterPhase)) * span)

    return angles
      .filter((_, i) => i < gapStart || i >= gapStart + gapWidth)
      .map((angle) => spawnAt(ctx.origin, angle, speed, ctx))
  }
}

/**
 * A wedge closing from the rim inward. Ring 1 defence matters.
 *
 * Spawns away from the emitter — the only pattern that does. The wedge is
 * centred on the emitter's own bearing rather than the whole circle, so it
 * still reads as *that* Contact's doing; a field-wide version would appear
 * unattributable, which is a legibility failure (P4) rather than drama.
 */
export function converge(count: number, arc: number, speed: number, radius: number) {
  return (ctx: PatternContext): ProjectileSpawn[] => {
    const bearing = Math.atan2(ctx.origin.y, ctx.origin.x)

    return arcAngles(bearing, arc, count).map((angle) => {
      const from = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
      // Inward, toward the centre rather than at the target.
      return spawnAt(from, angle + Math.PI, speed, ctx)
    })
  }
}

/**
 * Density and speed are a deliberate choice, not a default (PLAN.md Phase 16).
 *
 * **The tone is "readable pressure", not danmaku.** Pillar P4 makes legibility
 * non-negotiable, and the player's only input is a coarse area strike — there is
 * no precise dodge to reward, so dense fast curtains would punish without
 * offering counterplay.
 *
 * Concretely, against a typical bullet-hell:
 *
 * - **Speeds sit at 85-155 px/s**, roughly half genre-typical. A projectile
 *   crosses from rim to centre in ~2-4 s, so there is time to read and act.
 * - **Counts stay in single digits per emission.** Pressure comes from several
 *   Contact firing on staggered cadences, not from one wall of forty.
 * - **Telegraphs run 450-750 ms**, above the 400 ms floor, and scale with how
 *   much of the field a pattern denies.
 *
 * The budget allows 600 concurrent projectiles; these numbers deliberately use
 * a fraction of it. The headroom is for Phase 32 bosses, which are where density
 * should spike.
 */
export const PATTERNS: readonly PatternDef[] = [
  { id: 'spread-3', telegraphMs: 450, build: spread(3, (50 * Math.PI) / 180, 105) },
  { id: 'aimed-1', telegraphMs: 500, build: aimed(150) },
  { id: 'ring-8', telegraphMs: 650, build: ring(8, 85) },
  // Slow curve: the arms sweep rather than whip, so the gap between them is
  // somewhere to be rather than a frame-perfect window.
  { id: 'spiral-4', telegraphMs: 600, build: spiral(4, 95, 0.9) },
  { id: 'wall-9', telegraphMs: 700, build: wall(9, (110 * Math.PI) / 180, 100, 2) },
  // Denies the most field of any pattern, so it gets the longest warning.
  { id: 'converge-7', telegraphMs: 750, build: converge(7, (70 * Math.PI) / 180, 90, 320) },
] as const

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]))

export function patternById(id: string): PatternDef | undefined {
  return BY_ID.get(id)
}
