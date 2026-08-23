import type { ContactDef } from '../entities/Contact'

export const CONTACT: readonly ContactDef[] = [
  {
    id: 'skiff',
    name: 'Skiff',
    description:
      'Small, and under power the whole way in. Individually trivial; they ' +
      'have never once arrived individually.',
    tier: 'basic',
    assetKey: 'contact-2',
    armour: 'massed',
    motion: 'swarm',
    maxHp: 12,
    attack: 4,
    defence: 0,
    speed: 34,
    hurtboxRadius: 10,
    patternId: 'spread-3',
    patternInterval: 3.2,
    baseDrop: 5,
    threatWeight: 1,
  },
  {
    id: 'mote',
    name: 'Mote',
    description:
      'Too small to be worth a line in the log, and logged anyway, because ' +
      'the count is the only thing about them that matters.',
    tier: 'basic',
    assetKey: 'contact-2',
    armour: 'erratic',
    motion: 'swarm',

    maxHp: 7,
    attack: 3,
    defence: 0,
    speed: 46,
    hurtboxRadius: 8,
    patternId: 'spread-2',
    patternInterval: 2.8,
    baseDrop: 3,
    threatWeight: 0.8,
  },
  {
    id: 'tender',
    name: 'Tender',
    description:
      'Carries something. Nobody has established what, and the Manual is ' +
      'content to describe the question as outside the scope of the post.',
    tier: 'basic',
    assetKey: 'contact-2',
    armour: 'rigid',
    motion: 'drift',

    maxHp: 30,
    attack: 5,
    defence: 4,
    speed: 20,
    hurtboxRadius: 12,
    patternId: 'ring-6',
    patternInterval: 4.5,
    baseDrop: 9,
    threatWeight: 1.2,
  },

  {
    id: 'lance',
    name: 'Lance',
    description:
      'Comes down the well nose-first and does not correct. Accelerates as it ' +
      'nears the centre, in the manner of everything the Manual warns about.',
    tier: 'elite',
    assetKey: 'contact-3',
    armour: 'erratic',
    motion: 'charge',
    maxHp: 20,
    attack: 9,
    defence: 2,
    speed: 52,
    hurtboxRadius: 10,
    patternId: 'aimed-1',
    patternInterval: 2.4,
    baseDrop: 9,
    threatWeight: 2.5,
  },
  {
    id: 'harrier',
    name: 'Harrier',
    description:
      'Fires on the way in rather than on arrival, which is the entire ' +
      'difference between it and a Lance and rather more trouble than it sounds.',
    tier: 'elite',
    assetKey: 'contact-3',
    armour: 'massed',
    motion: 'charge',
    maxHp: 26,
    attack: 8,
    defence: 3,
    speed: 44,
    hurtboxRadius: 11,

    patternId: 'wall-5',
    patternInterval: 3,
    baseDrop: 12,
    threatWeight: 2.8,
  },
  {
    id: 'hulk',
    name: 'Hulk',
    description:
      'Slow, heavy, and entirely indifferent to being shot. Operator Ock ' +
      'records having watched one cross Earth orbit across a full shift.',
    tier: 'elite',
    assetKey: 'contact-3',
    armour: 'seized',
    motion: 'drift',
    maxHp: 70,
    attack: 6,
    defence: 8,
    speed: 15,
    hurtboxRadius: 15,

    patternId: 'converge-7',
    patternInterval: 5.5,
    baseDrop: 18,
    threatWeight: 1.8,
  },

  {
    id: 'shell',
    name: 'Shell',
    description:
      'Presents an angled face to whatever it is approaching, and is protected ' +
      'by the fact. Strike it square or do not bother.',
    tier: 'specialist',
    assetKey: 'contact-1',
    armour: 'rigid',
    motion: 'drift',
    maxHp: 34,
    attack: 11,
    defence: 14,
    speed: 22,
    hurtboxRadius: 12,

    patternId: 'wall-9',
    patternInterval: 4.2,
    baseDrop: 14,
    threatWeight: 2,
    traits: {
      shieldHits: 3,
    },
  },
  {
    id: 'brood',
    name: 'Brood',
    description:
      'Does not break so much as divide. The Manual notes that this was ' +
      'observed on the eleventh pass and recommends no change in procedure.',
    tier: 'specialist',
    assetKey: 'contact-1',
    armour: 'massed',
    motion: 'drift',
    maxHp: 48,
    attack: 7,
    defence: 3,
    speed: 26,
    hurtboxRadius: 13,
    patternId: 'ring-8',
    patternInterval: 5,
    baseDrop: 16,
    threatWeight: 1.5,
    traits: {
      splitsInto: { defId: 'skiff', count: 3 },
    },
  },
  {
    id: 'picket',
    name: 'Picket',
    description:
      'Takes a station at a distance and works away at the same spot ' +
      'indefinitely. Cannot be waited out; it has more time than the shift does.',
    tier: 'specialist',
    assetKey: 'contact-1',
    armour: 'erratic',
    motion: 'orbit',
    maxHp: 40,
    attack: 8,
    defence: 5,
    speed: 46,
    hurtboxRadius: 11,

    patternId: 'spiral-4',
    patternInterval: 2.6,
    baseDrop: 20,
    threatWeight: 3,
    traits: {
      orbitRadius: 205,

      vulnerableWhileTelegraphing: 2,
    },
  },
  {
    id: 'warden',
    name: 'Warden',
    description:
      'Does nothing on its own account. Everything near it is harder to ' +
      'put down, which the log records as an increase in workload rather ' +
      'than in danger.',
    tier: 'specialist',
    assetKey: 'contact-1',
    armour: 'seized',
    motion: 'drift',
    maxHp: 44,

    attack: 4,
    defence: 6,
    speed: 18,
    hurtboxRadius: 12,
    patternId: 'spiral-3',
    patternInterval: 3.4,

    baseDrop: 24,

    threatWeight: 4,
    traits: {
      wardsNearby: { radius: 110, reduction: 0.35 },
    },
  },
] as const

const BY_ID = new Map(CONTACT.map((s) => [s.id, s]))

export function contactById(id: string): ContactDef | undefined {
  return BY_ID.get(id)
}

export function contactsOfTier(tier: ContactDef['tier']): readonly ContactDef[] {
  return CONTACT.filter((c) => c.tier === tier)
}
