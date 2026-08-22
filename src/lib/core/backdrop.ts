import { RIM_RADIUS } from '../content/field'
import { backdropFor, type BackdropDef, type BackdropLayer } from '../content/backdrop'
import { createRng, seedFrom } from './rng'

/**
 * Placing the stars.
 *
 * Pure, seeded, framework-free — the same split `animation.ts` uses. The render
 * layer receives plain numbers and turns them into a Graphics; everything about
 * *where* a star goes is testable in a plain Vitest process.
 *
 * **Seeded from the zone id**, so a zone's sky is the same on every visit, on
 * every machine, and across a reload. A backdrop that reshuffled would quietly
 * break the thing a backdrop is for: a player should recognise where they are
 * before reading the label.
 */

export interface Star {
  x: number
  y: number
  radius: number
  /** 0–1, already capped by the layer's brightness. */
  alpha: number
}

export interface BackdropLayerGeometry {
  readonly stars: readonly Star[]
  readonly degreesPerSecond: number
  readonly tint: number
}

/**
 * How far out stars are placed, as a multiple of the rim.
 *
 * Generous on purpose. The layers rotate, so a disc that only just covered the
 * viewport would sweep its own empty corner across the screen; and a wide
 * viewport shows more world than a tall one. Three rim radii covers any aspect
 * this is likely to be played at.
 */
export const FIELD_COVERAGE = 3

/**
 * Stars are kept off the middle of the board.
 *
 * Inside the rim is where every Contact, projectile and Platform lives. A star
 * there is a permanent distractor sitting exactly where the player is looking,
 * and no brightness cap makes that acceptable — so the exclusion is geometric
 * rather than a matter of dimming.
 */
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
    /*
     * Uniform over *area*, not over radius.
     *
     * Sampling the radius linearly piles stars up near the inner edge, because
     * an annulus at radius r has area proportional to r — the first draft did
     * exactly that and produced a visible ring hugging the rim. Taking the
     * square root of a uniform sample spreads them evenly across the disc.
     */
    const t = rng.next()
    const radius = Math.sqrt(
      CLEAR_RADIUS * CLEAR_RADIUS + t * (outer * outer - CLEAR_RADIUS * CLEAR_RADIUS),
    )
    const angle = rng.next() * Math.PI * 2

    stars.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      // Varied a little so a layer does not read as one uniform grain size.
      radius: layer.size * (0.7 + rng.next() * 0.6),
      // Likewise: a layer of identically-bright points reads as a texture
      // rather than as a sky. The floor is high because the first pass used
      // 0.6 and dragged the brightest layer down to something invisible.
      alpha: layer.brightness * (0.78 + rng.next() * 0.22),
    })
  }

  return { stars, degreesPerSecond: layer.degreesPerSecond, tint }
}

/** Every layer of a zone's sky, furthest first so it draws underneath. */
export function backdropGeometry(zoneId: string): BackdropLayerGeometry[] {
  const backdrop: BackdropDef = backdropFor(zoneId)

  return backdrop.layers.map((layer, index) =>
    // The layer index is part of the seed, or every layer of a zone would be
    // the same stars at different sizes.
    layerGeometry(layer, backdrop.tint, seedFrom(`${zoneId}:backdrop:${index}`)),
  )
}
