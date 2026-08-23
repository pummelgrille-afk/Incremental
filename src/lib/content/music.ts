
export const TEMPO_BPM = 132

export const BEATS_PER_BAR = 4

export const SECONDS_PER_BEAT = 60 / TEMPO_BPM
export const SECONDS_PER_EIGHTH = SECONDS_PER_BEAT / 2

export const TONIC_HZ = 110

export const SCALE = [0, 2, 3, 5, 7, 8, 10] as const

export interface ChordDef {
  readonly root: number

  readonly voicing: readonly number[]
}

export const PROGRESSION: readonly ChordDef[] = [
  { root: 0, voicing: [0, 3, 7, 12] },
  { root: 0, voicing: [0, 3, 7, 15] },
  { root: 8, voicing: [0, 4, 7, 12] },
  { root: 8, voicing: [0, 4, 7, 14] },
  { root: 3, voicing: [0, 4, 7, 12] },
  { root: 3, voicing: [0, 4, 7, 11] },
  { root: 10, voicing: [0, 4, 7, 12] },
  { root: 10, voicing: [0, 4, 7, 14] },
]

export const LAYER_THRESHOLDS = {
  pad: { on: -1, off: -1 },
  bass: { on: 0.18, off: 0.1 },
  arp: { on: 0.34, off: 0.24 },
} as const

export type LayerName = keyof typeof LAYER_THRESHOLDS

export const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 0] as const

export const LAYER_GAIN = {
  pad: 0.3,
  bass: 0.34,
  arp: 0.13,
} as const

export const LAYER_RELEASE = {
  pad: 3.2,
  bass: 0.5,
  arp: 0.42,
} as const
