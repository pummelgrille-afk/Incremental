import {
  ARP_PATTERN,
  LAYER_THRESHOLDS,
  PROGRESSION,
  TONIC_HZ,
  type ChordDef,
  type LayerName,
} from '../content/music'

/**
 * What the score plays, and when.
 *
 * Pure functions over a beat number — no Web Audio, no clock, no state beyond
 * what the caller passes in. `core/audio.ts` owns the scheduling; this owns the
 * music, so the parts that can be wrong in a way nobody hears are testable in a
 * plain Vitest process.
 *
 * "Wrong in a way nobody hears" is not a joke here. A progression that walks
 * off the end of its array, an arpeggio that lands on a note outside its chord,
 * a layer that flickers on and off around a threshold — all of those are
 * plainly visible as numbers and nearly impossible to diagnose by ear against a
 * game's worth of sound effects.
 */

/** Semitones to a frequency ratio. */
export function semitones(n: number): number {
  return Math.pow(2, n / 12)
}

/** The chord playing on a given bar. Wraps, so the progression is a loop. */
export function chordAtBar(bar: number): ChordDef {
  const index = ((Math.floor(bar) % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length
  return PROGRESSION[index]
}

/** Every note of a chord, in Hz, at an octave offset. */
export function chordFrequencies(chord: ChordDef, octaves = 0): number[] {
  return chord.voicing.map((offset) =>
    TONIC_HZ * semitones(chord.root + offset + octaves * 12),
  )
}

/** The root, for the bass. An octave down from where the pad voices it. */
export function bassFrequency(chord: ChordDef): number {
  return TONIC_HZ * semitones(chord.root) * 0.5
}

/**
 * Which note the arpeggio plays on a given eighth.
 *
 * The pattern indexes the chord's voicing rather than the scale, so the figure
 * is always *in* the chord and cannot land on a note that fights it. That is
 * the difference between an arpeggio and a random walk, and the reason this
 * needs no taste to stay consonant as the progression moves underneath it.
 */
export function arpFrequency(eighth: number, chord: ChordDef): number {
  const step = ARP_PATTERN[((eighth % ARP_PATTERN.length) + ARP_PATTERN.length) % ARP_PATTERN.length]
  const offset = chord.voicing[step % chord.voicing.length]

  // Two octaves above the pad: the arp has to sit above the field's cues in
  // pitch or it competes with them, and above the pad or it muddies it.
  return TONIC_HZ * semitones(chord.root + offset) * 4
}

/**
 * Which layers should be sounding.
 *
 * **Hysteresis, not a threshold.** `combatIntensity` sits near a boundary for
 * long stretches by design — a wave that holds steady holds the intensity
 * steady — and a layer flickering in and out around a single number is worse
 * than either state it flickers between. A layer needs more intensity to
 * arrive than it needs to stay.
 *
 * The caller passes what was on last time, so this stays a pure function of its
 * arguments rather than holding state of its own.
 */
export function activeLayers(
  intensity: number,
  previous: ReadonlySet<LayerName>,
): Set<LayerName> {
  const next = new Set<LayerName>()

  for (const name of Object.keys(LAYER_THRESHOLDS) as LayerName[]) {
    const { on, off } = LAYER_THRESHOLDS[name]

    // A layer with a negative threshold is always on — the pad.
    if (on < 0) {
      next.add(name)
      continue
    }

    const wasOn = previous.has(name)
    if (intensity >= on || (wasOn && intensity >= off)) next.add(name)
  }

  return next
}

/** Beat number at a given time, from a start time. */
export function beatAt(seconds: number, secondsPerBeat: number): number {
  return seconds / secondsPerBeat
}
