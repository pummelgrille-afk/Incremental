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
 * There is deliberately no conjunction cue.
 *
 * There was: a bell on a just-intoned triad, pitched by the size of the
 * alignment, and it was the best-sounding thing in the set on its own. It came
 * out after playtesting, for the reason phase-41.md had already written down as
 * the most likely complaint — **a full formation conjuncts far too often for a
 * ringing sound**. Phase 40 measured roughly 36 alignments a second at 48
 * Platforms; even rate-limited to one bell every 0.35s, a 1.6s release meant
 * four or five overlapping every second, and the game turned into a wind chime.
 *
 * The moment is not unmarked: Phase 40 gives it a particle burst scaled by the
 * alignment, which costs nothing in a channel that does not accumulate. That is
 * the difference between light and sound, and it is why the visual survived the
 * same frequency that killed the audio.
 *
 * If it ever returns, the fix is not a quieter bell — it is a rate limit longer
 * than the release, so no two can ever overlap.
 */

/**
 * How far the music's filter opens, calm to busy.
 *
 * The score itself lives in `content/music.ts`; this is the one part of it the
 * *mix* owns, because it is a response to the field rather than a musical
 * decision. See `core/audioMix.ts`.
 */
export const MUSIC_CUTOFF = { calm: 700, busy: 2400 } as const
