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
    // masterVolume, musicVolume and sfxVolume have been in the save schema
    // since Phase 8 and were referenced by nothing at all.
    const gains = busGains(settings({ masterVolume: 1, musicVolume: 1, sfxVolume: 1 }))
    expect(gains).toEqual({ master: 1, music: 1, sfx: 1 })
  })

  it('silences everything at zero master', () => {
    expect(busGains(settings({ masterVolume: 0 })).master).toBe(0)
  })

  it('curves the fader rather than tracking it linearly', () => {
    /*
     * Loudness is perceptual: a linear fader spends most of its travel in the
     * top of the range, so half way sounds nearly as loud as full and the
     * control feels broken.
     */
    const half = busGains(settings({ masterVolume: 0.5 })).master
    expect(half).toBeLessThan(0.5)
    expect(half).toBeCloseTo(0.25)
  })

  it('clamps nonsense rather than blasting', () => {
    // A save is repairable data, and the one failure mode worth designing
    // against here is a gain above 1 arriving from a corrupt file.
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
    // game-loop.md's health check asks whether a wave boundary feels like a
    // safe place to stop. It should sound like one.
    expect(combatIntensity({ ...quiet, contacts: 80, running: false })).toBe(0)
  })

  it('rises with what is on screen', () => {
    const empty = combatIntensity(quiet)
    const busy = combatIntensity({ ...quiet, contacts: 40 })

    expect(busy).toBeGreaterThan(empty)
  })

  it('treats a wounded objective as intense on its own', () => {
    /*
     * A nearly-dead Sun with two Contacts left is not a calm moment, and a mix
     * that said it was would be lying at exactly the moment the player most
     * needs telling.
     */
    expect(combatIntensity({ ...quiet, contacts: 2, outputFraction: 0.1 }))
      .toBeGreaterThan(0.5)
  })

  it('takes the larger of the two rather than adding them', () => {
    // Adding would saturate on a merely busy field and leave nothing to say
    // when the objective is also in trouble.
    const busy = combatIntensity({ ...quiet, contacts: 200, outputFraction: 1 })
    const both = combatIntensity({ ...quiet, contacts: 200, outputFraction: 0.05 })

    expect(busy).toBe(1)
    expect(both).toBe(1)
  })
})

describe('the mix moves slowly', () => {
  it('rises faster than it falls', () => {
    // Arriving danger should be heard at once; the calm after should arrive
    // gently rather than snapping back.
    expect(INTENSITY_RISE_PER_SECOND).toBeGreaterThan(INTENSITY_FALL_PER_SECOND)
  })

  it('never jumps to the target in one frame', () => {
    // A mix that tracked the Contact count exactly would pump on every spawn,
    // which is the most fatiguing thing an adaptive score can do.
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
    /*
     * The one thing the mix must not do. Raising the bed under a dense wave
     * would bury the Sun hit, which is the only genuinely alarming sound in the
     * game and the one that matters most exactly when the screen is least
     * readable.
     */
    expect(musicCutoff(0)).toBe(MUSIC_CUTOFF.calm)
    expect(musicCutoff(1)).toBe(MUSIC_CUTOFF.busy)
    expect(musicCutoff(0.5)).toBeGreaterThan(MUSIC_CUTOFF.calm)
  })

  it('keeps the score inside its own bus without clipping', () => {
    /*
     * Every layer can sound at once, so the invariant is on the sum.
     *
     * Note what this deliberately does *not* claim: that the score is quieter
     * than the cues. Raw gains are not comparable across a sustained triangle
     * and a lowpassed noise burst — filtered noise keeps only a fraction of its
     * energy — so that balance is settled by measuring the output, and the
     * figure is recorded in phase-41.md. Asserting it here would be asserting a
     * number that does not mean what it looks like.
     */
    const summed = Object.values(LAYER_GAIN).reduce((total, gain) => total + gain, 0)
    expect(summed).toBeLessThan(1)
  })
})

