import { describe, expect, it } from 'vitest'
import {
  approachIntensity,
  busGains,
  combatIntensity,
  musicCutoff,
  INTENSITY_FALL_PER_SECOND,
  INTENSITY_RISE_PER_SECOND,
} from '../src/lib/core/audioMix'
import { CUES, MUSIC_CUTOFF } from '../src/lib/content/audio'
import {
  ARP_PATTERN,
  LAYER_GAIN,
  LAYER_THRESHOLDS,
  PROGRESSION,
  SECONDS_PER_EIGHTH,
  TEMPO_BPM,
} from '../src/lib/content/music'
import {
  activeLayers,
  arpFrequency,
  bassFrequency,
  chordAtBar,
  chordFrequencies,
} from '../src/lib/core/music'
import { createSilentAudio } from '../src/lib/core/audio'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { BUDGETS } from '../src/lib/content/budgets'

const settings = (overrides: Partial<ReturnType<typeof createDefaultSave>['settings']>) => ({
  ...createDefaultSave(0).settings,
  ...overrides,
})

describe('the volume settings, finally connected', () => {
  it('reads all three, which nothing did before this phase', () => {
    const gains = busGains(settings({ masterVolume: 1, musicVolume: 1, sfxVolume: 1 }))
    expect(gains).toEqual({ master: 1, music: 1, sfx: 1 })
  })

  it('silences everything at zero master', () => {
    expect(busGains(settings({ masterVolume: 0 })).master).toBe(0)
  })

  it('curves the fader rather than tracking it linearly', () => {
    const half = busGains(settings({ masterVolume: 0.5 })).master
    expect(half).toBeLessThan(0.5)
    expect(half).toBeCloseTo(0.25)
  })

  it('clamps nonsense rather than blasting', () => {
    expect(busGains(settings({ masterVolume: 40 })).master).toBe(1)
    expect(busGains(settings({ sfxVolume: -3 })).sfx).toBe(0)
    expect(busGains(settings({ musicVolume: Number.NaN })).music).toBe(0)
  })
})

describe('how busy the field sounds', () => {
  const quiet = {
    contacts: 0,
    contactBudget: BUDGETS.contact,
    outputFraction: 1,
    running: true,
  }

  it('is silent between waves', () => {
    expect(combatIntensity({ ...quiet, contacts: 80, running: false })).toBe(0)
  })

  it('rises with what is on screen', () => {
    const empty = combatIntensity(quiet)
    const busy = combatIntensity({ ...quiet, contacts: 40 })

    expect(busy).toBeGreaterThan(empty)
  })

  it('treats a wounded objective as intense on its own', () => {
    expect(combatIntensity({ ...quiet, contacts: 2, outputFraction: 0.1 }))
      .toBeGreaterThan(0.5)
  })

  it('takes the larger of the two rather than adding them', () => {
    const busy = combatIntensity({ ...quiet, contacts: 200, outputFraction: 1 })
    const both = combatIntensity({ ...quiet, contacts: 200, outputFraction: 0.05 })

    expect(busy).toBe(1)
    expect(both).toBe(1)
  })
})

describe('the mix moves slowly', () => {
  it('rises faster than it falls', () => {
    expect(INTENSITY_RISE_PER_SECOND).toBeGreaterThan(INTENSITY_FALL_PER_SECOND)
  })

  it('never jumps to the target in one frame', () => {
    expect(approachIntensity(0, 1, 1 / 60)).toBeLessThan(0.05)
  })

  it('arrives exactly rather than oscillating around the target', () => {
    let value = 0
    for (let i = 0; i < 600; i++) value = approachIntensity(value, 1, 1 / 60)
    expect(value).toBe(1)

    for (let i = 0; i < 600; i++) value = approachIntensity(value, 0, 1 / 60)
    expect(value).toBe(0)
  })
})

describe('the music never buries a cue', () => {
  it('opens the filter with intensity instead of raising the volume', () => {
    expect(musicCutoff(0)).toBe(MUSIC_CUTOFF.calm)
    expect(musicCutoff(1)).toBe(MUSIC_CUTOFF.busy)
    expect(musicCutoff(0.5)).toBeGreaterThan(MUSIC_CUTOFF.calm)
  })

  it('keeps the score inside its own bus without clipping', () => {
    const summed = Object.values(LAYER_GAIN).reduce((total, gain) => total + gain, 0)
    expect(summed).toBeLessThan(1)
  })
})

