import type { DamageType, Vec2 } from '../entities/types'

/**
 * Bullet patterns.
 *
 * Pure functions returning spawn descriptors — they allocate nothing into the
 * world and never touch simulation state. The caller decides whether the pool
 * has room. This is what keeps patterns data rather than behaviour, per
 * combat-spec.md §5.
 *
 * PLACEHOLDER SCOPE — Phase 16 builds the full set (spiral, wall, converge) and
 * Phase 31 gives each Slack its own. Three are implemented here: enough for the
 * Phase 10 slice to have visibly different threats.
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
  /** Usually the Mainspring at the origin, or a lead-corrected point. */
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

/** *n* projectiles across an arc, centred on the target. Nudge out of the cone. */
export function spread(count: number, arc: number, speed: number) {
  return (ctx: PatternContext): ProjectileSpawn[] => {
    const centre = aimAngle(ctx.origin, ctx.target)
    const out: ProjectileSpawn[] = []
    // A single projectile should go straight at the target, not off to one side.
    const step = count > 1 ? arc / (count - 1) : 0
    const start = centre - arc / 2

    for (let i = 0; i < count; i++) {
      out.push(spawnAt(ctx.origin, start + step * i, speed, ctx))
    }
    return out
  }
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

export const PATTERNS: readonly PatternDef[] = [
  { id: 'spread-3', telegraphMs: 450, build: spread(3, (50 * Math.PI) / 180, 105) },
  { id: 'aimed-1', telegraphMs: 500, build: aimed(150) },
  { id: 'ring-8', telegraphMs: 650, build: ring(8, 85) },
] as const

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]))

export function patternById(id: string): PatternDef | undefined {
  return BY_ID.get(id)
}
