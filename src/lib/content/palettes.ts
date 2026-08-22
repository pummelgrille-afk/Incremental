import type { DamageType } from '../entities/types'

/**
 * Field palettes, including the three colourblind-safe alternatives.
 *
 * The default palette does the job art-style.md asks of it: brass and warm
 * light on a dark field. It also puts **four of the five colours a player has
 * to tell apart on the red–green axis** — gold, orange, red, and a teal that
 * only separates from blue by hue. For roughly 8% of men that is one colour
 * with four names.
 *
 * P4 says legibility over spectacle, every time. These palettes are that rule
 * applied to a player the default palette does not serve, and they cost the art
 * direction: the tritanopia set in particular is red and green on a dark field,
 * which is not what this game looks like. That is the trade, taken knowingly —
 * a player who cannot read the field is not enjoying the art direction either.
 *
 * ## How they are built
 *
 * Not by hue-shifting the originals. Each deficiency leaves roughly **one**
 * usable hue axis, so the four damage types are separated along that axis *and*
 * by lightness — two channels, because one is not enough for four values:
 *
 * | Palette | Usable axis | Four values |
 * |---------|-------------|-------------|
 * | deuteranopia / protanopia | blue–yellow | bright yellow, dark amber, light blue, deep blue |
 * | tritanopia | red–green | red, pale red, green, deep green |
 *
 * `tests/palettes.test.ts` simulates each deficiency (Viénot 1999) and asserts
 * every pair stays apart by a minimum perceptual distance. That is the whole
 * reason these are data in `content/` rather than four hex values typed into
 * the renderer: a constraint that can be asserted does not have to be trusted.
 */

export type ColourblindPalette = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'

export interface FieldPalette {
  /** Tracer colour by damage type — the type matrix, made visible. */
  damage: Record<DamageType, number>
  /** A Contact winding up. Must never be mistaken for the Sun's own gold. */
  telegraph: number
  /** The Sun below the warning threshold. */
  sunLow: number
  /**
   * Incoming fire, and the player's own.
   *
   * art-style.md §6 rule 1: incoming fire is the thing that must be read first.
   * These two carrying the whole distinction is why they are in every palette
   * rather than left to the sprites.
   */
  projectileContact: number
  projectileArray: number
}

export const PALETTES: Readonly<Record<ColourblindPalette, FieldPalette>> = Object.freeze({
  /** The authored palette. Unchanged from Phase 37. */
  none: {
    damage: {
      percussive: 0xd8b45a,
      shear: 0x8fb3c9,
      thermal: 0xe08a4a,
      resonant: 0x5eead4,
    },
    telegraph: 0xf87171,
    sunLow: 0xf87171,
    projectileContact: 0xe8e2d4,
    projectileArray: 0x5eead4,
  },

  /**
   * Deuteranopia — no green cone. The most common form, and the one the default
   * palette fails hardest: gold and orange become the same colour.
   */
  deuteranopia: {
    damage: {
      percussive: 0xf2d16b,
      thermal: 0x8f6a14,
      shear: 0xaed0f5,
      resonant: 0x2f6f9e,
    },
    // Telegraph and low-Output leave red entirely. Red on a deuteranope's
    // screen is a dull yellow-brown, which is what the Sun already is.
    telegraph: 0xffffff,
    sunLow: 0xaed0f5,
    projectileContact: 0xffffff,
    projectileArray: 0x2f6f9e,
  },

  /**
   * Protanopia — no red cone. Close to deuteranopia, with one difference that
   * matters here: reds and oranges are also *darkened*, so the dark amber that
   * separates thermal from percussive has to start lighter or it disappears
   * into the background.
   */
  protanopia: {
    damage: {
      percussive: 0xf2d16b,
      thermal: 0xb5892b,
      shear: 0xaed0f5,
      resonant: 0x2f6f9e,
    },
    telegraph: 0xffffff,
    sunLow: 0xaed0f5,
    projectileContact: 0xffffff,
    projectileArray: 0x2f6f9e,
  },

  /**
   * Tritanopia — no blue cone. Rare, and the opposite problem: red and green
   * survive, blue and yellow collapse. So this is the palette that stops
   * looking like the game, and it is the one that has to.
   */
  tritanopia: {
    damage: {
      percussive: 0xef6f6f,
      thermal: 0x8f2626,
      shear: 0x74e08a,
      resonant: 0x1f7a3d,
    },
    telegraph: 0xffffff,
    sunLow: 0xef6f6f,
    projectileContact: 0xffffff,
    projectileArray: 0x1f7a3d,
  },
} as const)

export const PALETTE_NAMES: Readonly<Record<ColourblindPalette, string>> = Object.freeze({
  none: 'Default',
  deuteranopia: 'Deuteranopia',
  protanopia: 'Protanopia',
  tritanopia: 'Tritanopia',
})

export function paletteFor(id: ColourblindPalette): FieldPalette {
  return PALETTES[id] ?? PALETTES.none
}
