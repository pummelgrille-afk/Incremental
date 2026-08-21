import type { ZoneDef } from '../entities/Zone'

/**
 * The progression map.
 *
 * PLACEHOLDER — Phase 33 builds all six zones from docs/design/narrative.md
 * ("Zones") with their full stage lists. Only the first zone is sketched here,
 * so core/stageLoader.ts has something real to resolve and Phase 10 has a stage
 * to load. Epigraphs are final; stage content is not.
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
    enemyPool: ['burr', 'backlash', 'drift'],
    stages: [
      {
        id: 'first-shift',
        name: 'First Shift',
        scalingIndex: 1,
        baseTension: 1000,
        keyReward: 1,
        waves: [
          { groups: [{ defId: 'burr', count: 6, delay: 0, interval: 0.8 }], gapAfter: 4 },
          {
            groups: [
              { defId: 'burr', count: 8, delay: 0, interval: 0.6 },
              { defId: 'backlash', count: 2, delay: 5, interval: 1.5 },
            ],
            gapAfter: 4,
          },
          {
            groups: [
              {
                defId: 'burr',
                count: 10,
                delay: 0,
                interval: 0.5,
                // Concentrated on one arc, so one Beat covers several at once.
                arc: { centre: 0, width: Math.PI / 3 },
              },
              { defId: 'drift', count: 1, delay: 6, interval: 0 },
            ],
            gapAfter: 6,
          },
        ],
      },
      {
        id: 'routine-maintenance',
        name: 'Routine Maintenance',
        scalingIndex: 2,
        baseTension: 1000,
        keyReward: 1,
        waves: [
          {
            groups: [
              { defId: 'burr', count: 10, delay: 0, interval: 0.5 },
              { defId: 'backlash', count: 3, delay: 4, interval: 1.2 },
            ],
            gapAfter: 4,
          },
          {
            groups: [
              { defId: 'drift', count: 2, delay: 0, interval: 2 },
              { defId: 'backlash', count: 4, delay: 3, interval: 1 },
            ],
            gapAfter: 6,
          },
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
