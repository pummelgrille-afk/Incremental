import type { DamageType } from '../entities/types'

export type ColourblindPalette = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'

export interface FieldPalette {
  damage: Record<DamageType, number>

  telegraph: number

  sunLow: number

  projectileContact: number
  projectileArray: number
}

export const PALETTES: Readonly<Record<ColourblindPalette, FieldPalette>> = Object.freeze({
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

  deuteranopia: {
    damage: {
      percussive: 0xf2d16b,
      thermal: 0x8f6a14,
      shear: 0xaed0f5,
      resonant: 0x2f6f9e,
    },

    telegraph: 0xffffff,
    sunLow: 0xaed0f5,
    projectileContact: 0xffffff,
    projectileArray: 0x2f6f9e,
  },

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
