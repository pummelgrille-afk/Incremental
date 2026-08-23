import {
  ARP_PATTERN,
  LAYER_THRESHOLDS,
  PROGRESSION,
  TONIC_HZ,
  type ChordDef,
  type LayerName,
} from '../content/music'

export function semitones(n: number): number {
  return Math.pow(2, n / 12)
}

export function chordAtBar(bar: number): ChordDef {
  const index = ((Math.floor(bar) % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length
  return PROGRESSION[index]
}

export function chordFrequencies(chord: ChordDef, octaves = 0): number[] {
  return chord.voicing.map((offset) =>
    TONIC_HZ * semitones(chord.root + offset + octaves * 12),
  )
}

export function bassFrequency(chord: ChordDef): number {
  return TONIC_HZ * semitones(chord.root) * 0.5
}

export function arpFrequency(eighth: number, chord: ChordDef): number {
  const step = ARP_PATTERN[((eighth % ARP_PATTERN.length) + ARP_PATTERN.length) % ARP_PATTERN.length]
  const offset = chord.voicing[step % chord.voicing.length]

  return TONIC_HZ * semitones(chord.root + offset) * 4
}

export function activeLayers(
  intensity: number,
  previous: ReadonlySet<LayerName>,
): Set<LayerName> {
  const next = new Set<LayerName>()

  for (const name of Object.keys(LAYER_THRESHOLDS) as LayerName[]) {
    const { on, off } = LAYER_THRESHOLDS[name]

    if (on < 0) {
      next.add(name)
      continue
    }

    const wasOn = previous.has(name)
    if (intensity >= on || (wasOn && intensity >= off)) next.add(name)
  }

  return next
}

export function beatAt(seconds: number, secondsPerBeat: number): number {
  return seconds / secondsPerBeat
}
