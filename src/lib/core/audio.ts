import {
  CONJUNCTION_BELL,
  CONJUNCTION_CHORD,
  CUES,
  DRONE_GAIN,
  DRONES,
  type CueDef,
  type CueName,
} from '../content/audio'
import {
  approachIntensity,
  busGains,
  combatIntensity,
  droneCutoff,
} from './audioMix'
import { BUDGETS } from '../content/budgets'
import type { Settings } from './saveSchema'
import type { ConjunctionScale } from '../entities/types'

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
  /** The conjunction bell, pitched by the alignment's size. */
  conjunction(scale: ConjunctionScale): void
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
    conjunction() {},
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

  // --- The bed. ------------------------------------------------------------

  const droneFilter = context.createBiquadFilter()
  droneFilter.type = 'lowpass'
  droneFilter.frequency.value = droneCutoff(0)
  droneFilter.connect(musicBus)

  const droneGain = context.createGain()
  droneGain.gain.value = DRONE_GAIN
  droneGain.connect(droneFilter)

  const droneOscillators = DRONES.map((drone) => {
    const oscillator = context.createOscillator()
    oscillator.type = drone.wave === 'noise' ? 'triangle' : drone.wave
    oscillator.frequency.value = drone.frequency

    const gain = context.createGain()
    gain.gain.value = drone.gain
    oscillator.connect(gain).connect(droneGain)
    oscillator.start()

    return oscillator
  })

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

    conjunction(scale) {
      if (!canPlay('conjunction', CONJUNCTION_BELL.minInterval)) return

      // One voice per note, so the chord is a chord rather than a chord-shaped
      // sample. Counted against the voice ceiling honestly — a Grand costs four.
      for (const frequency of CONJUNCTION_CHORD[scale]) {
        if (voices >= MAX_VOICES) {
          dropped++
          return
        }
        fire(CONJUNCTION_BELL, frequency)
      }
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
      droneFilter.frequency.value = droneCutoff(intensity)
    },

    applySettings,

    resume() {
      if (context.state === 'suspended') void context.resume()
    },

    destroy() {
      for (const oscillator of droneOscillators) {
        try {
          oscillator.stop()
        } catch {
          // Already stopped; a teardown path that throws on its second call
          // takes the error handler with it.
        }
      }
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
