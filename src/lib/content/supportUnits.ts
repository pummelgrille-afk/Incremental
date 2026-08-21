import type { ChimeDef } from '../entities/Chime'

/**
 * Chime roster.
 *
 * PLACEHOLDER — Phase 30 produces the 4–6 launch support units. One is here so
 * the Phase 10 slice can exercise the Movement/Chime distinction; without it,
 * half of combat-spec.md §4 would go unvalidated until Phase 14.
 */

export const CHIMES: readonly ChimeDef[] = [
  {
    id: 'quarter-bell',
    name: 'Quarter Bell',
    description:
      'Sounds every quarter whether or not anything is listening. Reaches ' +
      'the whole floor, which is more than the front line can say.',
    role: 'support',
    damageType: 'resonant',
    maxHp: 40,
    attack: 16,
    defence: 6,
    baseInterval: 1.4,
    maxCharge: 3,
    // Phase 14 balance pass: 4 s made a Chime strictly better per Filing than
    // the Movements it competes with. 6 s is the crossover where the marginal
    // value of 120 Filings is the same either way. See docs/phases/phase-14.md.
    chargeInterval: 6,
    targeting: 'highestThreat',
    projectileSpeed: 260,
    unlockCost: 4,
  },
] as const

const BY_ID = new Map(CHIMES.map((c) => [c.id, c]))

export function chimeById(id: string): ChimeDef | undefined {
  return BY_ID.get(id)
}
