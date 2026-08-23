import type { RingIndex } from '../entities/types'

export interface RingConfig {
  readonly index: RingIndex
  readonly radius: number
  readonly slots: number

  readonly period: number
}

export const RINGS: readonly RingConfig[] = [
  { index: 1, radius: 90, slots: 6, period: 8 },
  { index: 2, radius: 160, slots: 10, period: 14 },
  { index: 3, radius: 240, slots: 14, period: 22 },
  { index: 4, radius: 310, slots: 18, period: 34 },
] as const

export const INNERMOST_RING = RINGS[0].index
export const OUTERMOST_RING = RINGS[RINGS.length - 1].index

export const RIM_RADIUS = 380
export const RIM_MOUNTS = 8

export const SPAWN_RADIUS = RIM_RADIUS

export const FLARE = {
  maxCharges: 3,

  rechargeInterval: 3,

  cooldown: 0.25,

  radius: 44,
  baseDamage: 26,
} as const

export const CONJUNCTION = {
  tolerance: (6 * Math.PI) / 180,

  evalInterval: 100,

  cooldown: 6,
  multipliers: { minor: 1.25, major: 1.6, grand: 2.2 },

  pairing: { matched: 1.25, interference: 0.7, mixed: 1 },

  pulseArc: 0.5,

  interferenceArc: 1,
} as const

export function ringByIndex(index: RingIndex): RingConfig | undefined {
  return RINGS.find((r) => r.index === index)
}

export const TOTAL_SLOTS = RINGS.reduce((sum, r) => sum + r.slots, 0)

export function slotAngle(ring: RingConfig, slot: number, phase: number): number {
  return (slot / ring.slots) * Math.PI * 2 + phase
}
