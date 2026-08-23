import { RIM_RADIUS } from '../content/field'
import { backdropFor, type BackdropDef, type BackdropLayer } from '../content/backdrop'
import { createRng, seedFrom } from './rng'

export interface Star {
  x: number
  y: number
  radius: number

  alpha: number
}

export interface BackdropLayerGeometry {
  readonly stars: readonly Star[]
  readonly degreesPerSecond: number
  readonly tint: number
}

export const FIELD_COVERAGE = 3

export const CLEAR_RADIUS = RIM_RADIUS * 1.05

export function layerGeometry(
  layer: BackdropLayer,
  tint: number,
  seed: number,
): BackdropLayerGeometry {
  const rng = createRng(seed)
  const stars: Star[] = []

  const outer = RIM_RADIUS * FIELD_COVERAGE

  for (let i = 0; i < layer.stars; i++) {
    const t = rng.next()
    const radius = Math.sqrt(
      CLEAR_RADIUS * CLEAR_RADIUS + t * (outer * outer - CLEAR_RADIUS * CLEAR_RADIUS),
    )
    const angle = rng.next() * Math.PI * 2

    stars.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,

      radius: layer.size * (0.7 + rng.next() * 0.6),

      alpha: layer.brightness * (0.78 + rng.next() * 0.22),
    })
  }

  return { stars, degreesPerSecond: layer.degreesPerSecond, tint }
}

export function backdropGeometry(zoneId: string): BackdropLayerGeometry[] {
  const backdrop: BackdropDef = backdropFor(zoneId)

  return backdrop.layers.map((layer, index) =>

    layerGeometry(layer, backdrop.tint, seedFrom(`${zoneId}:backdrop:${index}`)),
  )
}
