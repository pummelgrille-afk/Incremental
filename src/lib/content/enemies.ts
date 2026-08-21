import type { SlackDef } from '../entities/Slack'

/**
 * Slack roster.
 *
 * PLACEHOLDER — Phase 31 produces the real tiered roster (basic, elite,
 * specialist) with a unique pattern each. What is here exists so the stage
 * loader has something to resolve and the systems have something to fight.
 *
 * Phase 15 added the variety archetypes PLAN.md asks for, one per behavioural
 * hook, so each hook has a live user rather than being dead configuration:
 *
 *   burr      swarm      the baseline
 *   backlash  charge     fast; accelerates inside the outer ring
 *   drift     drift      tanky; the anvil
 *   cant      shielded   shrugs off N hits regardless of size
 *   wear      splitter   divides on death
 *   fret      orbiter    settles and circles; vulnerable while telegraphing
 *
 * Names follow narrative.md: Slack are named for modes of mechanical decay.
 */

export const SLACK: readonly SlackDef[] = [
  {
    id: 'burr',
    name: 'Burr',
    description:
      'A rough edge that came loose and kept going. Individually trivial; ' +
      'they have never once arrived individually.',
    armour: 'massed',
    motion: 'swarm',
    maxHp: 12,
    attack: 4,
    defence: 0,
    speed: 34,
    patternId: 'spread-3',
    patternInterval: 3.2,
    baseDrop: 5,
    threatWeight: 1,
  },
  {
    id: 'backlash',
    name: 'Backlash',
    description:
      'Slack in the gear train, arriving all at once. Accelerates as it nears ' +
      'the centre, in the manner of everything the Manual warns about.',
    armour: 'erratic',
    motion: 'charge',
    maxHp: 20,
    attack: 9,
    defence: 2,
    speed: 52,
    patternId: 'aimed-1',
    patternInterval: 2.4,
    baseDrop: 9,
    threatWeight: 2.5,
  },
  {
    id: 'drift',
    name: 'Drift',
    description:
      'Slow, heavy, and entirely indifferent to being shot. Wright Ock records ' +
      'having watched one cross the Hour Ring across a full shift.',
    armour: 'seized',
    motion: 'drift',
    maxHp: 70,
    attack: 6,
    defence: 8,
    speed: 15,
    // Pulls a wedge in from the rim behind it. The longest telegraph in the
    // game, because it denies the most ground.
    patternId: 'converge-7',
    patternInterval: 5.5,
    baseDrop: 18,
    threatWeight: 1.8,
  },
  {
    id: 'cant',
    name: 'Cant',
    description:
      'Sitting at an angle it was never meant to sit at, and protected by the ' +
      'fact. Strike it square or do not bother.',
    armour: 'rigid',
    motion: 'drift',
    maxHp: 34,
    attack: 11,
    defence: 14,
    speed: 22,
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
    id: 'wear',
    name: 'Wear',
    description:
      'Does not break so much as divide. The Manual notes that this was ' +
      'observed in 1104 and recommends no change in procedure.',
    armour: 'massed',
    motion: 'drift',
    maxHp: 48,
    attack: 7,
    defence: 3,
    speed: 26,
    patternId: 'ring-8',
    patternInterval: 5,
    baseDrop: 16,
    threatWeight: 1.5,
    traits: {
      // Splitter: killing it far out is better than killing it late, because
      // the children still have to cross the same distance.
      splitsInto: { defId: 'burr', count: 3 },
    },
  },
  {
    id: 'fret',
    name: 'Fret',
    description:
      'Settles at a distance and works away at the same spot indefinitely. ' +
      'Cannot be waited out; it has more time than the shift does.',
    armour: 'erratic',
    motion: 'orbit',
    maxHp: 40,
    attack: 8,
    defence: 5,
    speed: 46,
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

const BY_ID = new Map(SLACK.map((s) => [s.id, s]))

export function slackById(id: string): SlackDef | undefined {
  return BY_ID.get(id)
}
