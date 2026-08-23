import type { PlatformInstance, UnitBuffs } from '../entities/Platform'
import type { TimedBonus } from '../entities/types'
import type { SimulationState } from '../core/simulation'
import { noUpgradeEffects } from '../entities/Upgrade'

const NO_EFFECTS = noUpgradeEffects()

export type { TimedBonus }

export function createBonus(): TimedBonus {
  return { magnitude: 0, remaining: 0 }
}

export function createBuffs(): UnitBuffs {
  return { haste: createBonus(), attack: createBonus(), shield: createBonus() }
}

export function grantBonus(bonus: TimedBonus, magnitude: number, duration: number): void {
  if (magnitude < 0) throw new RangeError('buff magnitudes are non-negative')

  if (magnitude >= bonus.magnitude) {
    bonus.magnitude = magnitude
    bonus.remaining = duration
  } else {
    bonus.remaining = Math.max(bonus.remaining, duration)
  }
}

export function tickBonus(bonus: TimedBonus, dt: number): void {
  if (bonus.remaining <= 0) return

  bonus.remaining -= dt
  if (bonus.remaining <= 0) {
    bonus.remaining = 0
    bonus.magnitude = 0
  }
}

export function absorb(bonus: TimedBonus, amount: number): number {
  const absorbed = Math.min(bonus.magnitude, amount)
  bonus.magnitude -= absorbed
  if (bonus.magnitude <= 0) {
    bonus.magnitude = 0
    bonus.remaining = 0
  }
  return absorbed
}

export function clearBuffs(buffs: UnitBuffs): void {
  for (const bonus of [buffs.haste, buffs.attack, buffs.shield]) {
    bonus.magnitude = 0
    bonus.remaining = 0
  }
}

export function updateBuffs(sim: SimulationState, dt: number): void {
  for (const platform of sim.platforms) {
    tickBonus(platform.buffs.haste, dt)
    tickBonus(platform.buffs.attack, dt)
    tickBonus(platform.buffs.shield, dt)
  }
}

export function attackScaleOf(platform: PlatformInstance, effects = NO_EFFECTS): number {
  return (
    platform.levelScale *
    (1 + platform.bonuses.attack) *
    (1 + effects.attack) *
    (1 + platform.buffs.attack.magnitude)
  )
}

export function attackIntervalOf(platform: PlatformInstance, effects = NO_EFFECTS): number {
  return platform.def.baseInterval / (1 + effects.haste + platform.buffs.haste.magnitude)
}
