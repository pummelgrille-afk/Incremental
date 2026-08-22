import { CUES, type CueDef, type CueName } from '../content/audio'
import {
  approachIntensity,
  busGains,
  combatIntensity,
  musicCutoff,
} from './audioMix'
import {
  activeLayers,
  arpFrequency,
  bassFrequency,
  chordAtBar,
  chordFrequencies,
} from './music'
import {
  LAYER_GAIN,
  LAYER_RELEASE,
  SECONDS_PER_EIGHTH,
  type LayerName,
} from '../content/music'
import { BUDGETS } from '../content/budgets'
import type { Settings } from './saveSchema'

/**
 * The audio engine.
 *
 * The second module in the project that touches a browser API — `render.ts` is
 * the first — and it sits at the same layer for the same reason: everything
 * *decidable* about sound lives in `content/audio.ts` and `core/audioMix.ts`,
 * which are plain data and plain functions. This file only builds the graph and
 * pushes numbers into it.
 *
 * ## Nothing is heard before the player asks for it
 *
 * The context starts **suspended**, and is resumed on the first real input.
 * That is not politeness, it is the rule: every browser refuses to start audio
 * before a user gesture, and a game that tried would simply be silent with no
 * error. Resuming on the Flare — the player's one live control — means the
 * first sound arrives at the first moment they did something.
 *
 * ## Voices are budgeted, like everything else
 *
 * Phase 40 learned that an effect's cost is its frequency. Sound is stricter:
 * light does not accumulate but sound does, and a hundred overlapping copies of
 * one click is not a loud click, it is a completely different noise. So each
 * cue carries a minimum interval, and the engine holds a hard ceiling on
 * concurrent voices — both are refusals, not queues. A cue that arrives too
 * soon is dropped, exactly as a particle is.
 */

/**
 * Concurrent voices allowed.
 *
 * Well under the particle budget and for a sharper reason: past roughly a dozen
 * simultaneous sounds a human hears texture rather than events, so the
 * twenty-first voice is not just wasted, it actively destroys the twenty
 * before it.
 */
const MAX_VOICES = 16

export interface AudioEngine {
  /** Play a named cue. Silently refused if it would break a limit. */
  play(cue: CueName): void
  /** Follow the field. Called once per frame with the frame's own dt. */
  update(input: {
    dt: number
    contacts: number
    outputFraction: number
    running: boolean
  }): void
  /** Re-read the player's volumes. */
  applySettings(settings: Settings): void
  /** Start audio, if the browser will now allow it. */
  resume(): void
  destroy(): void
  /**
   * Dev diagnostics.
   *
   * `level` is the RMS of everything reaching the output, measured rather than
   * inferred. It exists because "is the music playing" is otherwise a question
   * nobody can answer without speakers — and the first version of the music bed
   * was, in fact, inaudible.
   */
  readonly stats: { voices: number; dropped: number; intensity: number; level: number }
}

/**
 * A silent engine, for when audio is unavailable.
 *
 * Returned rather than throwing when there is no `AudioContext` — a headless
 * test run, an old browser, a locked-down device. The game must be playable in
 * silence, and every caller would otherwise need a null check.
 */
export function createSilentAudio(): AudioEngine {
  return {
    play() {},
    update() {},
    applySettings() {},
    resume() {},
    destroy() {},
    stats: { voices: 0, dropped: 0, intensity: 0, level: 0 },
  }
}

