import type { ZoneDef } from '../entities/Zone'
import { escorted, scattered, withGap } from './waves'

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
    id: 'service-floor',
    name: 'The Service Floor',
    description:
      'Where Operators work. Tool racks, chalked repair notes, tea going cold ' +
      'on a console housing. The only part of the Perihelion that looks ' +
      'lived-in.',
    index: 0,
    epigraph:
      'Start here. Everything this close in is documented. Nothing further ' +
      'out is.',
    epigraphAttribution: 'the Manual',
    scalingMultiplier: 1,
    enemyPool: ['skiff', 'lance', 'hulk', 'shell', 'brood', 'picket'],
    stages: [
      {
        id: 'first-shift',
        name: 'First Shift',
        // Deliberately the gentlest stage in the zone. A new player meets it
        // with a partial formation and no upgrades, and must be able to clear
        // it without touching the Flare — the Flare is upside, never a tax
        // (combat-spec.md section 1). Guarded by tests/simulation.test.ts.
        scalingIndex: 1,
        baseOutput: 1000,
        clearanceReward: 1,
        waves: [
          // Coverage, then an escort, then bulk. Every wave arrives on
          // randomised bearings — see the note on `scattered` in waves.ts.
          scattered('skiff', 10, 0.55),
          escorted('skiff', 13, 'lance', 3),
          scattered('skiff', 16, 0.32),
        ],
      },
      {
        id: 'routine-maintenance',
        name: 'Routine Maintenance',
        scalingIndex: 2,
        baseOutput: 1000,
        clearanceReward: 1,
        // Pulled down in Phase 20. At 89 Contact this was the densest stage in
        // the zone — denser than stage 3 — and it was the one stage that could
        // not be cleared without the Flare, which combat-spec.md §1 forbids.
        // Now 69, restoring a monotonic count ramp of 42 / 69 / 71.
        waves: [
          escorted('skiff', 20, 'lance', 6, 4),
          // Introduces the splitter: killing it early is worth more than
          // killing it late, because the children still cross the same ground.
          escorted('skiff', 13, 'brood', 4, 3),
          withGap(scattered('skiff', 26, 0.2), 5),
        ],
      },
      {
        id: 'noted-in-the-log',
        name: 'Noted in the Log',
        // Densities across this zone are tuned against play *with the Flare*,
        // which is worth roughly +0.5 Output on the later stages. Measuring
        // without it — as every pass before this one did — tunes the game for
        // a player who never touches the controls.
        scalingIndex: 3,
        baseOutput: 1000,
        clearanceReward: 1,
        waves: [
          // Shielded: chip damage is the wrong answer here.
          escorted('skiff', 18, 'shell', 4, 3),
          // Orbiters cannot be waited out; they settle and keep working.
          escorted('hulk', 4, 'picket', 4, 4),
          withGap(scattered('skiff', 36, 0.2), 6),
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
export const STARTING_ZONE_ID = 'service-floor'
