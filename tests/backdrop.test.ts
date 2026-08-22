import { describe, expect, it } from 'vitest'
import {
  BACKDROPS,
  backdropFor,
  FORBIDDEN_HUES,
  MAX_STAR_BRIGHTNESS,
  zonesWithoutBackdrop,
} from '../src/lib/content/backdrop'
import {
  backdropGeometry,
  CLEAR_RADIUS,
  FIELD_COVERAGE,
} from '../src/lib/core/backdrop'
import { RIM_RADIUS } from '../src/lib/content/field'
import { ZONES } from '../src/lib/content/zones'

/** Hue in degrees, 0–360, from a packed 0xRRGGBB. */
function hueOf(colour: number): number {
  const r = ((colour >> 16) & 0xff) / 255
  const g = ((colour >> 8) & 0xff) / 255
  const b = (colour & 0xff) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0

  const d = max - min
  let hue: number
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / d + 2) / 6
  else hue = ((r - g) / d + 4) / 6

  return hue * 360
}

/** Relative luminance, 0–1. */
function luminanceOf(colour: number): number {
  const r = ((colour >> 16) & 0xff) / 255
  const g = ((colour >> 8) & 0xff) / 255
  const b = (colour & 0xff) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Shortest distance between two hues, in degrees. */
function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360
  return raw > 180 ? 360 - raw : raw
}

describe('every zone has a sky', () => {
  it('covers the whole ladder', () => {
    // A zone with no backdrop falls back to the first one's, which would put
    // the Service Floor's busy sky behind the Unlit Orbit's waves.
    expect(zonesWithoutBackdrop()).toEqual([])
    expect(BACKDROPS).toHaveLength(ZONES.length)
  })

  it('falls back rather than failing for an unknown zone', () => {
    expect(backdropFor('no-such-zone')).toBe(BACKDROPS[0])
  })
})

describe('the background never competes with the field', () => {
  /*
   * art-style.md §6 rule 1: "Incoming fire is the brightest thing on screen.
   * Nothing owned, ambient or decorative may out-contrast a hostile projectile
   * against --bg." These are that rule, executable.
   */

  it('keeps every star under the brightness ceiling', () => {
    for (const backdrop of BACKDROPS) {
      for (const layer of backdrop.layers) {
        expect(layer.brightness, backdrop.zoneId).toBeLessThanOrEqual(MAX_STAR_BRIGHTNESS)
      }
    }
  })

  it('holds the ceiling after per-star variation', () => {
    // The generator varies brightness upward as well as down, so the authored
    // number is not on its own a guarantee.
    for (const zone of ZONES) {
      for (const layer of backdropGeometry(zone.id)) {
        for (const star of layer.stars) {
          expect(star.alpha, zone.id).toBeLessThanOrEqual(MAX_STAR_BRIGHTNESS)
        }
      }
    }
  })

  it('stays out of the hostile hues', () => {
    // Sharing a hue with incoming fire or a telegraph makes the player rule
    // out the background before reading the field.
    for (const backdrop of BACKDROPS) {
      const hue = hueOf(backdrop.tint)
      for (const forbidden of FORBIDDEN_HUES) {
        expect(
          hueDistance(hue, forbidden.centre),
          `${backdrop.zoneId} at ${Math.round(hue)}°`,
        ).toBeGreaterThan(forbidden.spread)
      }
    }
  })

  it('turns an order of magnitude slower than the fastest ring', () => {
    // The innermost ring completes a turn in 8s — 45°/s. A backdrop the eye can
    // watch moving is a backdrop competing for attention.
    for (const backdrop of BACKDROPS) {
      for (const layer of backdrop.layers) {
        expect(Math.abs(layer.degreesPerSecond), backdrop.zoneId).toBeLessThan(4.5)
      }
    }
  })

  it('leaves the playable field empty', () => {
    // No brightness cap makes a star acceptable where the player is looking,
    // so the exclusion is geometric.
    for (const zone of ZONES) {
      for (const layer of backdropGeometry(zone.id)) {
        for (const star of layer.stars) {
          expect(Math.hypot(star.x, star.y), zone.id).toBeGreaterThanOrEqual(CLEAR_RADIUS)
        }
      }
    }
  })
})

describe('the ladder darkens outward', () => {
  /*
   * The narrative has this already — the Service Floor is "the only part that
   * looks lived-in", the Unlit Orbit has "been dark for nine generations" — and
   * it is also what legibility wants, since the late zones carry the densest
   * patterns. The two agreeing is the only reason to trust either.
   */
  const totalLight = (zoneId: string): number =>
    backdropFor(zoneId).layers.reduce(
      (sum, layer) => sum + layer.stars * layer.brightness,
      0,
    )

  it('puts the most light on the first zone and the least on the last', () => {
    const first = totalLight(ZONES[0].id)
    const last = totalLight(ZONES[ZONES.length - 1].id)

    expect(last).toBeLessThan(first / 2)
  })

  it('never brightens as the ladder climbs past the opening zones', () => {
    // The Veil is the one exception and is allowed to be: "nothing is seen
    // through it" is dense-and-dim, not sparse. Checked from Home Orbit out.
    const outward = ZONES.slice(3).map((zone) => totalLight(zone.id))
    for (let i = 1; i < outward.length; i++) {
      expect(outward[i], ZONES[3 + i].id).toBeLessThan(outward[i - 1])
    }
  })
})

describe('the geometry', () => {
  it('is stable for a zone across calls', () => {
    // A sky that reshuffled would break what a backdrop is for: recognising
    // where you are before reading the label.
    const a = backdropGeometry('the-veil')
    const b = backdropGeometry('the-veil')

    expect(a[0].stars[0]).toEqual(b[0].stars[0])
    expect(a[1].stars.length).toBe(b[1].stars.length)
  })

  it('gives each layer of a zone different stars', () => {
    const [near, far] = backdropGeometry('home-orbit')
    expect(near.stars[0]).not.toEqual(far.stars[0])
  })

  it('spreads stars across the disc rather than banding at the inner edge', () => {
    /*
     * Sampling the radius linearly piles stars up near the rim, because an
     * annulus at radius r has area proportional to r. The first draft did
     * exactly that and drew a visible ring. Uniform over area means the inner
     * half of the *area* holds about half the stars.
     */
    const stars = backdropGeometry('service-floor').flatMap((layer) => layer.stars)
    const outer = RIM_RADIUS * FIELD_COVERAGE

    const midpoint = Math.sqrt((CLEAR_RADIUS * CLEAR_RADIUS + outer * outer) / 2)
    const inner = stars.filter((s) => Math.hypot(s.x, s.y) < midpoint).length

    expect(inner / stars.length).toBeGreaterThan(0.4)
    expect(inner / stars.length).toBeLessThan(0.6)
  })

  it('covers more than the field so a rotating layer never shows its edge', () => {
    expect(FIELD_COVERAGE).toBeGreaterThanOrEqual(2)
  })
})
