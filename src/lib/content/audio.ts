
export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise'

export interface CueDef {
  readonly wave: Waveform

  readonly frequency: number

  readonly endFrequency?: number

  readonly attack: number

  readonly release: number

  readonly gain: number

  readonly cutoff: number

  readonly minInterval: number
}

export const CUES = {
  flare: {
    wave: 'noise',
    frequency: 0,
    attack: 0.004,
    release: 0.28,
    gain: 0.72,
    cutoff: 4000,
    minInterval: 0,
  },

  hit: {
    wave: 'triangle',
    frequency: 420,
    endFrequency: 300,
    attack: 0.002,
    release: 0.05,
    gain: 0.3,
    cutoff: 1800,
    minInterval: 0.06,
  },

  kill: {
    wave: 'sine',
    frequency: 180,
    endFrequency: 90,
    attack: 0.003,
    release: 0.16,
    gain: 0.55,
    cutoff: 900,
    minInterval: 0.045,
  },

  block: {
    wave: 'square',
    frequency: 660,
    endFrequency: 520,
    attack: 0.001,
    release: 0.06,
    gain: 0.42,
    cutoff: 2600,
    minInterval: 0.07,
  },

  sunHit: {
    wave: 'sawtooth',
    frequency: 110,
    endFrequency: 70,
    attack: 0.01,
    release: 0.4,
    gain: 0.55,
    cutoff: 600,
    minInterval: 0.25,
  },

  cleared: {
    wave: 'sine',
    frequency: 523.25,
    endFrequency: 783.99,
    attack: 0.02,
    release: 0.9,
    gain: 0.5,
    cutoff: 3000,
    minInterval: 0,
  },

  lost: {
    wave: 'sine',
    frequency: 392,
    endFrequency: 196,
    attack: 0.03,
    release: 1.1,
    gain: 0.48,
    cutoff: 1400,
    minInterval: 0,
  },

  achievement: {
    wave: 'triangle',
    frequency: 880,
    attack: 0.01,
    release: 0.5,
    gain: 0.45,
    cutoff: 4000,
    minInterval: 0,
  },

  ui: {
    wave: 'sine',
    frequency: 1200,
    endFrequency: 900,
    attack: 0.001,
    release: 0.04,
    gain: 0.2,
    cutoff: 3000,
    minInterval: 0.04,
  },

  manualOpen: {
    wave: 'noise',
    frequency: 0,
    attack: 0.012,
    release: 0.4,
    gain: 0.75,
    cutoff: 1800,
    minInterval: 0,
  },

  pageTurn: {
    wave: 'noise',
    frequency: 0,
    attack: 0.004,
    release: 0.15,
    gain: 0.7,
    cutoff: 4200,
    minInterval: 0.05,
  },

  purchase: {
    wave: 'triangle',
    frequency: 587.33,
    endFrequency: 880,
    attack: 0.005,
    release: 0.24,
    gain: 0.4,
    cutoff: 3500,
    minInterval: 0.05,
  },
} as const satisfies Record<string, CueDef>

export type CueName = keyof typeof CUES

export const MUSIC_CUTOFF = { calm: 700, busy: 2400 } as const
