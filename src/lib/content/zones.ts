import type { ZoneDef } from '../entities/Zone'
import { escorted, guarded, scattered, withGap } from './waves'

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
    // Every Contact this zone's waves may draw on. Validated against the
    // waves themselves by tests/contacts.test.ts — the field went unread for
    // twenty phases, and a declared roster nothing checks is worse than none.
    enemyPool: [
      'skiff',
      'mote',
      'tender',
      'lance',
      'harrier',
      'hulk',
      'shell',
      'brood',
      'picket',
      'warden',
    ],
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
          //
          scattered('skiff', 10, 0.55),
          escorted('skiff', 13, 'lance', 3),
          /*
           * Motes ride along with the bulk rather than replacing it. Swapping
           * them in one-for-one was tried first and the over-level guard
           * rejected it: a Mote has 7 HP against a Skiff's 12, so an all-Mote
           * wave drops below the pressure threshold and the director starts
           * adding bodies back. The wave has to keep a Skiff backbone.
           */
          escorted('skiff', 16, 'mote', 6, 0.32),
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
          // Tenders take the escort slot Lances held. A Tender is slow and
          // rigid rather than fast and erratic, so the wave asks for a
          // different damage type without asking for more damage.
          escorted('skiff', 20, 'tender', 6, 4),
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
          /*
           * The zone's last wave, and where the two Contacts that punish an
           * *order* of killing arrive: a Harrier fires on the way in rather
           * than on arrival, and a Warden makes everything around it last
           * longer until it is dealt with first.
           *
           * Two Wardens, not more. The mechanic reads at two and stops being a
           * priority call at five, when killing them is simply the whole wave.
           */
          escorted('skiff', 30, 'harrier', 4, 5),
          withGap(guarded('skiff', 20, 'warden', 2), 6),
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
