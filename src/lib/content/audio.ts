/**
 * The sound library.
 *
 * **Synthesised, not sampled.** Every cue below is a recipe — a waveform, a
 * pitch, an envelope, a filter — rather than a file, for the same reasons the
 * starfield is a rule rather than a painting (art-style.md §8): it costs no
 * bytes, it is exact at any length, and it can be tuned by changing a number
 * instead of re-recording.
 *
 * It also happens to be what this world sounds like. narrative.md asks for
 * "quiet, procedural, faintly melancholy — the register is a maintenance log,
 * not an epic". A maintenance log does not have orchestral hits in it. It has
 * ticks, hums, a bell somewhere down the corridor, and long stretches of a
 * machine running correctly.
 *
 * ## Frequency is the whole design problem, again
 *
 * Phase 40 learned this with particles: what an effect costs is how often it
 * fires, not how big it is. Audio is stricter still, because sound accumulates
 * where light does not — forty-eight Platforms firing once a second is a
 * perfectly readable picture and an unlistenable machine-gun of clicks.
 *
 * So the loud events here are the **rare** ones, and the common ones are either
 * silent or rate-limited to a floor. A Platform firing has no sound at all; the
 * hit does, quietly, at most a few times a second.
 */

export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise'

export interface CueDef {
  /** Oscillator shape, or filtered noise. */
  readonly wave: Waveform
  /** Starting pitch in Hz. Ignored for noise. */
  readonly frequency: number
  /**
   * Pitch at the end of the cue, for a sweep. Omit to hold.
   *
   * A falling sweep reads as something landing or closing; a rising one as
   * something opening or being spent. Nearly every cue here falls.
   */
  readonly endFrequency?: number
  /** Seconds from silence to full. Short is a click, long is a swell. */
  readonly attack: number
  /** Seconds from full back to silence. */
  readonly release: number
  /** Peak gain, 0–1, before the bus volumes. */
  readonly gain: number
  /** Low-pass cutoff in Hz. The main tool for keeping cues out of each other. */
  readonly cutoff: number
  /**
   * Shortest gap between two plays of this cue, in seconds.
   *
   * The audio equivalent of the particle budget, and more important: a hundred
   * overlapping copies of the same click is not a loud click, it is noise with
   * a completely different character. Zero means no limit, and only the rarest
   * cues get that.
   */
  readonly minInterval: number
}

/**
 * Every cue the game can play.
 *
 * Read as a table, the design is: the player's own actions and the moments
 * they arranged are audible; the machine running is texture; and the only
 * genuinely alarming sound in the game is the objective being hit.
 */
