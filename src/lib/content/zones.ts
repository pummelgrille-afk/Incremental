import type { StageDef, ZoneDef } from '../entities/Zone'
import type { AnyWaveDef } from '../entities/Wave'
import { escorted, guarded, massed, pincer, scattered, withGap } from './waves'

/**
 * The progression map — Phase 33.
 *
 * Six zones, forty stages, outward from the Sun. Names and epigraphs are
 * transcribed from docs/design/narrative.md §Zones; a test asserts they still
 * match, because the copy belongs to the design doc.
 *
 * ## The ladder, and why it is shaped like this
 *
 * Boss stages fall on `SCALING.bossInterval` — every 8th scaling index — while
 * narrative.md assigns each of the five bosses to a **zone**. Those are two
 * different things and they disagreed: with three-stage zones no boss stage
 * ever landed at a zone boundary, and Phase 32 shipped five bosses that nothing
 * could reach.
 *
 * Resolved by laying the ladder out so the two agree exactly, rather than by
 * moving the interval:
 *
 * | Zone | Stages | Boss |
 * |------|--------|------|
 * | 1 The Service Floor | 1–4 | — |
 * | 2 The Fast Orbit | 5–8 | The Backlog, at 8 |
 * | 3 The Veil | 9–16 | The Sympathetic, at 16 |
 * | 4 The Home Orbit | 17–24 | Long Wear, at 24 |
 * | 5 The Cold Line | 25–32 | The Blank Page, at 32 |
 * | 6 The Unlit Orbit | 33–40 | The Dark Watch, at 40 |
 *
 * Every boss is now the **last stage of its zone**, which is what narrative.md
 * describes and what the interval produces. Zone 1 has no boss, also as
 * narrative.md has it — the Service Floor is where the documented work is.
 *
 * The two short zones at the start are deliberate. economy-spec.md §3 puts the
 * first Rewind at around stage 8, so the first boss has to be reachable inside
 * a first run; eight stages of preamble would put it out of reach.
 *
 * ## Stage 1 to 3 are untouched
 *
 * They are tuned against measured clear rates and guarded by
 * tests/simulation.test.ts, including the hard invariant that stage 1 is
 * clearable without ever using the Flare. Everything from stage 4 outward is
 * new.
 *
 * ## Zone character
 *
 * Each zone leans on a different wave shape, so a zone is a question rather
 * than a number:
 *
 * - **1 Service Floor** — `scattered`, `escorted`. Coverage and priority.
 * - **2 Fast Orbit** — `massed`. One arc at a time; rewards a Flare and a Corona.
 * - **3 The Veil** — `pincer`. Both sides at once; punishes a lopsided field.
 * - **4 Home Orbit** — `guarded`. Wardens, so killing order starts to matter.
 * - **5 Cold Line** — everything, mixed, with the specialists arriving together.
 * - **6 Unlit Orbit** — the same, denser, on the deepest scaling indices.
 */

/** A normal stage. Boss stages are built by `bossStage`. */
function stage(
  id: string,
  name: string,
  scalingIndex: number,
  waves: readonly AnyWaveDef[],
): StageDef {
  return { id, name, scalingIndex, baseOutput: 1000, clearanceReward: 1, waves }
}

/**
 * A zone's final stage.
 *
 * One wave, one encounter — economy-spec.md §5 is explicit that a boss stage is
 * not a denser wave. `clearanceReward` is 5 rather than 1, matching
 * `CLEARANCE.bossStageFirstClear`; `clearReward` derives the real figure from
 * `isBossStage` and does not read this field, so the two are kept in step by
 * test rather than by hope.
 */
