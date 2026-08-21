import { describe, expect, it } from 'vitest'
import {
  ALL_ARMOUR_CLASSES,
  ALL_DAMAGE_TYPES,
  FAVOURABLE,
  MULTIPLIER_BOUNDS,
  NEUTRAL,
  UNFAVOURABLE,
  typeMultiplier,
} from '../src/lib/content/damageTypes'
import { conjunctionScaleOf } from '../src/lib/entities/Movement'

describe('type multipliers', () => {
  it('matches the pairings in combat-spec.md §7', () => {
    expect(typeMultiplier('shear', 'massed')).toBe(FAVOURABLE)
    expect(typeMultiplier('percussive', 'rigid')).toBe(FAVOURABLE)
    expect(typeMultiplier('thermal', 'seized')).toBe(FAVOURABLE)
    expect(typeMultiplier('resonant', 'erratic')).toBe(FAVOURABLE)
  })

  it('keeps Shear and Percussive opposed', () => {
    expect(typeMultiplier('shear', 'rigid')).toBe(UNFAVOURABLE)
    expect(typeMultiplier('percussive', 'massed')).toBe(UNFAVOURABLE)
  })

  it('keeps Thermal and Resonant opposed', () => {
    // Each is weak against exactly what the other is strong against.
    expect(typeMultiplier('thermal', 'erratic')).toBe(UNFAVOURABLE)
    expect(typeMultiplier('resonant', 'seized')).toBe(UNFAVOURABLE)
  })

  it('leaves the two pairs independent of each other', () => {
    // Shear/Percussive must not interact with Seized or Erratic, and
    // Thermal/Resonant must not interact with Massed or Rigid. This is what
    // makes them two pairs rather than one four-way cycle.
    expect(typeMultiplier('shear', 'seized')).toBe(NEUTRAL)
    expect(typeMultiplier('shear', 'erratic')).toBe(NEUTRAL)
    expect(typeMultiplier('percussive', 'seized')).toBe(NEUTRAL)
    expect(typeMultiplier('percussive', 'erratic')).toBe(NEUTRAL)
    expect(typeMultiplier('thermal', 'massed')).toBe(NEUTRAL)
    expect(typeMultiplier('thermal', 'rigid')).toBe(NEUTRAL)
    expect(typeMultiplier('resonant', 'massed')).toBe(NEUTRAL)
    expect(typeMultiplier('resonant', 'rigid')).toBe(NEUTRAL)
  })

  /**
   * Invariant 3 from economy-spec.md §7. A tuning pass that widens the band
   * collapses roster diversity, so it fails here rather than in playtesting.
   */
  it('holds every multiplier inside 0.75-1.5', () => {
    for (const damage of ALL_DAMAGE_TYPES) {
      for (const armour of ALL_ARMOUR_CLASSES) {
        const m = typeMultiplier(damage, armour)
        expect(m, `${damage} vs ${armour}`).toBeGreaterThanOrEqual(MULTIPLIER_BOUNDS.min)
        expect(m, `${damage} vs ${armour}`).toBeLessThanOrEqual(MULTIPLIER_BOUNDS.max)
      }
    }
  })

  it('gives every damage type exactly one favourable and one unfavourable match', () => {
    // Two pairs, not a four-way cycle — so most waves have two workable builds.
    for (const damage of ALL_DAMAGE_TYPES) {
      const values = ALL_ARMOUR_CLASSES.map((a) => typeMultiplier(damage, a))
      expect(values.filter((v) => v === FAVOURABLE), damage).toHaveLength(1)
      expect(values.filter((v) => v === UNFAVOURABLE), damage).toHaveLength(1)
      expect(values.filter((v) => v === NEUTRAL), damage).toHaveLength(2)
    }
  })

  it('leaves no armour class immune or universally weak', () => {
    for (const armour of ALL_ARMOUR_CLASSES) {
      const values = ALL_DAMAGE_TYPES.map((d) => typeMultiplier(d, armour))
      expect(Math.max(...values), armour).toBeGreaterThan(NEUTRAL)
      expect(Math.min(...values), armour).toBeLessThan(NEUTRAL)
    }
  })
})

describe('conjunctionScaleOf', () => {
  it('scales by participant count', () => {
    expect(conjunctionScaleOf(2)).toBe('minor')
    expect(conjunctionScaleOf(3)).toBe('major')
    expect(conjunctionScaleOf(4)).toBe('grand')
    expect(conjunctionScaleOf(7)).toBe('grand')
  })
})
