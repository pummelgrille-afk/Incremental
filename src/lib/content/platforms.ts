import type { PlatformDef } from '../entities/Platform'

const DEG = Math.PI / 180

export const PLATFORMS: readonly PlatformDef[] = [
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

    maxHp: 175,

    attack: 0,
    defence: 12,
    baseInterval: 1.4,
    angularReach: 0,
    radialReach: 0,
    targeting: 'none',

    blockArc: 28 * DEG,

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

    conjunctionEffect: { kind: 'damagePulse', magnitude: 56 },
    unlockCost: 14,
  },
] as const

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]))

export function platformById(id: string): PlatformDef | undefined {
  return BY_ID.get(id)
}

export const STARTING_PLATFORM_ID = 'bolt'