describe('the cue library', () => {
  it('rate-limits the common cues and lets the rare ones through', () => {
    expect(CUES.hit.minInterval).toBeGreaterThan(0)
    expect(CUES.kill.minInterval).toBeGreaterThan(0)
    expect(CUES.block.minInterval).toBeGreaterThan(0)

    expect(CUES.flare.minInterval).toBe(0)
    expect(CUES.cleared.minInterval).toBe(0)
    expect(CUES.lost.minInterval).toBe(0)
  })

  it('makes the objective being hit audible under everything else', () => {
    expect(CUES.sunHit.frequency).toBeLessThan(CUES.hit.frequency)
    expect(CUES.sunHit.gain).toBeGreaterThan(CUES.hit.gain)
  })

  it('leaves headroom on every cue', () => {
    for (const [name, cue] of Object.entries(CUES)) {
      expect(cue.gain, name).toBeGreaterThan(0)
      expect(cue.gain, name).toBeLessThanOrEqual(0.75)
    }
  })

  it('has no cue that fires as often as a conjunction', () => {
    for (const [name, cue] of Object.entries(CUES)) {
      if (cue.minInterval === 0) continue
      expect(cue.attack + cue.release, `${name} outlives its own rate limit`)
        .toBeLessThanOrEqual(cue.minInterval * 6)
    }
  })
})

describe('silence is a supported outcome', () => {
  it('answers every call without an audio context', () => {
    const audio = createSilentAudio()

    expect(() => {
      audio.play('flare')
      audio.update({ dt: 0.016, contacts: 10, outputFraction: 0.5, running: true })
      audio.applySettings(createDefaultSave(0).settings)
      audio.resume()
      audio.destroy()
    }).not.toThrow()

    expect(audio.stats.voices).toBe(0)
  })
})

describe('the score', () => {
  it('runs at the measured tempo', () => {
    expect(TEMPO_BPM).toBeGreaterThanOrEqual(128)
    expect(TEMPO_BPM).toBeLessThanOrEqual(136)
    expect(SECONDS_PER_EIGHTH).toBeCloseTo(0.227, 3)
  })

  it('loops long enough not to announce itself', () => {
    const loopSeconds = PROGRESSION.length * 4 * (60 / TEMPO_BPM)
    expect(loopSeconds).toBeGreaterThan(12)
  })

  it('wraps the progression rather than running off it', () => {
    expect(chordAtBar(0)).toBe(chordAtBar(PROGRESSION.length))
    expect(chordAtBar(-1)).toBe(PROGRESSION[PROGRESSION.length - 1])
    expect(chordAtBar(1e6)).toBeDefined()
  })

  it('keeps the arpeggio inside its own chord', () => {
    for (let bar = 0; bar < PROGRESSION.length; bar++) {
      const chord = chordAtBar(bar)
      const allowed = new Set(chordFrequencies(chord, 2).map((f) => f.toFixed(3)))

      for (let eighth = 0; eighth < ARP_PATTERN.length; eighth++) {
        expect(allowed.has(arpFrequency(eighth, chord).toFixed(3)), `bar ${bar}`).toBe(true)
      }
    }
  })

  it('puts the bass under the pad and the arp above it', () => {
    const chord = chordAtBar(0)
    const pad = chordFrequencies(chord)

    expect(bassFrequency(chord)).toBeLessThan(Math.min(...pad))
    expect(arpFrequency(0, chord)).toBeGreaterThan(Math.max(...pad))
  })

  it('layers in as the field gets busy, the way the reference does', () => {
    const calm = activeLayers(0, new Set())
    expect([...calm]).toEqual(['pad'])

    const busy = activeLayers(1, calm)
    expect(busy.has('bass')).toBe(true)
    expect(busy.has('arp')).toBe(true)
  })

  it('does not flicker a layer around its threshold', () => {
    const { on, off } = LAYER_THRESHOLDS.arp
    expect(off).toBeLessThan(on)

    const engaged = activeLayers(on + 0.01, new Set(['pad']))
    expect(engaged.has('arp')).toBe(true)

    const held = activeLayers((on + off) / 2, engaged)
    expect(held.has('arp')).toBe(true)

    const gone = activeLayers(off - 0.01, held)
    expect(gone.has('arp')).toBe(false)
  })
})
