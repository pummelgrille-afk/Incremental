import type { ConjunctionScale, DamageType } from '../entities/types'

export const TYPE_COLOURS: Readonly<Record<DamageType, number>> = Object.freeze({
  percussive: 0xd8b45a,
  shear: 0x8fb3c9,
  thermal: 0xe08a4a,
  resonant: 0x5eead4,
})

export interface BurstSpec {
  readonly count: number
  readonly speed: number
  readonly life: number
  readonly size: number

  readonly spread: number

  readonly drag: number
}

export const CONJUNCTION_BURST: Readonly<Record<ConjunctionScale, BurstSpec>> =
  Object.freeze({
    minor: { count: 14, speed: 130, life: 0.5, size: 2.4, spread: 0.5, drag: 0.25 },
    major: { count: 24, speed: 165, life: 0.62, size: 2.8, spread: 0.6, drag: 0.25 },
    grand: { count: 38, speed: 205, life: 0.75, size: 3.2, spread: 0.7, drag: 0.25 },
  })

export const CONJUNCTION_RADIUS = 0.55

export const IMPACT_BURST: BurstSpec = Object.freeze({
  count: 4,
  speed: 90,
  life: 0.26,
  size: 1.7,
  spread: Math.PI,
  drag: 0.12,
})

export const BLOCK_BURST: BurstSpec = Object.freeze({
  count: 7,
  speed: 110,
  life: 0.3,
  size: 1.9,
  spread: 1.1,
  drag: 0.1,
})

export const FLARE_BURST: BurstSpec = Object.freeze({
  count: 20,
  speed: 190,
  life: 0.45,
  size: 2.2,
  spread: Math.PI,
  drag: 0.2,
})

export const FLARE_COLOUR = 0xfff1a8

export const UPGRADE_BURST: BurstSpec = Object.freeze({
  count: 16,
  speed: 95,
  life: 0.8,
  size: 2.3,
  spread: Math.PI,
  drag: 0.06,
})

export const UPGRADE_COLOUR = 0xc9a227
