import type { ArrayDef } from '../entities/Array'

/**
 * Array roster.
 *
 * PLACEHOLDER — Phase 30 produces the 4–6 launch support units. One is here so
 * the Phase 10 slice can exercise the Platform/Array distinction; without it,
 * half of combat-spec.md §4 would go unvalidated until Phase 14.
 */

export const ARRAYS: readonly ArrayDef[] = [
  {
    id: 'long-baseline',
    name: 'Long Baseline',
    description:
      'Listens on a fixed schedule whether or not anything is out there, and ' +
      'answers on the same one. Reaches the whole field, which is more than ' +
      'the front line can say.',
    role: 'support',
    damageType: 'resonant',
    maxHp: 40,
    attack: 16,
    defence: 6,
    baseInterval: 1.4,
    maxCharge: 3,
    // Phase 14 balance pass: 4 s made an Array strictly better per unit of Salvage than
    // the Platforms it competes with. 6 s is the crossover where the marginal
    // value of 120 Salvage is the same either way. See docs/phases/phase-14.md.
    chargeInterval: 6,
    targeting: 'highestThreat',
    projectileSpeed: 260,
    unlockCost: 4,
  },
] as const

const BY_ID = new Map(ARRAYS.map((c) => [c.id, c]))

export function arrayById(id: string): ArrayDef | undefined {
  return BY_ID.get(id)
}
