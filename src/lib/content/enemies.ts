import type { SlackDef } from '../entities/Slack'

/**
 * Slack roster.
 *
 * PLACEHOLDER — Phase 31 produces the real tiered roster (basic, elite,
 * specialist) with a unique pattern each. What is here exists so the stage
 * loader has something to resolve and Phase 10 has something to fight.
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
    patternId: 'ring-8',
    patternInterval: 4.5,
    baseDrop: 18,
    threatWeight: 1.8,
  },
] as const

const BY_ID = new Map(SLACK.map((s) => [s.id, s]))

export function slackById(id: string): SlackDef | undefined {
  return BY_ID.get(id)
}
