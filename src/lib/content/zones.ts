import type { ZoneDef } from '../entities/Zone'
import { escorted, evenly, massed, pincer, withGap } from './waves'

/**
 * The progression map.
 *
 * PLACEHOLDER — Phase 33 builds all six zones from docs/design/narrative.md
 * ("Zones") with their full stage lists. Only the first zone is sketched here.
 * Epigraphs are final copy; stage content is not.
 *
 * Waves are composed from the shapes in `waves.ts` rather than spelled out
 * inline, so a shape can be retuned once and every stage using it follows.
 */

export const ZONES: readonly ZoneDef[] = [
  {
    id: 'escapement-floor',
    name: 'The Escapement Floor',
    description:
      'Where Wrights work. Tool racks, chalked repair notes, tea going cold on ' +
      'a gear housing. The only part of the Orrery that looks lived-in.',
    index: 0,
    epigraph:
      'Start here. Everything here is documented. Nothing further in is.',
    epigraphAttribution: 'the Manual',
    scalingMultiplier: 1,
    enemyPool: ['burr', 'backlash', 'drift', 'cant', 'wear', 'fret'],
    stages: [
      {
        id: 'first-shift',
        name: 'First Shift',
        scalingIndex: 1,
        baseTension: 1000,
        keyReward: 1,
        waves: [
          // Coverage, then a cluster worth a Beat, then both sides at once.
          evenly('burr', 6, 0.8),
          escorted('burr', 8, 'backlash', 2),
          massed('burr', 10),
        ],
      },
      {
        id: 'routine-maintenance',
        name: 'Routine Maintenance',
        scalingIndex: 2,
        baseTension: 1000,
        keyReward: 1,
        waves: [
          escorted('burr', 10, 'backlash', 3, 4),
          // Introduces the splitter: killing it early is worth more than
          // killing it late, because the children still cross the same ground.
          escorted('burr', 6, 'wear', 2, 3),
          pincer('burr', 6),
        ],
      },
      {
        id: 'noted-in-the-log',
        name: 'Noted in the Log',
        scalingIndex: 3,
        baseTension: 1000,
        keyReward: 1,
        waves: [
          // Shielded: chip damage is the wrong answer here.
          escorted('burr', 8, 'cant', 2, 3),
          // Orbiters cannot be waited out; they settle and keep working.
          escorted('drift', 2, 'fret', 2, 4),
          withGap(pincer('burr', 8), 6),
        ],
      },
    ],
  },
] as const

const BY_ID = new Map(ZONES.map((z) => [z.id, z]))

export function zoneById(id: string): ZoneDef | undefined {
  return BY_ID.get(id)
}

/** The zone a new save starts in. */
export const STARTING_ZONE_ID = 'escapement-floor'
