import type { ArrayDef } from '../entities/Array'

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

    attack: 11,
    defence: 4,
    baseInterval: 1,
    maxCharge: 2,

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

    attack: 12,
    maxHp: 35,
    defence: 5,
    baseInterval: 1.6,
    maxCharge: 3,
    chargeInterval: 6,

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

    attack: 10,
    defence: 5,
    baseInterval: 1.5,
    maxCharge: 3,
    chargeInterval: 6,

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
