import type { PlatformDef } from '../entities/Platform'

/**
 * The launch roster — Phase 29.
 *
 * Ten Platforms across the four roles PLAN.md asks for. Everything here is
 * authored against the economy model in economy-spec.md §1: `unlockCost` is in
 * Clearance, which is first-clear-only and therefore a measure of content seen
 * rather than time spent.
 *
 * **The first three carry the old numbers unchanged.** Bolt, Anchor and Rake
 * are the Phase 10 starter set renamed — their stats were tuned across Phases
 * 10 to 20 against measured clear rates, and re-tuning them here would
 * invalidate every one of those measurements at the same moment as adding seven
 * unmeasured units. The names changed with the setting; the numbers did not.
 *
 * ## What this roster exists to light up
 *
 * Four things were declared but had no content using them, which is where this
 * project keeps finding bugs:
 *
 * - **`thermal`** was the only DamageType nothing dealt — and it is the sole
 *   favourable answer to `seized` armour, so a Hulk had no counter at all.
 *   Ember and Kiln deal it.
 * - **`control`** and **`support`** were UnitRoles with no members. Lantern and
 *   Spar are control; Tuner and Relay are support.
 * - **`targeting: 'none'`** was handled in ai.ts and used by nothing. Tuner
 *   uses it, and that is what makes support a role rather than a label: it
 *   deals no damage whatsoever.
 * - **`repair`** was deleted from ConjunctionEffect in Phase 18 with a note
 *   saying it could return "when Phase 29's roster is large enough to carry a
 *   healer". Tuner is the healer.
 *
 * ## The unlock curve
 *
 * Costs total 61 Clearance. A zone yields 13 (three first clears plus the
 * completion bonus), so no single zone hands over the roster; breadth arrives
 * across Phase 33's zones, roughly one tier per zone. That is the intended
 * shape — economy-spec.md §1 gates roster breadth on seeing content.
 */

const DEG = Math.PI / 180

