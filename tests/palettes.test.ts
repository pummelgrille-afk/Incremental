import { describe, expect, it } from 'vitest'
import { PALETTES, type ColourblindPalette } from '../src/lib/content/palettes'
import { ALL_DAMAGE_TYPES as DAMAGE_TYPES } from '../src/lib/content/damageTypes'
import { distance, luminance, simulate, type Deficiency } from './support/colourVision'

/**
 * The colourblind palettes, measured rather than asserted by eye.
 *
 * Every palette in `content/palettes.ts` is run through a simulation of the
 * deficiency it exists for, and the pairs a player has to tell apart are
 * required to stay apart. Without this the palettes are four plausible hex
 * values and a claim.
 *
 * The threshold is deliberately a *floor*, not a target. It is set where pairs
 * this project has already shipped sit: the default palette's percussive gold
 * against its shear blue, which nobody has had trouble with.
 */

/**
 * Redmean distance below which two colours read as the same one on a field.
 *
 * Required of the accessibility palettes, which exist for exactly this. The
 * default palette is held to a lower bar and measured separately below — it was
 * authored for the art direction rather than against a number, and quietly
 * lowering this to accommodate it would defeat the point of having it.
 */
const MIN_SEPARATION = 90

/** What the shipped default palette actually manages. See below. */
const DEFAULT_FLOOR = 80

const DEFICIENCIES: Record<Exclude<ColourblindPalette, 'none'>, Deficiency> = {
  deuteranopia: 'deuteranopia',
  protanopia: 'protanopia',
  tritanopia: 'tritanopia',
}

function pairs<T>(items: T[]): [T, T][] {
  const out: [T, T][] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]])
  }
  return out
}

describe('the default palette', () => {
  it('separates the four damage types for ordinary vision', () => {
    const colours = DAMAGE_TYPES.map((t) => PALETTES.none.damage[t])
    for (const [a, b] of pairs(colours)) {
      expect(distance(a, b)).toBeGreaterThan(DEFAULT_FLOOR)
    }
  })

  it('is tightest between percussive gold and thermal orange', () => {
    /*
     * Measured in Phase 43 and recorded rather than fixed: 88, against a floor
     * of 90 for the accessibility palettes. The two warmest damage types are
     * the closest pair in the shipped game *before* any deficiency is applied,
     * which is worth knowing — it is the same pair that collapses completely
     * under deuteranopia in the test below.
     *
     * Not fixed here because widening it means moving one of them out of the
     * brass range art-style.md asks for, and that is an art decision rather
     * than a threshold's call. If the palette is ever retuned, this is the pair
     * to spend the room on.
     */
    const colours = DAMAGE_TYPES.map((t) => PALETTES.none.damage[t])
    const worst = pairs(colours)
      .map(([a, b]) => distance(a, b))
      .sort((x, y) => x - y)[0]

    expect(worst).toBeGreaterThan(85)
    expect(worst).toBeLessThan(MIN_SEPARATION)
    expect(distance(PALETTES.none.damage.percussive, PALETTES.none.damage.thermal)).toBeCloseTo(
      worst,
      6,
    )
  })

  it('is the reason the others exist', () => {
    /*
     * Not a regression guard — a recorded measurement. This is the failure the
     * alternative palettes are for, and pinning it means nobody can later
     * "fix" the default into something that no longer needs them without the
     * test saying so.
     */
    const { percussive, thermal } = PALETTES.none.damage
    const asSeen = distance(simulate(percussive, 'deuteranopia'), simulate(thermal, 'deuteranopia'))

    expect(asSeen).toBeLessThan(MIN_SEPARATION)
  })
})

describe.each(Object.entries(DEFICIENCIES))('the %s palette', (name, deficiency) => {
  const palette = PALETTES[name as ColourblindPalette]

  it('keeps the four damage types apart under the deficiency it is for', () => {
    const seen = DAMAGE_TYPES.map((t) => simulate(palette.damage[t], deficiency))

    for (const [i, [a, b]] of pairs(seen).entries()) {
      expect(distance(a, b), `pair ${i} collapsed`).toBeGreaterThan(MIN_SEPARATION)
    }
  })

  it('separates incoming fire from the player’s own', () => {
    // art-style.md §6 rule 1. If exactly one pair in the game has to survive,
    // it is this one.
    const contact = simulate(palette.projectileContact, deficiency)
    const array = simulate(palette.projectileArray, deficiency)

    expect(distance(contact, array)).toBeGreaterThan(MIN_SEPARATION)
  })

  it('does not let a telegraph read as the Sun', () => {
    // A Contact winding up and the Sun are the two brightest things on the
    // field. In the default palette they are red and gold, which under a
    // red-green deficiency is one colour.
    const telegraph = simulate(palette.telegraph, deficiency)
    const sun = simulate(0xc9a227, deficiency)

    expect(distance(telegraph, sun)).toBeGreaterThan(MIN_SEPARATION)
  })

  it('carries the separation on lightness as well as hue', () => {
    /*
     * The rule that makes these palettes work rather than merely pass: each
     * deficiency leaves about *one* usable hue axis, so four values along it
     * alone would be four points on a line. Requiring a real lightness spread
     * is what stops the next edit quietly going back to a single channel.
     */
    const lums = DAMAGE_TYPES.map((t) => luminance(simulate(palette.damage[t], deficiency)))
    const spread = Math.max(...lums) - Math.min(...lums)

    expect(spread).toBeGreaterThan(0.25)
  })
})