export function createAudio(settings: Settings): AudioEngine {
  const Ctor =
    typeof window !== 'undefined'
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext)
      : undefined

  if (!Ctor) return createSilentAudio()

  let context: AudioContext
  try {
    context = new Ctor()
  } catch {
    return createSilentAudio()
  }

  // --- The buses. ----------------------------------------------------------
  //
  // master ← music, sfx. Two knobs the player already has in their save file,
  // and which nothing read until this phase.

  const master = context.createGain()
  master.connect(context.destination)

  // Tapped rather than inserted: an analyser passes audio through untouched,
  // and this way nothing about the diagnostic can affect what is heard.
  const analyser = context.createAnalyser()
  analyser.fftSize = 2048
  master.connect(analyser)
  const levelBuffer = new Float32Array(analyser.fftSize)

  const musicBus = context.createGain()
  const sfxBus = context.createGain()
  musicBus.connect(master)
  sfxBus.connect(master)

  // --- The score. ----------------------------------------------------------
  //
  // Scheduled ahead of the clock rather than fired from the frame loop. Web
  // Audio's own clock is sample-accurate and the frame loop is not: notes
  // triggered per frame arrive with whatever jitter the browser had that
  // moment, which at eighth notes is plainly audible as an unsteady pulse.
  // So each frame schedules everything due in the next window, at exact times,
  // and the browser stops being able to affect the timing.

  const musicFilter = context.createBiquadFilter()
  musicFilter.type = 'lowpass'
  musicFilter.frequency.value = musicCutoff(0)
  musicFilter.connect(musicBus)

  /** How far ahead notes are placed. Comfortably more than a slow frame. */
  const LOOKAHEAD_SECONDS = 0.35

  /** Context time the score started, or null until audio is running. */
  let scoreStart: number | null = null
  /** The next eighth note to be scheduled. */
  let nextEighth = 0
  let layers: Set<LayerName> = new Set(['pad'])

  /**
   * One scheduled note.
   *
   * Separate from `fire` because a music note is placed at a time rather than
   * played now, and because it goes to the music bus and does not count
   * against the SFX voice ceiling — the score is not allowed to starve the
   * game's own sounds, and it cannot be starved by them either.
   */
  function note(
    frequency: number,
    at: number,
    gain: number,
    release: number,
    wave: OscillatorType,
  ): void {
    const oscillator = context.createOscillator()
    oscillator.type = wave
    oscillator.frequency.value = frequency

    const envelope = context.createGain()
    const attack = Math.min(0.08, release * 0.25)
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), at + attack)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + attack + release)

    oscillator.connect(envelope).connect(musicFilter)
    oscillator.start(at)
    oscillator.stop(at + attack + release + 0.02)
  }

  function scheduleScore(): void {
    if (scoreStart === null) return

    const horizon = context.currentTime + LOOKAHEAD_SECONDS

    while (scoreStart + nextEighth * SECONDS_PER_EIGHTH < horizon) {
      const at = scoreStart + nextEighth * SECONDS_PER_EIGHTH
      const bar = Math.floor(nextEighth / 8)
      const chord = chordAtBar(bar)

      // The pad re-voices once a bar and rings across it.
      if (nextEighth % 8 === 0) {
        for (const frequency of chordFrequencies(chord)) {
          note(frequency, at, LAYER_GAIN.pad / 4, LAYER_RELEASE.pad, 'triangle')
        }
      }

      // The bass on the first and third beat, once it has arrived.
      if (layers.has('bass') && nextEighth % 4 === 0) {
        note(bassFrequency(chord), at, LAYER_GAIN.bass, LAYER_RELEASE.bass, 'sine')
      }

      // The eighth-note figure, which is what the busy section is made of.
      if (layers.has('arp')) {
        note(
          arpFrequency(nextEighth, chord),
          at,
          LAYER_GAIN.arp,
          LAYER_RELEASE.arp,
          'triangle',
        )
      }

      nextEighth++
    }
  }

  // --- Noise, built once. --------------------------------------------------
  //
  // A second of white noise, reused by every noise cue at whatever length it
  // wants. Generating a buffer per play would allocate on the hot path for a
  // sound that is by definition the same every time.

  const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const noiseData = noiseBuffer.getChannelData(0)
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1

  // --- Voice accounting. ---------------------------------------------------

  let voices = 0
  let dropped = 0
  let intensity = 0
  const lastPlayed = new Map<string, number>()

  function canPlay(name: string, minInterval: number): boolean {
    if (voices >= MAX_VOICES) {
      dropped++
      return false
    }

    if (minInterval > 0) {
      const previous = lastPlayed.get(name)
      if (previous !== undefined && context.currentTime - previous < minInterval) {
        dropped++
        return false
      }
    }

    lastPlayed.set(name, context.currentTime)
    return true
  }

  /**
   * Build and fire one voice.
   *
   * The envelope is drawn on the gain node rather than by scheduling a stop at
   * a fixed volume: a sound cut off at full amplitude clicks, and a click is
   * the one artefact a player hears every single time.
   */
  function fire(def: CueDef, frequencyOverride?: number): void {
    const now = context.currentTime
    const duration = def.attack + def.release

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = def.cutoff

    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, def.gain), now + def.attack)
    // Exponential to a floor rather than to zero: an exponential ramp to zero
    // is undefined, and a linear tail on a percussive sound reads as a fade
    // rather than a decay.
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    filter.connect(gain).connect(sfxBus)

    voices++
    const release = () => {
      voices = Math.max(0, voices - 1)
    }

    if (def.wave === 'noise') {
      const source = context.createBufferSource()
      source.buffer = noiseBuffer
      source.connect(filter)
      source.onended = release
      source.start(now)
      source.stop(now + duration)
      return
    }

    const oscillator = context.createOscillator()
    oscillator.type = def.wave
    const start = frequencyOverride ?? def.frequency
    oscillator.frequency.setValueAtTime(start, now)
    if (def.endFrequency !== undefined && frequencyOverride === undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, def.endFrequency),
        now + duration,
      )
    }

    oscillator.connect(filter)
    oscillator.onended = release
    oscillator.start(now)
    oscillator.stop(now + duration)
  }

  function applySettings(next: Settings): void {
    const gains = busGains(next)
    master.gain.value = gains.master
    musicBus.gain.value = gains.music
    sfxBus.gain.value = gains.sfx
  }

  applySettings(settings)

  return {
    play(cue) {
      const def = CUES[cue]
      if (!canPlay(cue, def.minInterval)) return
      fire(def)
    },

    update({ dt, contacts, outputFraction, running }) {
      const target = combatIntensity({
        contacts,
        contactBudget: BUDGETS.contact,
        outputFraction,
        running,
      })
      intensity = approachIntensity(intensity, target, dt)

      // Written straight rather than ramped: this runs every frame, so the
      // value is already as smooth as `approachIntensity` made it, and a ramp
      // per frame would fight the next one.
      musicFilter.frequency.value = musicCutoff(intensity)

      layers = activeLayers(intensity, layers)
      scheduleScore()
    },

    applySettings,

    resume() {
      if (context.state === 'suspended') void context.resume()
      // The score begins at the first moment it can actually be heard, so bar
      // one is not half over before the browser lets any of it out.
      if (scoreStart === null) scoreStart = context.currentTime + 0.1
    },

    destroy() {
      // Scheduled notes stop themselves; closing the context takes anything
      // still pending with it.
      scoreStart = null
      void context.close()
    },

    get stats() {
      analyser.getFloatTimeDomainData(levelBuffer)
      let sum = 0
      for (let i = 0; i < levelBuffer.length; i++) sum += levelBuffer[i] * levelBuffer[i]

      return {
        voices,
        dropped,
        intensity,
        level: Math.sqrt(sum / levelBuffer.length),
      }
    },
  }
}
