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
        // Deliberately the gentlest stage in the zone. A new player meets it
        // with a partial formation and no upgrades, and must be able to clear
        // it without touching the Beat — the Beat is upside, never a tax
        // (combat-spec.md section 1). Guarded by tests/simulation.test.ts.
        scalingIndex: 1,
        baseTension: 1000,
        keyReward: 1,
        waves: [
          // Coverage, then a cluster worth a Beat, then both sides at once.
          evenly('burr', 10, 0.55),
          escorted('burr', 13, 'backlash', 3),
          massed('burr', 16),
        ],
      },
      {
        id: 'routine-maintenance',
        name: 'Routine Maintenance',
        scalingIndex: 2,
        baseTension: 1000,
        keyReward: 1,
        waves: [
          escorted('burr', 27, 'backlash', 9, 4),
          // Introduces the splitter: killing it early is worth more than
          // killing it late, because the children still cross the same ground.
          escorted('burr', 16, 'wear', 5, 3),
          pincer('burr', 16),
        ],
      },
      {
        id: 'noted-in-the-log',
        name: 'Noted in the Log',
        // Densities across this zone are tuned against play *with the Beat*,
        // which is worth roughly +0.5 Tension on the later stages. Measuring
        // without it — as every pass before this one did — tunes the game for
        // a player who never touches the controls.
        scalingIndex: 3,
        baseTension: 1000,
        keyReward: 1,
        waves: [
          // Shielded: chip damage is the wrong answer here.
          escorted('burr', 18, 'cant', 4, 3),
          // Orbiters cannot be waited out; they settle and keep working.
          escorted('drift', 4, 'fret', 4, 4),
          withGap(pincer('burr', 18), 6),
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
