import { ZONES } from './zones'

/**
 * What is behind the field, per zone.
 *
 * **Generated, not drawn.** A starfield is one of the few backgrounds that a
 * rule produces better than a painting: it costs no bytes, it is sharp at any
 * viewport, and its contrast can be *asserted* rather than eyeballed — which
 * matters more here than anywhere, because art-style.md §6 rule 1 makes the
 * background the one thing that must never compete with incoming fire.
 * `tests/backdrop.test.ts` holds every value below against that rule.
 *
 * PLAN.md Phase 39 asks for "parallax backgrounds and tilesets per zone".
 * Tilesets have no meaning in a fixed circular arena — there is no ground and
 * nothing scrolls — so what is built is the part that does: per-zone identity,
 * and parallax expressed the way this game expresses motion, as rotation.
 *
 * ## The zones darken outward, and that is not decoration
 *
 * The narrative already had this: the Service Floor is "the only part of the
 * Perihelion that looks lived-in", and the Unlit Orbit has "been dark for nine
 * generations". Leaving a sun means less light, so the field thins and cools as
 * the ladder climbs.
 *
 * It also happens to be exactly what legibility wants. The late zones carry the
 * densest bullet patterns in the game, and they are the zones whose backdrops
 * are quietest. A busier background on a harder stage would be the worst
 * possible pairing, so the fiction and the readability rule agree — which is
 * the only reason to trust either of them.
 */

export interface BackdropLayer {
  /** How many stars, across the whole disc. */
  readonly stars: number
  /** Star radius in world pixels. Sub-pixel at the design scale is intended. */
  readonly size: number
  /**
   * Brightness, 0–1, before the zone's own ceiling is applied.
   *
   * Never reaches 1. A star as bright as a projectile is a star the player has
   * to rule out mid-wave.
   */
  readonly brightness: number
  /**
   * Rotation, in degrees per second. Negative turns against the rings.
   *
   * This is the parallax: a further layer turns slower, which is what distance
   * does to apparent motion. The numbers are deliberately an order of
   * magnitude below the fastest ring's rate (45°/s) — a backdrop the eye can
   * *watch* moving is a backdrop competing for attention.
   */
  readonly degreesPerSecond: number
}

export interface BackdropDef {
  readonly zoneId: string
  /** Tint, as 0xRRGGBB. Cool and desaturated by rule — see the test. */
  readonly tint: number
  readonly layers: readonly BackdropLayer[]
}

/**
 * The brightest a backdrop star may be, as a fraction of full white.
 *
 * The cap that makes "low-contrast" a number instead of an intention.
 *
 * A star at this alpha over `--bg` lands around 0.3 relative luminance; the
 * green a hostile projectile is drawn in sits near 0.7. So the brightest thing
 * in the sky is less than half the brightness of the thing that must be read
 * first, which is what art-style.md §6 rule 1 asks for — and it is *visible*,
 * which the first pass at these numbers was not. Tuned by rendering a real
 * viewport rather than by argument.
 */
export const MAX_STAR_BRIGHTNESS = 0.5

/**
 * Hues a backdrop may never use, in degrees.
 *
 * Hostile fire is the green comet at roughly 130°, and its telegraph is red at
 * 0°. A backdrop sharing either hue makes the player rule out the background
 * before reading the field, which is the failure art-style.md §6 exists to
 * prevent. Blues and violets are what is left, and they are what "space at a
 * distance" looks like anyway.
 */
export const FORBIDDEN_HUES: readonly { readonly centre: number; readonly spread: number }[] = [
  { centre: 130, spread: 45 },
  { centre: 0, spread: 30 },
]

export const BACKDROPS: readonly BackdropDef[] = [
  {
    // Lived-in and close in: the busiest sky in the game, and the stage where
    // the fewest things are shooting at you.
    zoneId: 'service-floor',
    tint: 0x9fb0c8,
    layers: [
      { stars: 220, size: 1.7, brightness: 0.5, degreesPerSecond: -0.9 },
      { stars: 380, size: 1.2, brightness: 0.32, degreesPerSecond: -0.45 },
      { stars: 520, size: 0.9, brightness: 0.2, degreesPerSecond: -0.18 },
    ],
  },
  {
    // Mercury's. Scoured smooth — fewer, harder points, and the fastest sky,
    // because it is the innermost orbit the player ever fights on.
    zoneId: 'fast-orbit',
    tint: 0xb9b3c4,
    layers: [
      { stars: 170, size: 1.6, brightness: 0.46, degreesPerSecond: -1.2 },
      { stars: 300, size: 1.1, brightness: 0.28, degreesPerSecond: -0.6 },
      { stars: 430, size: 0.9, brightness: 0.17, degreesPerSecond: -0.24 },
    ],
  },
  {
    // "Nothing is seen through it." Dense and dim rather than sparse: a veil is
    // full of something, it is simply not something you can resolve.
    zoneId: 'the-veil',
    tint: 0x8f93b4,
    layers: [
      { stars: 110, size: 1.4, brightness: 0.28, degreesPerSecond: -0.7 },
      { stars: 520, size: 1.0, brightness: 0.19, degreesPerSecond: -0.35 },
      { stars: 640, size: 0.8, brightness: 0.13, degreesPerSecond: -0.14 },
    ],
  },
  {
    // Earth's, and the only one with anything on it worth the word. Temperate:
    // the reference sky the others are read against.
    zoneId: 'home-orbit',
    tint: 0x8fa8c2,
    layers: [
      { stars: 160, size: 1.5, brightness: 0.4, degreesPerSecond: -0.6 },
      { stars: 270, size: 1.1, brightness: 0.25, degreesPerSecond: -0.3 },
      { stars: 370, size: 0.8, brightness: 0.15, degreesPerSecond: -0.12 },
    ],
  },
  {
    // Past Mars, where the charts give out. Thinning, and colder.
    zoneId: 'cold-line',
    tint: 0x7f93b8,
    layers: [
      { stars: 115, size: 1.4, brightness: 0.32, degreesPerSecond: -0.4 },
      { stars: 195, size: 1.0, brightness: 0.2, degreesPerSecond: -0.2 },
      { stars: 260, size: 0.8, brightness: 0.12, degreesPerSecond: -0.08 },
    ],
  },
  {
    // Dark for nine generations. The quietest sky behind the densest waves in
    // the game, which is the pairing this whole table exists to get right.
    zoneId: 'unlit-orbit',
    tint: 0x6e7fa4,
    layers: [
      { stars: 70, size: 1.3, brightness: 0.24, degreesPerSecond: -0.25 },
      { stars: 130, size: 1.0, brightness: 0.15, degreesPerSecond: -0.12 },
      { stars: 180, size: 0.8, brightness: 0.09, degreesPerSecond: -0.05 },
    ],
  },
]

/** The backdrop for a zone, falling back to the first so a stage always draws. */
export function backdropFor(zoneId: string): BackdropDef {
  return BACKDROPS.find((backdrop) => backdrop.zoneId === zoneId) ?? BACKDROPS[0]
}

/** Zone ids with no backdrop authored. Empty, and a test keeps it that way. */
export function zonesWithoutBackdrop(): string[] {
  const authored = new Set(BACKDROPS.map((backdrop) => backdrop.zoneId))
  return ZONES.filter((zone) => !authored.has(zone.id)).map((zone) => zone.id)
}