describe('the cue library', () => {
  it('rate-limits the common cues and lets the rare ones through', () => {
    /*
     * Sound accumulates where light does not: a hundred overlapping copies of
     * one click is not a loud click, it is a different noise entirely.
     */
    expect(CUES.hit.minInterval).toBeGreaterThan(0)
    expect(CUES.kill.minInterval).toBeGreaterThan(0)
    expect(CUES.block.minInterval).toBeGreaterThan(0)

    // The player's own input, and the two moments a run turns on.
    expect(CUES.flare.minInterval).toBe(0)
    expect(CUES.cleared.minInterval).toBe(0)
    expect(CUES.lost.minInterval).toBe(0)
  })

  it('makes the objective being hit audible under everything else', () => {
    // Low, and louder than the cues it has to cut through.
    expect(CUES.sunHit.frequency).toBeLessThan(CUES.hit.frequency)
    expect(CUES.sunHit.gain).toBeGreaterThan(CUES.hit.gain)
  })

  it('leaves headroom on every cue', () => {
    /*
     * A ceiling per cue, and nothing about sums.
     *
     * Adding two cues' gains would repeat the category error the bed test above
     * refuses: a lowpassed noise burst at 0.7 and a sine at 0.5 do not combine
     * to 1.2 of anything. `manualOpen` is high precisely because filtering out
     * everything above 1.2kHz throws most of white noise's energy away.
     *
     * What actually bounds the total is the sixteen-voice ceiling and the
     * measured output level, neither of which is a property of this table.
     */
    for (const [name, cue] of Object.entries(CUES)) {
      expect(cue.gain, name).toBeGreaterThan(0)
      expect(cue.gain, name).toBeLessThanOrEqual(0.75)
    }
  })

  it('has no cue that fires as often as a conjunction', () => {
    /*
     * The conjunction bell was removed after playtesting, and this is the rule
     * it broke. A full formation aligns roughly 36 times a second (Phase 40),
     * so any cue attached to that moment overlaps itself several times over
     * however loud it is — the bell's 1.6s release against a 0.35s limit meant
     * four or five ringing at once.
     *
     * The guard is general rather than about bells: no cue may have a tail
     * longer than the gap it is limited to, or it can pile up on itself.
     */
    for (const [name, cue] of Object.entries(CUES)) {
      if (cue.minInterval === 0) continue
      expect(cue.attack + cue.release, `${name} outlives its own rate limit`)
        .toBeLessThanOrEqual(cue.minInterval * 6)
    }
  })

})

describe('silence is a supported outcome', () => {
  it('answers every call without an audio context', () => {
    // Headless tests, an old browser, a locked-down device. The game must be
    // playable in silence and no caller should need a null check.
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
    // 131-134 by autocorrelation on the reference, confirmed by an eighth-note
    // spacing of 0.221s against 0.227s at 132.
    expect(TEMPO_BPM).toBeGreaterThanOrEqual(128)
    expect(TEMPO_BPM).toBeLessThanOrEqual(136)
    expect(SECONDS_PER_EIGHTH).toBeCloseTo(0.227, 3)
  })

  it('loops long enough not to announce itself', () => {
    // Four bars is 7.3s at this tempo, which a player notices inside a minute.
    const loopSeconds = PROGRESSION.length * 4 * (60 / TEMPO_BPM)
    expect(loopSeconds).toBeGreaterThan(12)
  })

  it('wraps the progression rather than running off it', () => {
    expect(chordAtBar(0)).toBe(chordAtBar(PROGRESSION.length))
    expect(chordAtBar(-1)).toBe(PROGRESSION[PROGRESSION.length - 1])
    expect(chordAtBar(1e6)).toBeDefined()
  })

  it('keeps the arpeggio inside its own chord', () => {
    /*
     * The pattern indexes the chord's voicing rather than the scale, which is
     * the difference between an arpeggio and a random walk — and the reason
     * this needs no taste to stay consonant as the progression moves.
     */
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
    // Measured on the supplied track: sub-bass 2.1% when calm, 15.2% when
    // busy. The bass is a layer that arrives, not one that gets louder.
    const calm = activeLayers(0, new Set())
    expect([...calm]).toEqual(['pad'])

    const busy = activeLayers(1, calm)
    expect(busy.has('bass')).toBe(true)
    expect(busy.has('arp')).toBe(true)
  })

  it('does not flicker a layer around its threshold', () => {
    /*
     * `combatIntensity` sits near a boundary for long stretches by design — a
     * wave that holds steady holds the intensity steady — and a layer blinking
     * in and out is worse than either state it blinks between.
     */
    const { on, off } = LAYER_THRESHOLDS.arp
    expect(off).toBeLessThan(on)

    const engaged = activeLayers(on + 0.01, new Set(['pad']))
    expect(engaged.has('arp')).toBe(true)

    // Drops back below the arrival threshold but above the departure one.
    const held = activeLayers((on + off) / 2, engaged)
    expect(held.has('arp')).toBe(true)

    const gone = activeLayers(off - 0.01, held)
    expect(gone.has('arp')).toBe(false)
  })
})
