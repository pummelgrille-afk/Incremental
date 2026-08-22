/**
 * The score.
 *
 * Generative rather than composed: a tempo, a scale, a progression and a set of
 * rules for what each layer plays. Nothing here is a recording and nothing is a
 * fixed melody — the game runs for hours and a fixed melody has a length.
 *
 * ## Where the parameters came from
 *
 * A reference track was supplied as a file and **measured**, which is a very
 * different thing from being listened to. What the analysis produced, and what
 * was taken from it:
 *
 * | Measured | Taken as |
 * |---|---|
 * | Transients every 0.221s in the busy section | eighth notes at ~134 BPM |
 * | Spectral change 0.32 busy vs 0.12 calm | plucked when busy, sustained when calm |
 * | Sub-bass 2.1% calm → 15.2% busy | the bass is a layer that *enters* |
 * | Chroma peaking on C, then F, A, G | the C major / A minor family |
 * | Loud section from 33s to 83s of 118s | arrangement by section, not by volume |
 *
 * What is **not** taken is the tune. A tempo, a mode and "the bass enters when
 * it gets busy" are the vocabulary of a whole genre; the melody is the piece.
 * Everything below is written against those parameters from scratch.
 *
 * The last row is the useful one for a game: that track changes its
 * *arrangement* rather than its volume, which is precisely what an adaptive
 * score should do and what `core/audioMix.ts` was already reaching for by
 * opening a filter.
 */

/**
 * Beats per minute.
 *
 * Measured at 131–134 by autocorrelation and confirmed by the eighth-note
 * spacing. 132 is inside that range and divides cleanly, which keeps the note
 * grid on exact multiples of a millisecond-ish and the scheduler honest.
 */
export const TEMPO_BPM = 132

export const BEATS_PER_BAR = 4

/** Seconds per beat and per eighth, derived so nothing restates the tempo. */
export const SECONDS_PER_BEAT = 60 / TEMPO_BPM
export const SECONDS_PER_EIGHTH = SECONDS_PER_BEAT / 2

/**
 * The tonic, in Hz. A2 — low enough that the bass has somewhere to go.
 *
 * A minor rather than C major, though the chroma supports either: a minor
 * tonic suits "quiet, procedural, faintly melancholy" (narrative.md) without
 * the reference having to be argued about.
 */
export const TONIC_HZ = 110

/** Semitone offsets from the tonic. Natural minor — no leading tone. */
export const SCALE = [0, 2, 3, 5, 7, 8, 10] as const

export interface ChordDef {
  /** Semitones above the tonic. */
  readonly root: number
  /** Semitone offsets from the root. */
  readonly voicing: readonly number[]
}

/**
 * The progression, one chord per bar.
 *
 * i – VI – III – VII, which is the common minor turn and belongs to nobody.
 * Eight bars rather than four: at 132 BPM four bars is 7.3 seconds, which is
 * short enough that a player notices the loop inside a minute. Eight is 14.5
 * seconds, and repeating the pair with a different top note is enough to keep
 * it from announcing itself.
 */
export const PROGRESSION: readonly ChordDef[] = [
  { root: 0, voicing: [0, 3, 7, 12] }, // i
  { root: 0, voicing: [0, 3, 7, 15] }, // i, ninth on top
  { root: 8, voicing: [0, 4, 7, 12] }, // VI
  { root: 8, voicing: [0, 4, 7, 14] },
  { root: 3, voicing: [0, 4, 7, 12] }, // III
  { root: 3, voicing: [0, 4, 7, 11] },
  { root: 10, voicing: [0, 4, 7, 12] }, // VII
  { root: 10, voicing: [0, 4, 7, 14] },
]

/**
 * Which layers play at which intensity.
 *
 * Taken straight from the measurement: the reference is pads alone when calm
 * and gains a bass and an eighth-note figure when it opens up. So does this.
 *
 * The thresholds have hysteresis — a layer needs more intensity to arrive than
 * to leave — because a layer flickering in and out around a threshold is worse
 * than either state, and `combatIntensity` sits near a boundary for long
 * stretches by design.
 */
export const LAYER_THRESHOLDS = {
  /** Always on. The bed the whole thing rests on. */
  pad: { on: -1, off: -1 },
  bass: { on: 0.18, off: 0.1 },
  arp: { on: 0.34, off: 0.24 },
} as const

export type LayerName = keyof typeof LAYER_THRESHOLDS

/**
 * The arpeggio's shape, as indices into the chord's voicing.
 *
 * Up, over the top, and back — rather than a plain ascending run, which
 * announces its period every cycle. Sixteen eighths spans two bars, so the
 * figure and the chord change land on each other only every other bar.
 */
export const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 0] as const

/** Per-layer gain, before the music bus. Measured against the bed in Phase 41. */
export const LAYER_GAIN = {
  pad: 0.3,
  bass: 0.34,
  arp: 0.13,
} as const

/** How long each layer's notes ring. */
export const LAYER_RELEASE = {
  pad: 3.2,
  bass: 0.5,
  arp: 0.42,
} as const
