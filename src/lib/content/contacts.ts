import type { ContactDef } from '../entities/Contact'

/**
 * Contact roster.
 *
 * PLACEHOLDER — Phase 31 produces the real tiered roster (basic, elite,
 * specialist) with a unique pattern each. What is here exists so the stage
 * loader has something to resolve and the systems have something to fight.
 *
 * Phase 15 added the variety archetypes PLAN.md asks for, one per behavioural
 * hook, so each hook has a live user rather than being dead configuration:
 *
 *   skiff   swarm      the baseline
 *   lance   charge     fast; accelerates inside the outer orbit
 *   hulk    drift      tanky; the anvil
 *   shell   shielded   shrugs off N hits regardless of size
 *   brood   splitter   divides on death
 *   picket  orbiter    settles and circles; vulnerable while telegraphing
 *
 * Names follow narrative.md: a Contact is classed the way a watch officer
 * classes one — by silhouette, never by intent. Nothing out there has been
 * asked what it wants and nothing has volunteered.
 */

export const CONTACT: readonly ContactDef[] = [
  {
    id: 'skiff',
    name: 'Skiff',
    description:
      'Small, and under power the whole way in. Individually trivial; they ' +
      'have never once arrived individually.',
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
    id: 'lance',
    name: 'Lance',
    description:
      'Comes down the well nose-first and does not correct. Accelerates as it ' +
      'nears the centre, in the manner of everything the Manual warns about.',
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
    id: 'hulk',
    name: 'Hulk',
    description:
      'Slow, heavy, and entirely indifferent to being shot. Operator Ock ' +
      'records having watched one cross Earth orbit across a full shift.',
    armour: 'seized',
    motion: 'drift',
    maxHp: 70,
    attack: 6,
    defence: 8,
    speed: 15,
    hurtboxRadius: 15,
    // Pulls a wedge in from the rim behind it. The longest telegraph in the
    // game, because it denies the most ground.
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
    armour: 'rigid',
    motion: 'drift',
    maxHp: 34,
    attack: 11,
    defence: 14,
    speed: 22,
    hurtboxRadius: 12,
    // Lays a wall across the arc it is approaching on. Slow enough to be a
    // wall you plan around rather than one you react to.
    patternId: 'wall-9',
    patternInterval: 4.2,
    baseDrop: 14,
    threatWeight: 2,
    traits: {
      // Shielded: shrugs off the first hits regardless of size, so chip damage
      // is the wrong answer and a single heavy strike is the right one.
      shieldHits: 3,
    },
  },
  {
    id: 'brood',
    name: 'Brood',
    description:
      'Does not break so much as divide. The Manual notes that this was ' +
      'observed on the eleventh pass and recommends no change in procedure.',
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
      // Splitter: killing it far out is better than killing it late, because
      // the children still have to cross the same distance.
      splitsInto: { defId: 'skiff', count: 3 },
    },
  },
  {
    id: 'picket',
    name: 'Picket',
    description:
      'Takes a station at a distance and works away at the same spot ' +
      'indefinitely. Cannot be waited out; it has more time than the shift does.',
    armour: 'erratic',
    motion: 'orbit',
    maxHp: 40,
    attack: 8,
    defence: 5,
    speed: 46,
    hurtboxRadius: 11,
    // An orbiting emitter tracing curved arms is what a spiral actually is.
    patternId: 'spiral-4',
    patternInterval: 2.6,
    baseDrop: 20,
    threatWeight: 3,
    traits: {
      orbitRadius: 205,
      // Wide open while winding up: a player who reads the telegraph and acts
      // is rewarded, not merely spared.
      vulnerableWhileTelegraphing: 2,
    },
  },
] as const

const BY_ID = new Map(CONTACT.map((s) => [s.id, s]))

export function contactById(id: string): ContactDef | undefined {
  return BY_ID.get(id)
}
