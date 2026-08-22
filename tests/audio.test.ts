import { describe, expect, it } from 'vitest'
import {
  approachIntensity,
  busGains,
  combatIntensity,
  droneCutoff,
  INTENSITY_FALL_PER_SECOND,
  INTENSITY_RISE_PER_SECOND,
} from '../src/lib/core/audioMix'
import {
  CONJUNCTION_CHORD,
  CUES,
  DRONE_CUTOFF,
  DRONES,
  DRONE_GAIN,
} from '../src/lib/content/audio'
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
    expect(droneCutoff(0)).toBe(DRONE_CUTOFF.calm)
    expect(droneCutoff(1)).toBe(DRONE_CUTOFF.busy)
    expect(droneCutoff(0.5)).toBeGreaterThan(DRONE_CUTOFF.calm)
  })

  it('keeps the bed quieter than the loudest cue', () => {
    const loudest = Math.max(...Object.values(CUES).map((cue) => cue.gain))
    expect(DRONE_GAIN).toBeLessThan(loudest)
  })

  it('sits the bed below the cues in pitch', () => {
    // Low enough to leave the top end, where every cue lives, entirely free.
    const highestDrone = Math.max(...DRONES.map((drone) => drone.frequency))
    expect(highestDrone).toBeLessThan(CUES.hit.frequency)
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

  it('keeps every cue short of clipping on its own', () => {
    for (const [name, cue] of Object.entries(CUES)) {
      expect(cue.gain, name).toBeGreaterThan(0)
      expect(cue.gain, name).toBeLessThan(0.5)
    }
  })

  it('grows the conjunction chord with the alignment', () => {
    // A Grand is the pay-off the whole formation puzzle is arranged for, and
    // should be heard to be a bigger event rather than a louder one.
    expect(CONJUNCTION_CHORD.major.length).toBeGreaterThan(CONJUNCTION_CHORD.minor.length)
    expect(CONJUNCTION_CHORD.grand.length).toBeGreaterThan(CONJUNCTION_CHORD.major.length)
  })

  it('tunes the chord to simple ratios', () => {
    /*
     * A conjunction is a coincidence of orbital periods, and a simple frequency
     * ratio is exactly that. 5/4 and 3/2 against the root.
     */
    const [root, third, fifth] = CONJUNCTION_CHORD.major
    expect(third / root).toBeCloseTo(1.25, 2)
    expect(fifth / root).toBeCloseTo(1.5, 2)
  })
})

describe('silence is a supported outcome', () => {
  it('answers every call without an audio context', () => {
    // Headless tests, an old browser, a locked-down device. The game must be
    // playable in silence and no caller should need a null check.
    const audio = createSilentAudio()

    expect(() => {
      audio.play('flare')
      audio.conjunction('grand')
      audio.update({ dt: 0.016, contacts: 10, outputFraction: 0.5, running: true })
      audio.applySettings(createDefaultSave(0).settings)
      audio.resume()
      audio.destroy()
    }).not.toThrow()

    expect(audio.stats.voices).toBe(0)
  })
})
