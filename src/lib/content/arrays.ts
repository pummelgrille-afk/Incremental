import type { ArrayDef } from '../entities/Array'

/**
 * The launch Array roster — Phase 30.
 *
 * Five ranged support units. PLAN.md asks for "clearly different ranged
 * behaviors", which the def could not express before this phase: it offered
 * numbers and a targeting policy, and five stat lines are not five behaviours.
 * `ShotProfile` is the one structural axis added for it, and each of its three
 * kinds has a live user here.
 *
 * ## Long Baseline's numbers are untouched
 *
 * It is the Phase 14 balance anchor. `chargeInterval` is *the* lever between
 * the two unit classes (combat-spec.md §4): 4 s makes an Array strictly better
 * per unit of Salvage than the Platforms it competes with, 6 s is the
 * crossover, 7 s tips the other way. Everything below is priced against Long
 * Baseline rather than against a fresh model, so the measurement still means
 * something.
 *
 * The rough budget each unit is authored to is `attack / chargeInterval` — the
 * charge-limited output, which is what the class is actually gated on. Long
 * Baseline sits at 16/6 = 2.67. Nothing here exceeds it by much; what differs
 * is *when* that output is worth having.
 *
 * ## What each one is for
 *
 * | | Targets | Shot | Better when |
 * |---|---------|------|-------------|
 * | Long Baseline | highestThreat | single | always adequate, never ideal |
 * | Spotter | nearest | single | leaks are reaching the inner orbits |
 * | Sounder | deepest | single | one Contact must die per volley |
 * | Transit | deepest | pierce 3 | a wave arrives on one bearing |
 * | Corona | lowestHp | burst | a wave arrives clustered |
 *
 * ## The class weakness is deliberate and shared
 *
 * Every Array is Resonant (combat-spec.md §4, not configurable), so the whole
 * class is favourable against Erratic and *unfavourable* against Seized. No
 * amount of Array investment answers a Hulk; that is what Ember and Kiln are
 * for. Five units that all shared a strength would be five units with one
 * decision between them.
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
    // Phase 14 balance pass. Do not move this without re-running it: damage
    // barely changes the outcome, because clear time is floored by the wave
    // spawn schedule. See docs/phases/phase-14.md.
    chargeInterval: 6,
    targeting: 'highestThreat',
    projectileSpeed: 260,
    shot: { kind: 'single' },
    unlockCost: 4,
  },
  {
    id: 'spotter',
    name: 'Spotter',
    description:
      'Watches the near ground and nothing else. Sabel Ock rated it the least ' +
      'impressive instrument on the rim and the one she would keep.',
    role: 'support',
    damageType: 'resonant',
    maxHp: 30,
    // 11 / 4.5 = 2.44, slightly under the Long Baseline budget. It buys
    // responsiveness rather than throughput: `nearest` plus the fastest shot
    // in the roster means the least time between a leak and an answer.
    attack: 11,
    defence: 4,
    baseInterval: 1,
    maxCharge: 2,
    // 4.5 s is the floor progression/support.ts enforces on the Recharge
    // track. Authored at the floor deliberately, so the one Array that is
    // *about* responsiveness cannot be upgraded into class dominance.
    chargeInterval: 4.5,
    targeting: 'nearest',
    projectileSpeed: 420,
    shot: { kind: 'single' },
    unlockCost: 3,
  },
  {
    id: 'sounder',
    name: 'Sounder',
    description:
      'One reading, taken slowly, and correct. Everything about it is ' +
      'arranged around not having to take a second.',
    role: 'support',
    damageType: 'resonant',
    maxHp: 50,
    // 34 / 12 = 2.83. The heaviest single hit available to the class, which is
    // the point: shieldHits discards a hit regardless of its size, so a Shell
    // is answered by magnitude and never by rate.
    attack: 34,
    defence: 8,
    baseInterval: 2.2,
    maxCharge: 2,
    chargeInterval: 12,
    targeting: 'deepest',
    projectileSpeed: 200,
    shot: { kind: 'single' },
    unlockCost: 6,
  },
  {
    id: 'transit',
    name: 'Transit',
    description:
      'Fires straight through and keeps going. Wasted on a scattered wave; ' +
      'the log records one occasion on which it was not wasted, at length.',
    role: 'support',
    damageType: 'resonant',
    // Measured per charge-second against the anchor's flat 2.67: 2.00 against
    // one Contact, 4.00 against two, 6.00 against three or more in a line.
    // Priced on the floor rather than the ceiling — a wave has to arrive on one
    // bearing for the ceiling to exist, and `scattered` waves never do.
    attack: 12,
    maxHp: 35,
    defence: 5,
    baseInterval: 1.6,
    maxCharge: 3,
    chargeInterval: 6,
    // Aims at the deepest Contact, so the shot travels back out through
    // everything behind it — which is where the pierce value comes from.
    targeting: 'deepest',
    projectileSpeed: 340,
    shot: { kind: 'pierce', targets: 3 },
    unlockCost: 7,
  },
  {
    id: 'corona',
    name: 'Corona',
    description:
      'Does not so much hit a thing as arrive near it. Rated for crowds, ' +
      'which the Manual notes is most of what there is.',
    role: 'support',
    damageType: 'resonant',
    maxHp: 35,
    // 10 / 6 = 1.67 against one Contact, plus 0.6 per neighbour in the splash.
    // Measured against the anchor's flat 2.67 per charge-second: 1.67 alone,
    // 2.67 at two (an exact tie), 3.67 at three, 5.67 at five. It loses alone
    // and only pays from three upward, which is the trade.
    attack: 10,
    defence: 5,
    baseInterval: 1.5,
    maxCharge: 3,
    chargeInterval: 6,
    // Targets the weakest rather than the biggest: finishing a wounded Contact
    // inside a cluster is what carries the splash into the rest of it.
    targeting: 'lowestHp',
    projectileSpeed: 240,
    shot: { kind: 'burst', radius: 36 },
    unlockCost: 8,
  },
] as const

const BY_ID = new Map(ARRAYS.map((a) => [a.id, a]))

export function arrayById(id: string): ArrayDef | undefined {
  return BY_ID.get(id)
}
