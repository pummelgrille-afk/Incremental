import { MUSIC_CUTOFF } from '../content/audio'
import type { Settings } from './saveSchema'

export interface BusGains {
  master: number
  music: number
  sfx: number
}

export function busGains(settings: Settings): BusGains {
  const master = clamp01(settings.masterVolume)

  return {
    master: master * master,
    music: clamp01(settings.musicVolume),
    sfx: clamp01(settings.sfxVolume),
  }
}

export function combatIntensity(input: {
  contacts: number
  contactBudget: number
  outputFraction: number
  running: boolean
}): number {
  if (!input.running) return 0

  const density = clamp01(input.contacts / Math.max(1, input.contactBudget * 0.35))

  const danger = clamp01((0.5 - clamp01(input.outputFraction)) * 2)

  return Math.max(density, danger)
}

export const INTENSITY_RISE_PER_SECOND = 0.9
export const INTENSITY_FALL_PER_SECOND = 0.25

export function approachIntensity(current: number, target: number, dt: number): number {
  const rate = target > current ? INTENSITY_RISE_PER_SECOND : INTENSITY_FALL_PER_SECOND
  const step = rate * Math.max(0, dt)

  if (Math.abs(target - current) <= step) return target
  return current + Math.sign(target - current) * step
}

export function musicCutoff(intensity: number): number {
  const t = clamp01(intensity)
  return MUSIC_CUTOFF.calm + (MUSIC_CUTOFF.busy - MUSIC_CUTOFF.calm) * t
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
