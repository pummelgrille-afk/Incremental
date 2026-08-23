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

const MAX_VOICES = 16

export interface AudioEngine {
  play(cue: CueName): void

  update(input: {
    dt: number
    contacts: number
    outputFraction: number
    running: boolean
  }): void

  applySettings(settings: Settings): void

  resume(): void
  destroy(): void

  readonly stats: { voices: number; dropped: number; intensity: number; level: number }
}

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

  const master = context.createGain()
  master.connect(context.destination)

  const analyser = context.createAnalyser()
  analyser.fftSize = 2048
  master.connect(analyser)
  const levelBuffer = new Float32Array(analyser.fftSize)

  const musicBus = context.createGain()
  const sfxBus = context.createGain()
  musicBus.connect(master)
  sfxBus.connect(master)

  const musicFilter = context.createBiquadFilter()
  musicFilter.type = 'lowpass'
  musicFilter.frequency.value = musicCutoff(0)
  musicFilter.connect(musicBus)

  const LOOKAHEAD_SECONDS = 0.35

  let scoreStart: number | null = null

  let nextEighth = 0
  let layers: Set<LayerName> = new Set(['pad'])

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

      if (nextEighth % 8 === 0) {
        for (const frequency of chordFrequencies(chord)) {
          note(frequency, at, LAYER_GAIN.pad / 4, LAYER_RELEASE.pad, 'triangle')
        }
      }

      if (layers.has('bass') && nextEighth % 4 === 0) {
        note(bassFrequency(chord), at, LAYER_GAIN.bass, LAYER_RELEASE.bass, 'sine')
      }

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

  const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const noiseData = noiseBuffer.getChannelData(0)
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1

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

  function fire(def: CueDef, frequencyOverride?: number): void {
    const now = context.currentTime
    const duration = def.attack + def.release

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = def.cutoff

    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, def.gain), now + def.attack)

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

      musicFilter.frequency.value = musicCutoff(intensity)

      layers = activeLayers(intensity, layers)
      scheduleScore()
    },

    applySettings,

    resume() {
      if (context.state === 'suspended') void context.resume()

      if (scoreStart === null) scoreStart = context.currentTime + 0.1
    },

    destroy() {
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
