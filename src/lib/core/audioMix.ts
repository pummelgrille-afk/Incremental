import { DRONE_CUTOFF } from '../content/audio'
import type { Settings } from './saveSchema'

/**
 * The mix: how loud each bus is, and how busy the field is.
 *
 * Pure functions over numbers, no Web Audio — the same split `animation.ts` and
 * `backdrop.ts` use. `core/audio.ts` owns the graph; this owns the decisions,
 * so the interesting ones are testable in a plain Vitest process with no DOM
 * and no audio hardware.
 *
 * That matters here more than it looks. Getting a mix wrong is not a crash: it
 * is a Sun hit that went unheard under the music, or an achievement that
 * arrived at four times the volume of everything else, and neither is visible
 * in a stack trace.
 */

export interface BusGains {
  master: number
  music: number
  sfx: number
}

/**
 * Bus gains from the player's settings.
 *
 * `masterVolume`, `musicVolume` and `sfxVolume` have been in the save schema
 * since Phase 8 and were read by **nothing** until this phase — the same dead
 * configuration as `assetKey` before Phase 37 and the Platform colour table
 * before it. This is the function that makes them mean something.
 *
 * **The perceptual curve is applied once, at the master.** Loudness is
 * perceptual and a linear fader spends most of its travel in the top of its
 * range — at a linear 0.5 a slider sounds nearly as loud as at 1.0, which makes
 * the control feel broken — so the master is squared.
 *
 * The other two are **trims**, and are left linear. Squaring all three, which
 * is what the first version did, compounds: at the default 0.8 master and 0.8
 * SFX it cut everything to 41% before a single sound was shaped, and the
 * result measured 32 dB below full scale. Nothing was wrong with any individual
 * number; they were multiplied together four deep and nobody had measured the
 * end of the chain.
 */
export function busGains(settings: Settings): BusGains {
  const master = clamp01(settings.masterVolume)

  return {
    master: master * master,
    music: clamp01(settings.musicVolume),
    sfx: clamp01(settings.sfxVolume),
  }
}

/**
 * What the field is doing, 0 (quiet) to 1 (overwhelmed).
 *
 * Three inputs, and each earns its place:
 *
 * - **How much is on screen**, against the Contact budget. The obvious one.
 * - **How hurt the objective is.** A nearly-dead Sun with two Contacts left is
 *   not a calm moment, and a mix that treated it as one would be lying at
 *   exactly the moment the player most needs to be told.
 * - **Whether a wave is running at all.** The gap between waves is a real rest,
 *   and game-loop.md's health check asks whether a wave boundary "feels like a
 *   safe place to stop". It should sound like one.
 */
export function combatIntensity(input: {
  contacts: number
  contactBudget: number
  outputFraction: number
  running: boolean
}): number {
  if (!input.running) return 0

  const density = clamp01(input.contacts / Math.max(1, input.contactBudget * 0.35))
  // Rises as Output falls, and only starts to bite below half.
  const danger = clamp01((0.5 - clamp01(input.outputFraction)) * 2)

  // The larger of the two rather than a sum: a busy field and a wounded Sun are
  // each independently a reason to be at full intensity, and adding them would
  // saturate on a merely busy one.
  return Math.max(density, danger)
}

/**
 * How fast the mix may follow the intensity, per second.
 *
 * Slow. A mix that tracked the Contact count exactly would pump on every
 * spawn, which is the most fatiguing thing an adaptive score can do. Rising
 * faster than it falls is deliberate — arriving danger should be heard at once,
 * and the calm after should arrive gently rather than snapping back.
 */
export const INTENSITY_RISE_PER_SECOND = 0.9
export const INTENSITY_FALL_PER_SECOND = 0.25

/** Move the smoothed intensity toward a target, at the rates above. */
export function approachIntensity(current: number, target: number, dt: number): number {
  const rate = target > current ? INTENSITY_RISE_PER_SECOND : INTENSITY_FALL_PER_SECOND
  const step = rate * Math.max(0, dt)

  if (Math.abs(target - current) <= step) return target
  return current + Math.sign(target - current) * step
}

/**
 * Where the music bed's filter sits at a given intensity.
 *
 * The bed does not get *louder* with intensity, it gets **brighter**. Raising
 * the volume of a drone under a dense wave would bury the cues that matter —
 * the Sun hit above all — which is the one thing the mix must never do. Opening
 * the filter makes it feel present without taking any headroom from the top
 * end, where every cue lives.
 */
export function droneCutoff(intensity: number): number {
  const t = clamp01(intensity)
  return DRONE_CUTOFF.calm + (DRONE_CUTOFF.busy - DRONE_CUTOFF.calm) * t
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

