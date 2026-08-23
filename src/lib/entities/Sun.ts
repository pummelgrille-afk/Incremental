import type { Damageable } from './types'

export interface SunState extends Damageable {
  readonly output: number
  readonly maxOutput: number

  readonly hitboxRadius: number

  regenPerSecond: number

  shield: number

  shieldRemaining: number

  hitFlash: number

  repairsThisStage: number

  lowestFraction: number

  previousFraction: number
}

export const SUN_HITBOX_RADIUS = 28

export const REGEN_IN_COMBAT = false

export const REPAIR_FRACTION = 0.25

export const OUTPUT_THRESHOLDS = [0.5, 0.25, 0.1] as const

export function createSun(maxOutput: number): SunState {
  return {
    hp: maxOutput,
    maxHp: maxOutput,
    get output() {
      return this.hp
    },
    get maxOutput() {
      return this.maxHp
    },
    hitboxRadius: SUN_HITBOX_RADIUS,
    regenPerSecond: 0,
    shield: 0,
    shieldRemaining: 0,
    hitFlash: 0,
    repairsThisStage: 0,
    lowestFraction: 1,
    previousFraction: 1,
  }
}

export function isOverwhelmed(m: SunState): boolean {
  return m.hp <= 0
}

export function outputFraction(m: SunState): number {
  return m.maxHp > 0 ? m.hp / m.maxHp : 0
}

export function grantShield(m: SunState, amount: number, duration: number): void {
  if (amount >= m.shield) {
    m.shield = amount
    m.shieldRemaining = duration
  } else {
    m.shieldRemaining = Math.max(m.shieldRemaining, duration)
  }
}

export function repair(m: SunState): boolean {
  if (m.hp >= m.maxHp) return false
  m.hp = Math.min(m.maxHp, m.hp + m.maxHp * REPAIR_FRACTION)
  m.repairsThisStage++
  return true
}