function bossStage(id: string, name: string, scalingIndex: number, bossId: string): StageDef {
  return {
    id,
    name,
    scalingIndex,
    baseOutput: 1000,
    clearanceReward: 5,
    waves: [{ bossId, gapAfter: 4 }],
  }
}

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
    enemyPool: ['skiff', 'mote', 'tender', 'lance', 'harrier', 'hulk', 'shell', 'brood', 'picket', 'warden'],
    stages: [
      {
        id: 'first-shift',
        name: 'First Shift',
        // Deliberately the gentlest stage in the game. A new player meets it
        // with a partial formation and no upgrades, and must be able to clear
        // it without touching the Flare — the Flare is upside, never a tax
        // (combat-spec.md section 1). Guarded by tests/simulation.test.ts.
        scalingIndex: 1,
        baseOutput: 1000,
        clearanceReward: 1,
        waves: [
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
        // Now 69, restoring a monotonic count ramp.
        waves: [
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
          escorted('skiff', 30, 'harrier', 4, 5),
          // The two Contacts that punish an *order* of killing. A Warden makes
          // everything around it harder to put down until it is dealt with.
          withGap(guarded('skiff', 20, 'warden', 2), 6),
        ],
      },
      stage('signed-off', 'Signed Off', 4, [
        // Opens harder than stage 3 does. The monotonic-HP-rate guard rejected
        // a Lance escort here: a Lance is fast and frail, and swapping a Shell
        // for one made the zone's fourth stage open *softer* than its third.
        escorted('skiff', 26, 'hulk', 4, 4),
        guarded('mote', 24, 'warden', 2),
        withGap(escorted('skiff', 28, 'brood', 5, 4), 5),
      ]),
    ],
  },

  {
    id: 'fast-orbit',
    name: 'The Fast Orbit',
    description:
      "Mercury's. The quickest of the four, and the one whose failure is " +
      'noticed first. Scoured smooth by eleven centuries of close work.',
    index: 1,
    epigraph:
      'The Fast Orbit has never once been stood down for maintenance. This is ' +
      'presented in the Manual as an achievement. I file it under reasons for ' +
      'the current state.',
    epigraphAttribution: 'Sabel Ock',
    scalingMultiplier: 1.05,
    enemyPool: ['skiff', 'mote', 'tender', 'lance', 'harrier', 'hulk', 'shell', 'brood'],
    requires: 'service-floor',
    stages: [
      // The zone that teaches `massed`: everything arrives on one arc, which is
      // exactly what an area strike and a splash Array are for.
      stage('close-work', 'Close Work', 5, [
        massed('skiff', 20),
        escorted('mote', 26, 'lance', 5, 4),
        withGap(massed('skiff', 26, Math.PI), 5),
      ]),
      stage('inside-the-hour', 'Inside the Hour', 6, [
        massed('mote', 28),
        escorted('skiff', 22, 'harrier', 5, 4),
        withGap(massed('tender', 10, Math.PI / 2), 5),
      ]),
      stage('never-stood-down', 'Never Stood Down', 7, [
        escorted('skiff', 24, 'hulk', 3, 5),
        massed('skiff', 30, -Math.PI / 2),
        withGap(escorted('mote', 30, 'shell', 4, 4), 6),
      ]),
      bossStage('the-backlog', 'The Backlog', 8, 'the-backlog'),
    ],
  },

  {
    id: 'the-veil',
    name: 'The Veil',
    description:
      "Venus's orbit, and nothing is seen through it. Alignments here are " +
      'recorded by instrument rather than by eye, which does not make them ' +
      'less rare — only harder to be sure of afterwards.',
    index: 2,
    epigraph:
      'Recorded a triple conjunction at the fourth hour. Second in my service. ' +
      'Sat down for it.',
    epigraphAttribution: 'Sabel Ock',
    scalingMultiplier: 1.12,
    // Wardens appear here first, two stages at a time, before the Home Orbit
    // makes them the whole question. Declared as well as spawned: the Phase 31
    // guard caught this pool missing them.
    enemyPool: ['skiff', 'mote', 'tender', 'lance', 'harrier', 'hulk', 'shell', 'brood', 'picket', 'warden'],
    requires: 'fast-orbit',
    stages: [
      // The zone that teaches `pincer`: both sides at once, which a field
      // concentrated on one arc fails however much damage it has.
      stage('by-instrument', 'By Instrument', 9, [
        pincer('skiff', 12),
        escorted('skiff', 24, 'picket', 3, 5),
        withGap(scattered('mote', 32, 0.22), 5),
      ]),
      stage('no-clear-line', 'No Clear Line', 10, [
        pincer('mote', 16),
        escorted('skiff', 26, 'shell', 4, 4),
        withGap(massed('skiff', 28), 5),
      ]),
      stage('the-fourth-hour', 'The Fourth Hour', 11, [
        escorted('skiff', 26, 'hulk', 4, 5),
        pincer('skiff', 14),
        withGap(guarded('mote', 26, 'warden', 2), 6),
      ]),
      stage('second-in-my-service', 'Second in My Service', 12, [
        pincer('tender', 8),
        escorted('mote', 30, 'harrier', 5, 4),
        withGap(escorted('skiff', 28, 'brood', 5, 4), 5),
      ]),
      stage('instrument-error', 'Instrument Error', 13, [
        massed('skiff', 30),
        pincer('skiff', 16),
        withGap(escorted('skiff', 26, 'picket', 4, 5), 6),
      ]),
      stage('nothing-to-see', 'Nothing To See', 14, [
        escorted('mote', 34, 'shell', 5, 4),
        pincer('lance', 6),
        withGap(guarded('skiff', 24, 'warden', 3), 6),
      ]),
      stage('logged-anyway', 'Logged Anyway', 15, [
        pincer('skiff', 18),
        escorted('skiff', 28, 'hulk', 5, 5),
        withGap(massed('mote', 36, Math.PI), 6),
      ]),
      bossStage('the-sympathetic', 'The Sympathetic', 16, 'the-sympathetic'),
    ],
  },

  {
    id: 'home-orbit',
    name: 'The Home Orbit',
    description:
      "Earth's, and the only one with anything on it worth the word. " +
      'Operators posted here are the ones who train the replacements, which is ' +
      'not a promotion and is not described as one.',
    index: 3,
    epigraph: 'They will send you home eventually. Nobody has ever told me what for.',
    epigraphAttribution: 'the Undermaster',
    scalingMultiplier: 1.2,
    enemyPool: ['skiff', 'mote', 'tender', 'lance', 'harrier', 'hulk', 'shell', 'brood', 'picket', 'warden'],
    requires: 'the-veil',
    stages: [
      // The zone that teaches killing order. Wardens in every stage.
      stage('the-only-one', 'The Only One', 17, [
        guarded('skiff', 24, 'warden', 2),
        escorted('skiff', 28, 'harrier', 5, 4),
        withGap(pincer('skiff', 16), 5),
      ]),
      stage('training-the-replacements', 'Training the Replacements', 18, [
        escorted('mote', 32, 'shell', 5, 4),
        guarded('skiff', 26, 'warden', 3),
        withGap(massed('tender', 12), 5),
      ]),
      stage('not-a-promotion', 'Not a Promotion', 19, [
        guarded('mote', 30, 'warden', 2),
        escorted('skiff', 26, 'picket', 5, 5),
        withGap(escorted('skiff', 30, 'brood', 6, 4), 6),
      ]),
      stage('what-for', 'What For', 20, [
        pincer('skiff', 18),
        guarded('skiff', 28, 'warden', 3),
        withGap(escorted('mote', 34, 'hulk', 5, 5), 6),
      ]),
      stage('the-long-handover', 'The Long Handover', 21, [
        escorted('skiff', 30, 'harrier', 6, 4),
        guarded('tender', 12, 'warden', 2),
        withGap(pincer('mote', 20), 6),
      ]),
      stage('someone-elses-shift', "Someone Else's Shift", 22, [
        massed('skiff', 34),
        guarded('skiff', 28, 'warden', 3),
        withGap(escorted('skiff', 30, 'shell', 6, 4), 6),
      ]),
      stage('two-centuries-of-it', 'Two Centuries of It', 23, [
        guarded('mote', 34, 'warden', 3),
        escorted('skiff', 30, 'hulk', 6, 5),
        withGap(pincer('lance', 8), 6),
      ]),
      bossStage('long-wear', 'Long Wear', 24, 'long-wear'),
    ],
  },

  {
    id: 'cold-line',
    name: 'The Cold Line',
    description:
      'Past Mars, where the charts give out and the Service continues anyway. ' +
      'Nothing here matches the Manual. The official position is that this ' +
      'stretch was surveyed and found unremarkable. Nobody believes it.',
    index: 4,
    epigraph:
      "The Manual's page for this stretch is blank. Not missing. Blank, and " +
      'bound in with the rest. Someone chose that.',
    epigraphAttribution: 'Sabel Ock',
    scalingMultiplier: 1.3,
    enemyPool: ['skiff', 'mote', 'tender', 'lance', 'harrier', 'hulk', 'shell', 'brood', 'picket', 'warden'],
    requires: 'home-orbit',
    stages: [
      // Every shape, mixed, and the specialists arrive together from here on.
      stage('off-the-charts', 'Off the Charts', 25, [
        escorted('skiff', 30, 'shell', 6, 4),
        guarded('skiff', 28, 'warden', 3),
        withGap(escorted('mote', 34, 'picket', 5, 5), 6),
      ]),
      stage('surveyed-unremarkable', 'Surveyed, Unremarkable', 26, [
        pincer('skiff', 20),
        escorted('skiff', 32, 'brood', 6, 4),
        withGap(massed('tender', 14), 6),
      ]),
      stage('nobody-believes-it', 'Nobody Believes It', 27, [
        guarded('mote', 36, 'warden', 3),
        escorted('skiff', 30, 'hulk', 6, 5),
        withGap(pincer('harrier', 6), 6),
      ]),
      stage('the-blank-stretch', 'The Blank Stretch', 28, [
        massed('skiff', 36),
        escorted('skiff', 30, 'shell', 6, 4),
        withGap(guarded('skiff', 30, 'warden', 4), 6),
      ]),
      stage('bound-in-with-the-rest', 'Bound In With the Rest', 29, [
        escorted('mote', 38, 'picket', 6, 5),
        pincer('skiff', 22),
        withGap(escorted('skiff', 32, 'hulk', 6, 5), 6),
      ]),
      stage('someone-chose-that', 'Someone Chose That', 30, [
        guarded('skiff', 32, 'warden', 4),
        massed('mote', 40, Math.PI),
        withGap(escorted('skiff', 32, 'brood', 7, 4), 6),
      ]),
      stage('continues-anyway', 'Continues Anyway', 31, [
        pincer('skiff', 24),
        escorted('skiff', 34, 'harrier', 7, 4),
        withGap(guarded('tender', 14, 'warden', 3), 6),
      ]),
      bossStage('the-blank-page', 'The Blank Page', 32, 'the-blank-page'),
    ],
  },

  {
    id: 'unlit-orbit',
    name: 'The Unlit Orbit',
    description:
      'The outermost. Dark for nine generations. Its station is intact; it ' +
      'simply has not been staffed since before the current numbering, which ' +
      'is why it has no number. Bringing it back on watch is the goal.',
    index: 5,
    epigraph:
      'There is a station past the Cold Line. It is not wrecked. It is only ' +
      'unlit. Those are different problems, and only one of them is ours.',
    epigraphAttribution: 'the Manual',
    scalingMultiplier: 1.45,
    enemyPool: ['skiff', 'mote', 'tender', 'lance', 'harrier', 'hulk', 'shell', 'brood', 'picket', 'warden'],
    requires: 'cold-line',
    stages: [
      stage('nine-generations', 'Nine Generations', 33, [
        guarded('skiff', 34, 'warden', 4),
        escorted('skiff', 34, 'shell', 7, 4),
        withGap(pincer('skiff', 26), 6),
      ]),
      stage('before-the-numbering', 'Before the Numbering', 34, [
        massed('skiff', 40),
        escorted('mote', 42, 'picket', 7, 5),
        withGap(guarded('skiff', 34, 'warden', 4), 6),
      ]),
      stage('it-is-not-wrecked', 'It Is Not Wrecked', 35, [
        pincer('skiff', 28),
        escorted('skiff', 36, 'hulk', 7, 5),
        withGap(escorted('skiff', 36, 'brood', 7, 4), 6),
      ]),
      stage('only-unlit', 'Only Unlit', 36, [
        guarded('mote', 42, 'warden', 5),
        massed('skiff', 42, Math.PI / 2),
        withGap(escorted('skiff', 36, 'harrier', 8, 4), 6),
      ]),
      stage('different-problems', 'Different Problems', 37, [
        escorted('skiff', 38, 'shell', 8, 4),
        pincer('harrier', 8),
        withGap(guarded('skiff', 36, 'warden', 5), 6),
      ]),
      stage('only-one-of-them-is-ours', 'Only One of Them Is Ours', 38, [
        massed('mote', 46),
        escorted('skiff', 38, 'picket', 8, 5),
        withGap(pincer('tender', 10), 6),
      ]),
      stage('back-on-watch', 'Back on Watch', 39, [
        guarded('skiff', 38, 'warden', 5),
        escorted('skiff', 40, 'hulk', 8, 5),
        withGap(escorted('mote', 46, 'brood', 8, 4), 6),
      ]),
      bossStage('the-dark-watch', 'The Dark Watch', 40, 'the-dark-watch'),
    ],
  },
] as const

const BY_ID = new Map(ZONES.map((z) => [z.id, z]))

export function zoneById(id: string): ZoneDef | undefined {
  return BY_ID.get(id)
}

/** The zone a new save starts in. */
export const STARTING_ZONE_ID = 'service-floor'

/** Zones in progression order. */
export function zonesInOrder(): readonly ZoneDef[] {
  return [...ZONES].sort((a, b) => a.index - b.index)
}

/** The zone that unlocks once `zoneId` is fully cleared, if any. */
export function nextZoneAfter(zoneId: string): ZoneDef | undefined {
  return ZONES.find((z) => z.requires === zoneId)
}
