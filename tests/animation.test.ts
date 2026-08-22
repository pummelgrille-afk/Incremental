import { describe, expect, it } from 'vitest'
import {
  ANIMATION_STATES,
  CLIPS,
  clipDuration,
  contactState,
  frameIndex,
  MAX_ATTACK_FRAMES,
  platformState,
} from '../src/lib/core/animation'
import { spriteFrames, hasClip, isFrameKey } from '../src/lib/core/assetLoader'
import { PLATFORMS } from '../src/lib/content/platforms'
import { CONTACT } from '../src/lib/content/contacts'

describe('clip timing', () => {
  it('loops the idle and runs the rest once', () => {
    expect(CLIPS.idle.loop).toBe(true)
    for (const state of ANIMATION_STATES) {
      if (state === 'idle') continue
      expect(CLIPS[state].loop, state).toBe(false)
    }
  })

  it('finishes an attack before the fastest unit attacks again', () => {
    /*
     * Sized against the fastest thing in the game rather than the average:
     * Rake's 0.65s, halved to leave room for haste. A clip that cannot finish
     * reads as a stutter rather than as an action.
     *
     * MAX_ATTACK_FRAMES is the budget art-style.md hands to whoever draws
     * these; this is what makes it a number rather than a preference.
     */
    const fastest = Math.min(...PLATFORMS.map((p) => p.baseInterval))
    expect(clipDuration('attack', MAX_ATTACK_FRAMES)).toBeLessThanOrEqual(fastest / 2)
  })

  it('reports a clip of no frames as taking no time', () => {
    expect(clipDuration('idle', 0)).toBe(0)
  })
})

describe('picking a frame', () => {
  it('holds the only frame of a single-frame clip', () => {
    // Every unit is in this state until its art arrives, so it is the case
    // that has to be boring.
    for (const state of ANIMATION_STATES) {
      expect(frameIndex(state, 0, 1)).toBe(0)
      expect(frameIndex(state, 99, 1)).toBe(0)
    }
  })

  it('walks and wraps a looping clip', () => {
    const per = CLIPS.idle.secondsPerFrame
    expect(frameIndex('idle', 0, 4)).toBe(0)
    expect(frameIndex('idle', per * 1.5, 4)).toBe(1)
    expect(frameIndex('idle', per * 4, 4)).toBe(0)
    expect(frameIndex('idle', per * 9, 4)).toBe(1)
  })

  it('holds the last frame of a one-shot', () => {
    // What makes `death` work without anything tracking completion.
    const per = CLIPS.death.secondsPerFrame
    expect(frameIndex('death', per * 2.5, 4)).toBe(2)
    expect(frameIndex('death', per * 40, 4)).toBe(3)
  })

  it('clamps nonsense rather than throwing', () => {
    // Runs per entity per frame; a NaN upstream must not take the renderer.
    expect(frameIndex('idle', -5, 4)).toBe(0)
    expect(frameIndex('idle', Number.NaN, 4)).toBe(0)
    expect(frameIndex('idle', 1, 0)).toBe(0)
  })
})

describe('what a Contact is doing', () => {
  it('idles by default', () => {
    expect(contactState({ hitFlash: 0, telegraphRemaining: 0 })).toBe('idle')
  })

  it('shows the telegraph as the wind-up', () => {
    // combat-spec.md §6 makes the warning mandatory; the animation does the
    // same job as the ring rather than adding a second, later cue.
    expect(contactState({ hitFlash: 0, telegraphRemaining: 0.4 })).toBe('attack')
  })

  it('lets a hit interrupt the wind-up', () => {
    // Damage feedback that another state can hide is feedback the player
    // cannot rely on.
    expect(contactState({ hitFlash: 0.1, telegraphRemaining: 0.4 })).toBe('hit')
  })
})

describe('what a Platform is doing', () => {
  const base = {
    disabledFor: 0,
    hitFlash: 0,
    cooldownRemaining: 0,
    attackInterval: 1.1,
    attackFrames: 4,
  }

  it('idles between attacks', () => {
    expect(platformState({ ...base, cooldownRemaining: 0.5 })).toBe('idle')
  })

  it('reads a freshly reset cooldown as an attack', () => {
    // The cooldown is set to the full interval the moment a unit fires, so a
    // cooldown near its ceiling means it just fired. No new sim field needed.
    expect(platformState({ ...base, cooldownRemaining: 1.1 })).toBe('attack')
  })

  it('stops attacking once the clip would have finished', () => {
    const past = 1.1 - clipDuration('attack', 4) - 0.01
    expect(platformState({ ...base, cooldownRemaining: past })).toBe('idle')
  })

  it('never claims to attack when it has no attack clip', () => {
    // Otherwise a unit with only an idle would freeze on frame one of it for
    // the window instead of idling.
    expect(platformState({ ...base, cooldownRemaining: 1.1, attackFrames: 0 })).toBe('idle')
  })

  it('puts disabled above everything', () => {
    // Platforms are never destroyed — combat-spec.md §5 — so this is as close
    // to death as one gets, and it has to hold for the whole recovery.
    expect(
      platformState({ ...base, disabledFor: 8, hitFlash: 1, cooldownRemaining: 1.1 }),
    ).toBe('death')
  })
})

describe('resolving frames from the manifest', () => {
  it('falls back to the bare key for a unit with no authored frames', () => {
    // Every unit wired in Phase 37 must keep working untouched.
    for (const platform of PLATFORMS) {
      const frames = spriteFrames(platform.assetKey!, 'idle')
      expect(frames.length, platform.id).toBeGreaterThan(0)
    }
  })

  it('gives every state something to draw', () => {
    /*
     * The renderer never handles an empty clip: a state with no frames falls
     * back to idle, and idle with none falls back to the bare key.
     */
    for (const contact of CONTACT) {
      for (const state of ANIMATION_STATES) {
        expect(spriteFrames(contact.assetKey!, state).length, `${contact.id}/${state}`)
          .toBeGreaterThan(0)
      }
    }
  })

  it('returns nothing for a key with nothing staged', () => {
    expect(spriteFrames('no-such-unit', 'idle')).toEqual([])
    expect(hasClip('no-such-unit', 'attack')).toBe(false)
  })

  it('recognises a frame key', () => {
    expect(isFrameKey('bolt-attack-1')).toBe(true)
    expect(isFrameKey('contact-2-death-12')).toBe(true)
    expect(isFrameKey('bolt')).toBe(false)
    // Not a state, so it is a sprite whose name happens to have a number.
    expect(isFrameKey('contact-2')).toBe(false)
  })
})