export const PLATFORMS: readonly PlatformDef[] = [
  // ---- Free. The unit every save opens with. ----
  {
    id: 'bolt',
    name: 'Bolt',
    description:
      'Fires on schedule and does not vary. The Manual describes its ' +
      'maintenance requirement in one word: none.',
    role: 'damage',
    damageType: 'percussive',
    assetKey: 'venus',
    maxHp: 60,
    attack: 14,
    defence: 4,
    baseInterval: 1.1,
    angularReach: 32 * DEG,
    radialReach: 1,
    targeting: 'nearest',
    blockArc: 12 * DEG,
    conjunctionEffect: { kind: 'damagePulse', magnitude: 26 },
    unlockCost: 0,
  },

  // ---- Tier 1: the first things a zone's Clearance can buy. ----
  {
    id: 'anchor',
    name: 'Anchor',
    description:
      'Holds station. That is the entire function, and it performs it without ' +
      'complaint or notable incident.',
    role: 'tank',
    damageType: 'percussive',
    assetKey: 'venus',
    maxHp: 160,
    attack: 6,
    defence: 22,
    baseInterval: 1.6,
    angularReach: 22 * DEG,
    radialReach: 0,
    targeting: 'deepest',
    // A wider block arc is the whole point of an Anchor.
    blockArc: 26 * DEG,
    conjunctionEffect: { kind: 'shield', magnitude: 40, duration: 5 },
    unlockCost: 2,
  },
  {
    id: 'rake',
    name: 'Rake',
    description:
      'Cuts across the lane rather than down it. Effective against anything ' +
      'that arrives in quantity, which is most things.',
    role: 'damage',
    damageType: 'shear',
    assetKey: 'mercury',
    maxHp: 45,
    attack: 9,
    defence: 2,
    baseInterval: 0.65,
    angularReach: 40 * DEG,
    radialReach: 1,
    targeting: 'lowestHp',
    blockArc: 9 * DEG,
    conjunctionEffect: { kind: 'haste', magnitude: 0.6, duration: 4 },
    unlockCost: 3,
  },
  {
    id: 'ember',
    name: 'Ember',
    description:
      'Runs hot and stays hot. Deliberately cheap: nothing else this early ' +
      'troubles a Hulk at all, and the Manual is clear that waiting one out ' +
      'is not a procedure.',
    role: 'damage',
    damageType: 'thermal',
    assetKey: 'mars',
    maxHp: 50,
    // Quicker and wider than a Bolt, and frailer. The first draft was strictly
    // worse than the free unit on every stat and carried a price of 4, which a
    // roster test caught: a favourable damage type is a reason to field a unit
    // in one matchup, never a reason to buy one that loses in all the others.
    attack: 10,
    defence: 3,
    baseInterval: 0.8,
    angularReach: 34 * DEG,
    radialReach: 1,
    targeting: 'nearest',
    blockArc: 10 * DEG,
    conjunctionEffect: { kind: 'damagePulse', magnitude: 20 },
    unlockCost: 4,
  },

  // ---- Tier 2: the mid roster. ----
  {
    id: 'ballast',
    name: 'Ballast',
    description:
      'An Anchor that traded some of its patience for an edge. Holds nearly ' +
      'as well and objects rather more.',
    role: 'tank',
    damageType: 'shear',
    assetKey: 'mercury',
    maxHp: 145,
    /*
     * Raised from 7 in Phase 35. Its description calls it "an Anchor that
     * traded some of its patience for an edge", and the dominance check found
     * it had traded the patience without getting the edge: an Anchor beat it on
     * body, defence and block arc, and a Tuner out-blocked it too. Nine gives
     * it the best damage of anything that can hold a line, which is the unit
     * the description is describing.
     */
    attack: 9,
    defence: 18,
    baseInterval: 1.5,
    angularReach: 24 * DEG,
    radialReach: 0,
    targeting: 'deepest',
    blockArc: 24 * DEG,
    conjunctionEffect: { kind: 'shield', magnitude: 34, duration: 5 },
    unlockCost: 5,
  },
  {
    id: 'lantern',
    name: 'Lantern',
    description:
      'Covers more of the arc than anything else on the orbit, and covers it ' +
      'thinly. Sabel Ock, in the margin: a wide light is still a light.',
    role: 'control',
    damageType: 'resonant',
    assetKey: 'earth',
    maxHp: 70,
    attack: 8,
    defence: 6,
    baseInterval: 1.3,
    // The widest reach in the roster. Its whole case.
    angularReach: 58 * DEG,
    radialReach: 1,
    targeting: 'nearest',
    blockArc: 14 * DEG,
    conjunctionEffect: { kind: 'haste', magnitude: 0.45, duration: 5 },
    unlockCost: 6,
  },
  {
    id: 'kiln',
    name: 'Kiln',
    description:
      'Slow, and does not need to be quick. One Kiln strike carries more than ' +
      'four of anything else, which is the only argument a Shell understands.',
    role: 'damage',
    damageType: 'thermal',
    assetKey: 'mars',
    maxHp: 90,
    // Big and slow on purpose: shieldHits discards a hit regardless of its
    // size, so hit *size* counters a Shell and hit *rate* does not.
    attack: 30,
    defence: 8,
    baseInterval: 2.4,
    angularReach: 20 * DEG,
    radialReach: 1,
    targeting: 'deepest',
    blockArc: 16 * DEG,
    conjunctionEffect: { kind: 'damagePulse', magnitude: 48 },
    unlockCost: 7,
  },

  // ---- Tier 3: late roster. Expensive, and shaped rather than strong. ----
  {
    id: 'spar',
    name: 'Spar',
    description:
      'Reaches two orbits out. Sited on Mercury it can still trouble ' +
      'something crossing Earth, which reads better in the log than it ' +
      'usually looks from the rail.',
    role: 'control',
    damageType: 'percussive',
    assetKey: 'venus',
    maxHp: 100,
    attack: 12,
    defence: 10,
    baseInterval: 1.5,
    angularReach: 18 * DEG,
    // The only unit that reaches two orbits outward.
    radialReach: 2,
    targeting: 'deepest',
    blockArc: 20 * DEG,
    conjunctionEffect: { kind: 'shield', magnitude: 26, duration: 5 },
    unlockCost: 9,
  },
  {
    id: 'tuner',
    name: 'Tuner',
    description:
      'Carries no weapon of any kind. It is on the orbit to take hits meant ' +
      'for something else, and to put the line back together afterwards.',
    role: 'support',
    damageType: 'resonant',
    assetKey: 'earth',
    /*
     * The largest body and the widest block arc in the roster, which is what
     * its description already claimed and its numbers did not deliver.
     *
     * Phase 35's dominance check found an Anchor strictly better than a Tuner
     * on every axis and at a fifth of the price — leaving the Tuner justified
     * only by its conjunction effect, which is a thin case for an 11-Clearance
     * unit. A unit whose stated job is soaking hits meant for something else
     * has to actually be the best at that.
     */
    maxHp: 175,
    // Genuinely zero. A support unit that also deals damage is a damage unit
    // with a smaller number, and the role would mean nothing.
    attack: 0,
    defence: 12,
    baseInterval: 1.4,
    angularReach: 0,
    radialReach: 0,
    targeting: 'none',
    // Its only contribution outside a conjunction, and now the widest.
    blockArc: 28 * DEG,
    // The one effect that reaches past the unit that brought it.
    conjunctionEffect: { kind: 'repair', magnitude: 22 },
    unlockCost: 11,
  },
  {
    id: 'relay',
    name: 'Relay',
    description:
      'Weak alone, and not intended to be alone. Everything it is worth, it ' +
      'is worth in alignment.',
    role: 'support',
    damageType: 'resonant',
    assetKey: 'earth',
    maxHp: 55,
    attack: 7,
    defence: 4,
    baseInterval: 1.2,
    angularReach: 36 * DEG,
    radialReach: 1,
    targeting: 'highestThreat',
    blockArc: 10 * DEG,
    /*
     * The largest pulse in the roster, on the weakest body in it — and at 44
     * it was not, because a Kiln carries 48 at half the price. The whole case
     * for an 11-Clearance unit with 55 HP is that its alignment payload leads
     * the game, so it has to actually lead it.
     */
    conjunctionEffect: { kind: 'damagePulse', magnitude: 56 },
    unlockCost: 14,
  },
] as const

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]))

export function platformById(id: string): PlatformDef | undefined {
  return BY_ID.get(id)
}

/** Granted on a new save so the field is never empty. */
export const STARTING_PLATFORM_ID = 'bolt'
