import { describe, expect, it } from 'vitest'
import { PALETTES, type ColourblindPalette } from '../src/lib/content/palettes'
import { ALL_DAMAGE_TYPES as DAMAGE_TYPES } from '../src/lib/content/damageTypes'
import { distance, luminance, simulate, type Deficiency } from './support/colourVision'

const MIN_SEPARATION = 90

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
    const contact = simulate(palette.projectileContact, deficiency)
    const array = simulate(palette.projectileArray, deficiency)

    expect(distance(contact, array)).toBeGreaterThan(MIN_SEPARATION)
  })

  it('does not let a telegraph read as the Sun', () => {
    const telegraph = simulate(palette.telegraph, deficiency)
    const sun = simulate(0xc9a227, deficiency)

    expect(distance(telegraph, sun)).toBeGreaterThan(MIN_SEPARATION)
  })

  it('carries the separation on lightness as well as hue', () => {
    const lums = DAMAGE_TYPES.map((t) => luminance(simulate(palette.damage[t], deficiency)))
    const spread = Math.max(...lums) - Math.min(...lums)

    expect(spread).toBeGreaterThan(0.25)
  })
})