export const CUES = {
  /**
   * The Flare. The player's one live input, so it is the one thing that must
   * always answer — a control with a silent response reads as a control that
   * did not register.
   */
  flare: {
    wave: 'noise',
    frequency: 0,
    attack: 0.004,
    release: 0.28,
    gain: 0.72,
    cutoff: 4000,
    minInterval: 0,
  },

  /** A Contact taking damage. The commonest cue in the game, so the quietest. */
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

  /** A Contact dying. Dull and low — a thing stopping, not an explosion. */
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

  /**
   * A Platform absorbing a shot on its block arc.
   *
   * Hard and short, and deliberately the most *satisfying* sound in the set: a
   * block is a good outcome the player arranged, and combat-spec.md §5 makes
   * block arc the thing that carries survivability.
   */
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

  /**
   * The Sun taking damage. The only cue in the game that is meant to worry.
   *
   * Low, slow and unfiltered enough to sit under everything else, so it is
   * audible even in the densest wave — which is exactly when it matters and
   * exactly when the screen is least readable.
   */
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

  /** A stage cleared. Resolved, not triumphant — nobody here is a hero. */
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

  /** A stage lost. The same shape, downward. */
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

  /** An achievement. Two notes, and the second is this one. */
  achievement: {
    wave: 'triangle',
    frequency: 880,
    attack: 0.01,
    release: 0.5,
    gain: 0.45,
    cutoff: 4000,
    minInterval: 0,
  },

  /** A panel opening or closing. Barely there. */
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

  /**
   * The Manual opening.
   *
   * A book, not a menu: a soft low whumph rather than a click. Filtered noise
   * with a slow tail and a low cutoff — the sound of something with weight
   * being laid open, which is what the card's header has always claimed it is.
   *
   * The cutoff is the loudness control here, not the gain. Lowpassed white
   * noise keeps only the fraction of its energy below the corner, so at 1200 Hz
   * this measured *below* the music bed at a gain that looked generous on
   * paper. 1800 keeps the character and clears the bed.
   */
  manualOpen: {
    wave: 'noise',
    frequency: 0,
    attack: 0.012,
    release: 0.4,
    gain: 0.75,
    cutoff: 1800,
    minInterval: 0,
  },

  /**
   * A page turning.
   *
   * The same material as the open, an octave brighter and a quarter as long.
   * Paper is noise with a fast tail; anything tonal here would read as a
   * notification instead.
   */
  pageTurn: {
    wave: 'noise',
    frequency: 0,
    attack: 0.004,
    release: 0.15,
    gain: 0.7,
    cutoff: 4200,
    minInterval: 0.05,
  },

  /** Something bought — a unit levelled, a node taken. */
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

/**
 * The conjunction, which is a chord rather than a cue.
 *
 * The one place this game should sound like something. A conjunction is an
 * astronomical event before it is a synergy trigger (theme-revision.md), the
 * whole rotating-formation puzzle exists to arrange one, and Phase 40 found it
 * had been firing with no visual for twenty-two phases. It gets a bell.
 *
 * Pitched by scale, upward: a Grand alignment is the pay-off, and it should be
 * heard to be a bigger event than a Minor rather than a louder one. The
 * intervals are a just-intoned major triad — 1, 5/4, 3/2 — because a
 * conjunction is a *coincidence of periods*, and that is exactly what a simple
 * frequency ratio is.
 */
export const CONJUNCTION_CHORD = {
  minor: [261.63, 392.0],
  major: [261.63, 327.03, 392.0],
  grand: [261.63, 327.03, 392.0, 523.25],
} as const

export const CONJUNCTION_BELL: CueDef = {
  wave: 'sine',
  frequency: 0,
  attack: 0.006,
  release: 1.6,
  gain: 0.26,
  cutoff: 5000,
  minInterval: 0.35,
}

/**
 * The music bed.
 *
 * Three drones a fifth apart, filtered and slow. Not a tune: a tune has a
 * beginning and would need an end, and this plays for the length of a session.
 * What it does instead is *breathe* with the field — see `core/audioMix.ts` for
 * how intensity moves it.
 *
 * The base is low enough to sit under every cue above, which is the point: the
 * music must never be the reason a Sun hit went unheard.
 */
export const DRONES: readonly {
  readonly frequency: number
  readonly gain: number
  readonly wave: Waveform
}[] = [
  // The sub. Felt on a real speaker, harmless on a laptop, and carrying none
  // of the bed's actual information — which is why the first version of this
  // table, which was *only* voices down here, measured as playing and was
  // inaudible on anything anyone owns.
  { frequency: 55, gain: 0.34, wave: 'sine' },
  // The body. Triangles rather than sines from here up: a sine has no
  // harmonics at all, so a small speaker rolling off the fundamental
  // reproduces literally nothing.
  { frequency: 110, gain: 0.3, wave: 'triangle' },
  { frequency: 164.81, gain: 0.24, wave: 'triangle' },
  // The part a laptop can actually reproduce. An open fifth rather than a
  // triad — a bed that committed to major or minor would have an opinion, and
  // this one is a room tone.
  { frequency: 220, gain: 0.2, wave: 'triangle' },
  { frequency: 329.63, gain: 0.1, wave: 'triangle' },
]

/**
 * Cutoff the bed sweeps between, calm to busy.
 *
 * The calm figure was 240 Hz in the first pass, which put the filter *below*
 * most of the bed and left only the sub-bass audible. It is above the top drone
 * now, so what intensity opens is the harmonics rather than the notes.
 */
export const DRONE_CUTOFF = { calm: 700, busy: 2400 } as const

/**
 * Overall gain of the bed, before the music bus.
 *
 * Tuned by measuring the output, in two passes, because both failures are only
 * visible at the end of the chain:
 *
 * 1. At 0.22 with only sub-bass voices the master RMS was 0.023 — about
 *    -33 dBFS, which is "technically not silent" and practically nothing.
 * 2. Raised to 0.62 it measured 0.087, and then the *cues* were the problem:
 *    `hit` and `kill` measured at or below the bed, so the commonest sounds in
 *    the game were inaudible under their own music.
 *
 * The bed is a constant and everything else is transient, so the constant is
 * what has to give. See phase-41.md for the measured table.
 */
export const DRONE_GAIN = 0.34
