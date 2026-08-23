import { ZONES } from './zones'

export interface BackdropLayer {
  readonly stars: number

  readonly size: number

  readonly brightness: number

  readonly degreesPerSecond: number
}

export interface BackdropDef {
  readonly zoneId: string

  readonly tint: number
  readonly layers: readonly BackdropLayer[]
}

export const MAX_STAR_BRIGHTNESS = 0.5

export const FORBIDDEN_HUES: readonly { readonly centre: number; readonly spread: number }[] = [
  { centre: 130, spread: 45 },
  { centre: 0, spread: 30 },
]

export const BACKDROPS: readonly BackdropDef[] = [
  {
    zoneId: 'service-floor',
    tint: 0x9fb0c8,
    layers: [
      { stars: 220, size: 1.7, brightness: 0.5, degreesPerSecond: -0.9 },
      { stars: 380, size: 1.2, brightness: 0.32, degreesPerSecond: -0.45 },
      { stars: 520, size: 0.9, brightness: 0.2, degreesPerSecond: -0.18 },
    ],
  },
  {
    zoneId: 'fast-orbit',
    tint: 0xb9b3c4,
    layers: [
      { stars: 170, size: 1.6, brightness: 0.46, degreesPerSecond: -1.2 },
      { stars: 300, size: 1.1, brightness: 0.28, degreesPerSecond: -0.6 },
      { stars: 430, size: 0.9, brightness: 0.17, degreesPerSecond: -0.24 },
    ],
  },
  {
    zoneId: 'the-veil',
    tint: 0x8f93b4,
    layers: [
      { stars: 110, size: 1.4, brightness: 0.28, degreesPerSecond: -0.7 },
      { stars: 520, size: 1.0, brightness: 0.19, degreesPerSecond: -0.35 },
      { stars: 640, size: 0.8, brightness: 0.13, degreesPerSecond: -0.14 },
    ],
  },
  {
    zoneId: 'home-orbit',
    tint: 0x8fa8c2,
    layers: [
      { stars: 160, size: 1.5, brightness: 0.4, degreesPerSecond: -0.6 },
      { stars: 270, size: 1.1, brightness: 0.25, degreesPerSecond: -0.3 },
      { stars: 370, size: 0.8, brightness: 0.15, degreesPerSecond: -0.12 },
    ],
  },
  {
    zoneId: 'cold-line',
    tint: 0x7f93b8,
    layers: [
      { stars: 115, size: 1.4, brightness: 0.32, degreesPerSecond: -0.4 },
      { stars: 195, size: 1.0, brightness: 0.2, degreesPerSecond: -0.2 },
      { stars: 260, size: 0.8, brightness: 0.12, degreesPerSecond: -0.08 },
    ],
  },
  {
    zoneId: 'unlit-orbit',
    tint: 0x6e7fa4,
    layers: [
      { stars: 70, size: 1.3, brightness: 0.24, degreesPerSecond: -0.25 },
      { stars: 130, size: 1.0, brightness: 0.15, degreesPerSecond: -0.12 },
      { stars: 180, size: 0.8, brightness: 0.09, degreesPerSecond: -0.05 },
    ],
  },
]

export function backdropFor(zoneId: string): BackdropDef {
  return BACKDROPS.find((backdrop) => backdrop.zoneId === zoneId) ?? BACKDROPS[0]
}

export function zonesWithoutBackdrop(): string[] {
  const authored = new Set(BACKDROPS.map((backdrop) => backdrop.zoneId))
  return ZONES.filter((zone) => !authored.has(zone.id)).map((zone) => zone.id)
}
