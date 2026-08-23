import type { DamageType, Vec2 } from '../entities/types'

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
  origin: Vec2

  target: Vec2
  damage: number
  damageType: DamageType

  emitterPhase: number
}

export interface PatternDef {
  readonly id: string

  readonly telegraphMs: number
  readonly build: (ctx: PatternContext) => ProjectileSpawn[]
}

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

export function arcAngles(centre: number, arc: number, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [centre]

  const step = arc / (count - 1)
  const start = centre - arc / 2
  return Array.from({ length: count }, (_, i) => start + step * i)
}

export function spread(count: number, arc: number, speed: number) {
  return (ctx: PatternContext): ProjectileSpawn[] =>
    arcAngles(aimAngle(ctx.origin, ctx.target), arc, count).map((angle) =>
      spawnAt(ctx.origin, angle, speed, ctx),
    )
}

export function aimed(speed: number) {
  return (ctx: PatternContext): ProjectileSpawn[] => [
    spawnAt(ctx.origin, aimAngle(ctx.origin, ctx.target), speed, ctx),
  ]
}

export function ring(count: number, speed: number) {
  return (ctx: PatternContext): ProjectileSpawn[] => {
    const out: ProjectileSpawn[] = []
    const step = (Math.PI * 2) / count
    for (let i = 0; i < count; i++) {
      out.push(spawnAt(ctx.origin, ctx.emitterPhase + step * i, speed, ctx))
    }
    return out
  }
}

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

export function wall(count: number, arc: number, speed: number, gapWidth = 2) {
  return (ctx: PatternContext): ProjectileSpawn[] => {
    const angles = arcAngles(aimAngle(ctx.origin, ctx.target), arc, count)

    const span = Math.max(0, count - gapWidth)
    const gapStart = Math.floor(Math.abs(Math.sin(ctx.emitterPhase)) * span)

    return angles
      .filter((_, i) => i < gapStart || i >= gapStart + gapWidth)
      .map((angle) => spawnAt(ctx.origin, angle, speed, ctx))
  }
}

export function converge(count: number, arc: number, speed: number, radius: number) {
  return (ctx: PatternContext): ProjectileSpawn[] => {
    const bearing = Math.atan2(ctx.origin.y, ctx.origin.x)

    return arcAngles(bearing, arc, count).map((angle) => {
      const from = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }

      return spawnAt(from, angle + Math.PI, speed, ctx)
    })
  }
}

export const PATTERNS: readonly PatternDef[] = [
  { id: 'spread-2', telegraphMs: 450, build: spread(2, (34 * Math.PI) / 180, 100) },
  { id: 'spread-3', telegraphMs: 450, build: spread(3, (50 * Math.PI) / 180, 105) },

  { id: 'ring-6', telegraphMs: 600, build: ring(6, 80) },

  { id: 'aimed-1', telegraphMs: 500, build: aimed(150) },

  { id: 'wall-5', telegraphMs: 550, build: wall(5, (70 * Math.PI) / 180, 115, 2) },

  { id: 'converge-7', telegraphMs: 750, build: converge(7, (70 * Math.PI) / 180, 90, 320) },

  { id: 'ring-8', telegraphMs: 650, build: ring(8, 85) },
  { id: 'wall-9', telegraphMs: 700, build: wall(9, (110 * Math.PI) / 180, 100, 2) },

  { id: 'spiral-4', telegraphMs: 600, build: spiral(4, 95, 0.9) },

  { id: 'spiral-3', telegraphMs: 600, build: spiral(3, 90, 1.15) },
] as const

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]))

export function patternById(id: string): PatternDef | undefined {
  return BY_ID.get(id)
}
