import type { UpgradeNodeDef } from '../entities/Upgrade'

/**
 * The Almanac — Phase 34.
 *
 * Seventy-two nodes across four branches, against the shape economy-spec.md §2
 * authors: Aperture 6 tiers, Shielding 6, Recovery 5, Regulation 5.
 *
 * ## Cost
 *
 * `baseCost` here is **before** the branch growth multiplier. `nodeCost` applies
 * `1.9 ^ (nodes already bought in this branch)`, which is what makes spreading
 * investment cheaper than driving one branch deep — a specialist build pays for
 * the privilege rather than being handed it. Base costs run 3 / 6 / 10 / 16 /
 * 24 / 36 by tier; the growth does the rest and does most of the work.
 *
 * ## Effects are additive
 *
 * Every node of the same kind sums (`effectsOf`). Multiplicative stacking across
 * seventy-two nodes compounds past any curve the balance table can hold, and
 * economy-spec.md §7 rules it out.
 *
 * ## Voices
 *
 * From narrative.md, and they are not interchangeable:
 *
 * - **Aperture** — the Manual. Terse, imperative, no adjectives.
 * - **Shielding** — the Undermaster. Plain, responsible, faintly worn down.
 * - **Recovery** — Sabel Ock. Dry to the point of rudeness.
 * - **Regulation** — the Manual's marginalia. Later hands correcting earlier
 *   ones, and not always agreeing.
 *
 * ## Regulation is the branch to protect
 *
 * It buys **reach and readability, never numbers**: Flare charges and
 * regeneration, blast radius, conjunction tolerance, preview horizon. It changes
 * how the game plays rather than how hard it hits, and economy-spec.md §2 asks
 * this phase to keep it that way. A test asserts no Regulation node grants
 * attack, haste, defence or Salvage.
 *
 * **Nothing here may grant control over ring rotation.** Rings are permanently
 * automatic (combat-spec.md §1); steering was tried and removed after the Phase
 * 10 playtest, and re-introducing it through an upgrade would re-introduce the
 * dexterity problem with it.
 */

const DEG = Math.PI / 180
const HOUR = 3600

export const UPGRADE_NODES: readonly UpgradeNodeDef[] = [
  // ===================================================================
  // Aperture — offence. The Manual: terse, imperative.
  // ===================================================================

  // ---- Tier 1 ----
  {
    id: 'aperture-force-of-the-pulse',
    name: 'Force of the Pulse',
    description: 'Open it wider. What leaves carries what you put behind it.',
    branch: 'aperture',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'attack', magnitude: 0.08 }],
  },
  {
    id: 'aperture-clean-aperture',
    name: 'Clean Aperture',
    description: 'Wipe the housing. It is not a repair. It is not optional either.',
    branch: 'aperture',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'attack', magnitude: 0.06 }],
  },
  {
    id: 'aperture-short-interval',
    name: 'Short Interval',
    description: 'Fire sooner. The wait was never doing anything.',
    branch: 'aperture',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'haste', magnitude: 0.06 }],
  },
  {
    id: 'aperture-in-agreement',
    name: 'In Agreement',
    description: 'Two emitters aligned are worth more than two emitters.',
    branch: 'aperture',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'conjunctionPotency', magnitude: 0.08 }],
  },

  // ---- Tier 2 ----
  {
    id: 'aperture-shortened-dwell',
    name: 'Shortened Dwell',
    description: 'Less time between pulses. Nothing else changes.',
    branch: 'aperture',
    tier: 2,
    requires: ['aperture-short-interval'],
    baseCost: 6,
    effects: [{ kind: 'haste', magnitude: 0.1 }],
  },
  {
    id: 'aperture-deeper-charge',
    name: 'Deeper Charge',
    description: 'Hold more before releasing. Release all of it.',
    branch: 'aperture',
    tier: 2,
    requires: ['aperture-force-of-the-pulse'],
    baseCost: 6,
    effects: [{ kind: 'attack', magnitude: 0.1 }],
  },
  {
    id: 'aperture-true-alignment',
    name: 'True Alignment',
    description: 'Square the mounts. A degree of error costs a tenth of the output.',
    branch: 'aperture',
    tier: 2,
    requires: ['aperture-clean-aperture'],
    baseCost: 6,
    effects: [{ kind: 'attack', magnitude: 0.09 }],
  },
  {
    id: 'aperture-shared-timing',
    name: 'Shared Timing',
    description: 'Set them to the same clock. Do not set them to yours.',
    branch: 'aperture',
    tier: 2,
    requires: ['aperture-in-agreement'],
    baseCost: 6,
    effects: [{ kind: 'conjunctionPotency', magnitude: 0.1 }],
  },

  // ---- Tier 3 ----
  {
    id: 'aperture-sympathetic-pulse',
    name: 'Sympathetic Pulse',
    description:
      'Two emitters in agreement do more than twice one. The Manual does ' +
      'not explain this and does not appear to consider it remarkable.',
    branch: 'aperture',
    tier: 3,
    requires: ['aperture-shortened-dwell'],
    baseCost: 12,
    effects: [{ kind: 'conjunctionPotency', magnitude: 0.15 }],
  },
  {
    id: 'aperture-no-idle-cycle',
    name: 'No Idle Cycle',
    description: 'An emitter at rest is an emitter faulted. Log it as such.',
    branch: 'aperture',
    tier: 3,
    requires: ['aperture-shortened-dwell'],
    baseCost: 10,
    effects: [{ kind: 'haste', magnitude: 0.12 }],
  },
  {
    id: 'aperture-full-bore',
    name: 'Full Bore',
    description: 'Everything the housing will pass. The housing will pass more than you think.',
    branch: 'aperture',
    tier: 3,
    requires: ['aperture-deeper-charge'],
    baseCost: 10,
    effects: [{ kind: 'attack', magnitude: 0.12 }],
  },
  {
    id: 'aperture-standing-load',
    name: 'Standing Load',
    description: 'Keep it charged between waves. The waves are not the rare part.',
    branch: 'aperture',
    tier: 3,
    requires: ['aperture-true-alignment'],
    baseCost: 10,
    effects: [
      { kind: 'attack', magnitude: 0.07 },
      { kind: 'haste', magnitude: 0.05 },
    ],
  },

  // ---- Tier 4 ----
  {
    id: 'aperture-overdrive',
    name: 'Overdrive',
    description: 'Past rated output. Rated output was set by somebody being careful.',
    branch: 'aperture',
    tier: 4,
    requires: ['aperture-full-bore'],
    baseCost: 16,
    effects: [{ kind: 'attack', magnitude: 0.15 }],
  },
  {
    id: 'aperture-continuous-fire',
    name: 'Continuous Fire',
    description: 'There is no cycle. There is one long pulse with gaps in it.',
    branch: 'aperture',
    tier: 4,
    requires: ['aperture-no-idle-cycle'],
    baseCost: 16,
    effects: [{ kind: 'haste', magnitude: 0.15 }],
  },
  {
    id: 'aperture-common-phase',
    name: 'Common Phase',
    description: 'Alignment is not a coincidence you wait for. It is a setting.',
    branch: 'aperture',
    tier: 4,
    requires: ['aperture-sympathetic-pulse'],
    baseCost: 16,
    effects: [{ kind: 'conjunctionPotency', magnitude: 0.18 }],
  },
  {
    id: 'aperture-no-slack-in-it',
    name: 'No Slack In It',
    description: 'Take up every tolerance in the assembly. Then take up the ones you left.',
    branch: 'aperture',
    tier: 4,
    requires: ['aperture-standing-load'],
    baseCost: 16,
    effects: [
      { kind: 'attack', magnitude: 0.1 },
      { kind: 'conjunctionPotency', magnitude: 0.08 },
    ],
  },

  // ---- Tier 5 ----
  {
    id: 'aperture-past-the-rating',
    name: 'Past the Rating',
    description: 'The plate gives a maximum. The plate is ninety years old.',
    branch: 'aperture',
    tier: 5,
    requires: ['aperture-overdrive'],
    baseCost: 24,
    effects: [{ kind: 'attack', magnitude: 0.18 }],
  },
  {
    id: 'aperture-no-recovery-time',
    name: 'No Recovery Time',
    description: 'It does not need to cool. Establish this before assuming otherwise.',
    branch: 'aperture',
    tier: 5,
    requires: ['aperture-continuous-fire'],
    baseCost: 24,
    effects: [{ kind: 'haste', magnitude: 0.18 }],
  },
  {
    id: 'aperture-one-instrument',
    name: 'One Instrument',
    description: 'Stop counting them separately. They stopped behaving separately.',
    branch: 'aperture',
    tier: 5,
    requires: ['aperture-common-phase'],
    baseCost: 24,
    effects: [{ kind: 'conjunctionPotency', magnitude: 0.22 }],
  },

  // ---- Tier 6 ----
  {
    id: 'aperture-nothing-held-back',
    name: 'Nothing Held Back',
    description: 'The whole of it, every time. There is no later to save for.',
    branch: 'aperture',
    tier: 6,
    requires: ['aperture-past-the-rating', 'aperture-no-recovery-time'],
    baseCost: 36,
    effects: [
      { kind: 'attack', magnitude: 0.22 },
      { kind: 'haste', magnitude: 0.12 },
    ],
  },
  {
    id: 'aperture-the-whole-array-at-once',
    name: 'The Whole Array At Once',
    description:
      'A later hand: "this is what the machine was for." An earlier one had ' +
      'written "do not".',
    branch: 'aperture',
    tier: 6,
    requires: ['aperture-one-instrument'],
    baseCost: 36,
    effects: [{ kind: 'conjunctionPotency', magnitude: 0.3 }],
  },
  {
    id: 'aperture-rated-for-it-now',
    name: 'Rated For It Now',
    description: 'Somebody re-stamped the plate. Nobody has admitted to it.',
    branch: 'aperture',
    tier: 6,
    requires: ['aperture-past-the-rating'],
    baseCost: 36,
    effects: [{ kind: 'attack', magnitude: 0.25 }],
  },

  // ===================================================================
  // Shielding — defence. The Undermaster: plain, responsible, worn down.
  // ===================================================================

  // ---- Tier 1 ----
  {
    id: 'shielding-deeper-reserves',
    name: 'Deeper Reserves',
    description:
      'The Sun holds more than it is usually asked to. We have simply ' +
      'never had cause to find out how much.',
    branch: 'shielding',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'output', magnitude: 120 }],
  },
  {
    id: 'shielding-standing-plate',
    name: 'Standing Plate',
    description: 'Bolted on last century by someone expecting worse. They were right.',
    branch: 'shielding',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'defence', magnitude: 0.08 }],
  },
  {
    id: 'shielding-wider-stance',
    name: 'Wider Stance',
    description: 'Cover a little more of the arc. It is tiring and it is the job.',
    branch: 'shielding',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'blockArc', magnitude: 2 * DEG }],
  },
  {
    id: 'shielding-margin-of-error',
    name: 'Margin of Error',
    description: 'Assume the estimate is optimistic. It has been every other time.',
    branch: 'shielding',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'output', magnitude: 90 }],
  },

  // ---- Tier 2 ----
  {
    id: 'shielding-hardened-plating',
    name: 'Hardened Plating',
    description:
      'It will still fail. It will fail later, which is the whole of what ' +
      'this post can promise anyone.',
    branch: 'shielding',
    tier: 2,
    requires: ['shielding-standing-plate'],
    baseCost: 6,
    effects: [{ kind: 'defence', magnitude: 0.12 }],
  },
  {
    id: 'shielding-second-reserve',
    name: 'Second Reserve',
    description: 'Held back for an emergency. Every shift is an emergency; use it.',
    branch: 'shielding',
    tier: 2,
    requires: ['shielding-deeper-reserves'],
    baseCost: 6,
    effects: [{ kind: 'output', magnitude: 180 }],
  },
  {
    id: 'shielding-overlapping-cover',
    name: 'Overlapping Cover',
    description: 'Where two arcs meet, nothing gets through. Arrange more meetings.',
    branch: 'shielding',
    tier: 2,
    requires: ['shielding-wider-stance'],
    baseCost: 6,
    effects: [{ kind: 'blockArc', magnitude: 2.5 * DEG }],
  },
  {
    id: 'shielding-written-down',
    name: 'Written Down',
    description: 'A procedure nobody remembers is a procedure nobody has.',
    branch: 'shielding',
    tier: 2,
    requires: ['shielding-margin-of-error'],
    baseCost: 6,
    effects: [{ kind: 'defence', magnitude: 0.09 }],
  },

  // ---- Tier 3 ----
  {
    id: 'shielding-broadened-guard',
    name: 'Broadened Guard',
    description:
      'A wider stance covers more of the arc. It also tires the mechanism, ' +
      'but the mechanism does not complain and neither should you.',
    branch: 'shielding',
    tier: 3,
    requires: ['shielding-overlapping-cover'],
    baseCost: 10,
    effects: [{ kind: 'blockArc', magnitude: 3 * DEG }],
  },
  {
    id: 'shielding-full-tank',
    name: 'Full Tank',
    description: 'Topped off at the start of every shift, whatever the last one did.',
    branch: 'shielding',
    tier: 3,
    requires: ['shielding-second-reserve'],
    baseCost: 10,
    effects: [{ kind: 'output', magnitude: 240 }],
  },
  {
    id: 'shielding-taking-it-well',
    name: 'Taking It Well',
    description: 'The platforms do not mind. I have stopped finding that reassuring.',
    branch: 'shielding',
    tier: 3,
    requires: ['shielding-hardened-plating'],
    baseCost: 10,
    effects: [{ kind: 'defence', magnitude: 0.14 }],
  },

  // ---- Tier 4 ----
  {
    id: 'shielding-worst-case-filed',
    name: 'Worst Case, Filed',
    description: 'Somebody worked out how bad it could get. They filed it and left.',
    branch: 'shielding',
    tier: 4,
    requires: ['shielding-full-tank'],
    baseCost: 16,
    effects: [{ kind: 'output', magnitude: 320 }],
  },
  {
    id: 'shielding-nothing-through',
    name: 'Nothing Through',
    description: 'The target is nothing through. The record is very little through.',
    branch: 'shielding',
    tier: 4,
    requires: ['shielding-broadened-guard'],
    baseCost: 16,
    effects: [{ kind: 'blockArc', magnitude: 3.5 * DEG }],
  },
  {
    id: 'shielding-rated-to-hold',
    name: 'Rated To Hold',
    description: 'Rated, tested, and signed. By me, which is why I mention it.',
    branch: 'shielding',
    tier: 4,
    requires: ['shielding-taking-it-well'],
    baseCost: 16,
    effects: [{ kind: 'defence', magnitude: 0.16 }],
  },

  // ---- Tier 5 ----
  {
    id: 'shielding-the-long-hold',
    name: 'The Long Hold',
    description: 'Not winning. Holding. They are different and only one is available.',
    branch: 'shielding',
    tier: 5,
    requires: ['shielding-rated-to-hold'],
    baseCost: 24,
    effects: [
      { kind: 'defence', magnitude: 0.14 },
      { kind: 'output', magnitude: 200 },
    ],
  },
  {
    id: 'shielding-deep-reserve',
    name: 'Deep Reserve',
    description: 'The number below the number. Do not tell the Service I showed you.',
    branch: 'shielding',
    tier: 5,
    requires: ['shielding-worst-case-filed'],
    baseCost: 24,
    effects: [{ kind: 'output', magnitude: 420 }],
  },
  {
    id: 'shielding-closed-arc',
    name: 'Closed Arc',
    description: 'Every bearing covered by something. It took eleven hundred years.',
    branch: 'shielding',
    tier: 5,
    requires: ['shielding-nothing-through'],
    baseCost: 24,
    effects: [{ kind: 'blockArc', magnitude: 4 * DEG }],
  },

  // ---- Tier 6 ----
  {
    id: 'shielding-still-here',
    name: 'Still Here',
    description: 'The whole of the case for this post, in two words.',
    branch: 'shielding',
    tier: 6,
    requires: ['shielding-the-long-hold', 'shielding-deep-reserve'],
    baseCost: 36,
    effects: [
      { kind: 'output', magnitude: 500 },
      { kind: 'defence', magnitude: 0.18 },
    ],
  },
  {
    id: 'shielding-nobody-notices',
    name: 'Nobody Notices',
    description:
      'A shift where nothing happened is the best work anyone here will ever ' +
      'do, and there is no way to write it up.',
    branch: 'shielding',
    tier: 6,
    requires: ['shielding-closed-arc'],
    baseCost: 36,
    effects: [{ kind: 'blockArc', magnitude: 4.5 * DEG }],
  },
  {
    id: 'shielding-signed-by-me',
    name: 'Signed By Me',
    description: 'If it fails now it fails against my name. That is the arrangement.',
    branch: 'shielding',
    tier: 6,
    requires: ['shielding-the-long-hold'],
    baseCost: 36,
    effects: [{ kind: 'defence', magnitude: 0.2 }],
  },

  // ===================================================================
  // Recovery — economy. Sabel Ock: dry to the point of rudeness.
  // ===================================================================

  // ---- Tier 1 ----
  {
    id: 'recovery-debris-discipline',
    name: 'Debris Discipline',
    description:
      'Sweep the approach lanes. I am aware this is beneath you. It is also ' +
      'where the metal is.',
    branch: 'recovery',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'salvage', magnitude: 0.15 }],
  },
  {
    id: 'recovery-count-it-twice',
    name: 'Count It Twice',
    description: 'The first count is wrong. I have never once been wrong about this.',
    branch: 'recovery',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'salvage', magnitude: 0.12 }],
  },
  {
    id: 'recovery-nothing-wasted',
    name: 'Nothing Wasted',
    description: 'Including the parts you were going to throw out. Especially those.',
    branch: 'recovery',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'repairCost', magnitude: 0.1 }],
  },
  {
    id: 'recovery-a-second-look',
    name: 'A Second Look',
    description: 'At the wreckage, not at the report. The report is somebody’s opinion.',
    branch: 'recovery',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'salvage', magnitude: 0.1 }],
  },

  // ---- Tier 2 ----
  {
    id: 'recovery-honest-accounting',
    name: 'Honest Accounting',
    description:
      'A repair costs what it costs. It has never once cost what the ' +
      'requisition said it would.',
    branch: 'recovery',
    tier: 2,
    requires: ['recovery-nothing-wasted'],
    baseCost: 6,
    effects: [{ kind: 'repairCost', magnitude: 0.15 }],
  },
  {
    id: 'recovery-sorted-by-worth',
    name: 'Sorted By Worth',
    description: 'Two piles. Most people manage one and call it tidy.',
    branch: 'recovery',
    tier: 2,
    requires: ['recovery-debris-discipline'],
    baseCost: 6,
    effects: [{ kind: 'salvage', magnitude: 0.18 }],
  },
  {
    id: 'recovery-the-night-shift',
    name: 'The Night Shift',
    description:
      'The watch does not stop when you do. It does not do the job well ' +
      'either, but it does it.',
    branch: 'recovery',
    tier: 2,
    requires: ['recovery-count-it-twice'],
    baseCost: 6,
    effects: [{ kind: 'offlineCap', magnitude: 4 * HOUR }],
  },

  // ---- Tier 3 ----
  {
    id: 'recovery-the-long-view',
    name: 'The Long View',
    description:
      'You will do this again. Everyone does. The only question the logs ' +
      'settle is whether you learned anything the first time.',
    branch: 'recovery',
    tier: 3,
    requires: ['recovery-sorted-by-worth'],
    baseCost: 12,
    effects: [{ kind: 'recollection', magnitude: 0.2 }],
  },
  {
    id: 'recovery-standing-orders',
    name: 'Standing Orders',
    description:
      'Written so a competent Operator can follow them unsupervised. I have ' +
      'yet to meet one, but the orders are sound.',
    branch: 'recovery',
    tier: 3,
    requires: ['recovery-the-night-shift'],
    baseCost: 10,
    effects: [{ kind: 'offlineEfficiency', magnitude: 0.15 }],
  },
  {
    id: 'recovery-parts-bin',
    name: 'Parts Bin',
    description: 'Everything in it was once urgent. Nothing in it was ever labelled.',
    branch: 'recovery',
    tier: 3,
    requires: ['recovery-honest-accounting'],
    baseCost: 10,
    effects: [{ kind: 'repairCost', magnitude: 0.18 }],
  },

  // ---- Tier 4 ----
  {
    id: 'recovery-the-full-inventory',
    name: 'The Full Inventory',
    description: 'Took four months. Found nine things nobody knew we had.',
    branch: 'recovery',
    tier: 4,
    requires: ['recovery-parts-bin'],
    baseCost: 16,
    effects: [{ kind: 'salvage', magnitude: 0.22 }],
  },
  {
    id: 'recovery-unattended-operation',
    name: 'Unattended Operation',
    description: 'Rated for it. Not designed for it. The distinction has never mattered.',
    branch: 'recovery',
    tier: 4,
    requires: ['recovery-standing-orders'],
    baseCost: 16,
    effects: [
      { kind: 'offlineCap', magnitude: 4 * HOUR },
      { kind: 'offlineEfficiency', magnitude: 0.1 },
    ],
  },
  {
    id: 'recovery-what-it-was-worth',
    name: 'What It Was Worth',
    description: 'Not what it cost. Those have not agreed since before my time.',
    branch: 'recovery',
    tier: 4,
    requires: ['recovery-the-long-view'],
    baseCost: 16,
    effects: [{ kind: 'recollection', magnitude: 0.25 }],
  },

  // ---- Tier 5 ----
  {
    id: 'recovery-everything-recovered',
    name: 'Everything Recovered',
    description: 'An overstatement. It is the closest anyone here has come to one.',
    branch: 'recovery',
    tier: 5,
    requires: ['recovery-the-full-inventory'],
    baseCost: 24,
    effects: [{ kind: 'salvage', magnitude: 0.28 }],
  },
  {
    id: 'recovery-worth-remembering',
    name: 'Worth Remembering',
    description:
      'Most of it is not. Sorting the two is the entire skill and nobody ' +
      'will thank you for having it.',
    branch: 'recovery',
    tier: 5,
    requires: ['recovery-what-it-was-worth'],
    baseCost: 24,
    effects: [{ kind: 'recollection', magnitude: 0.3 }],
  },
  {
    id: 'recovery-the-whole-week',
    name: 'The Whole Week',
    description: 'It will keep for a week without you. I have tested this twice.',
    branch: 'recovery',
    tier: 5,
    requires: ['recovery-unattended-operation'],
    baseCost: 24,
    effects: [
      // Six, not eight. At eight this one node was exactly half of everything
      // Recovery grants of offlineCap, which makes the other two decoration.
      { kind: 'offlineCap', magnitude: 6 * HOUR },
      { kind: 'offlineEfficiency', magnitude: 0.15 },
    ],
  },

  // ===================================================================
  // Regulation — reach and readability. The Manual's marginalia.
  // ===================================================================

  // ---- Tier 1 ----
  {
    id: 'regulation-second-flare',
    name: 'A Second Flare',
    description:
      'The margin here reads: "one is not enough". A later hand has added: ' +
      '"two is not either, but it is better".',
    branch: 'regulation',
    tier: 1,
    requires: [],
    baseCost: 4,
    effects: [{ kind: 'flareCharges', magnitude: 1 }],
  },
  {
    id: 'regulation-quicker-return',
    name: 'Quicker Return',
    description: '"It comes back faster than the page says." No signature on that one.',
    branch: 'regulation',
    tier: 1,
    requires: [],
    baseCost: 4,
    effects: [{ kind: 'flareRecharge', magnitude: 0.1 }],
  },
  {
    id: 'regulation-the-near-column',
    name: 'The Near Column',
    description: '"Read one column further ahead." Underlined, twice, by different hands.',
    branch: 'regulation',
    tier: 1,
    requires: [],
    baseCost: 4,
    effects: [{ kind: 'previewHorizon', magnitude: 60 }],
  },

  // ---- Tier 2 ----
  {
    id: 'regulation-wider-report',
    name: 'Wider Report',
    description:
      'The strike carries further than the diagram shows. The diagram has ' +
      'been wrong for four hundred years and nobody has redrawn it.',
    branch: 'regulation',
    tier: 2,
    requires: ['regulation-second-flare'],
    baseCost: 8,
    effects: [{ kind: 'flareRadius', magnitude: 10 }],
  },
  {
    id: 'regulation-shorter-wait',
    name: 'Shorter Wait',
    description: '"Do not stand there counting." Beneath it: "he was timing it."',
    branch: 'regulation',
    tier: 2,
    requires: ['regulation-quicker-return'],
    baseCost: 8,
    effects: [{ kind: 'flareRecharge', magnitude: 0.15 }],
  },
  {
    id: 'regulation-the-far-column',
    name: 'The Far Column',
    description: '"And the one after that." The hand is shakier and probably later.',
    branch: 'regulation',
    tier: 2,
    requires: ['regulation-the-near-column'],
    baseCost: 8,
    effects: [{ kind: 'previewHorizon', magnitude: 90 }],
  },

  // ---- Tier 3 ----
  {
    id: 'regulation-generous-reading',
    name: 'Generous Reading',
    description:
      'Two orbits need not agree exactly to agree usefully. Annotated, in a ' +
      'third hand: "this is either wisdom or an excuse for poor work".',
    branch: 'regulation',
    tier: 3,
    requires: ['regulation-wider-report'],
    baseCost: 15,
    // 2°, against a 6° base tolerance — a third wider, which is substantial.
    effects: [{ kind: 'conjunctionTolerance', magnitude: 2 * DEG }],
  },
  {
    id: 'regulation-a-third-flare',
    name: 'A Third Flare',
    description: '"Two is not either." The same hand, later, and no longer arguing.',
    branch: 'regulation',
    tier: 3,
    requires: ['regulation-second-flare'],
    baseCost: 15,
    effects: [{ kind: 'flareCharges', magnitude: 1 }],
  },
  {
    id: 'regulation-broader-report',
    name: 'Broader Report',
    description: '"Redraw the diagram." Nobody has. The margin is now longer than the entry.',
    branch: 'regulation',
    tier: 3,
    requires: ['regulation-shorter-wait'],
    baseCost: 15,
    effects: [{ kind: 'flareRadius', magnitude: 12 }],
  },

  // ---- Tier 4 ----
  {
    id: 'regulation-close-enough-to-count',
    name: 'Close Enough To Count',
    description: '"Within tolerance is within tolerance." Circled. Not obviously in approval.',
    branch: 'regulation',
    tier: 4,
    requires: ['regulation-generous-reading'],
    baseCost: 22,
    effects: [{ kind: 'conjunctionTolerance', magnitude: 2.5 * DEG }],
  },
  {
    id: 'regulation-the-whole-page',
    name: 'The Whole Page',
    description: '"Stop reading a column at a time." The rest of the note is missing.',
    branch: 'regulation',
    tier: 4,
    requires: ['regulation-the-far-column'],
    baseCost: 22,
    effects: [{ kind: 'previewHorizon', magnitude: 120 }],
  },
  {
    id: 'regulation-no-appreciable-wait',
    name: 'No Appreciable Wait',
    description: '"Effectively continuous." Beside it, flatly: "it is not."',
    branch: 'regulation',
    tier: 4,
    requires: ['regulation-broader-report'],
    baseCost: 22,
    effects: [{ kind: 'flareRecharge', magnitude: 0.2 }],
  },

  // ---- Tier 5 ----
  {
    id: 'regulation-a-fourth-flare',
    name: 'A Fourth Flare',
    description:
      'No annotation. Four generations of hands have left this entry alone, ' +
      'which the Service takes as agreement.',
    branch: 'regulation',
    tier: 5,
    requires: ['regulation-a-third-flare', 'regulation-no-appreciable-wait'],
    baseCost: 30,
    effects: [{ kind: 'flareCharges', magnitude: 1 }],
  },
  {
    id: 'regulation-read-the-whole-book',
    name: 'Read the Whole Book',
    description:
      '"You will not need the far pages." A later hand: "she needed them." ' +
      'A later one still: "everyone does eventually."',
    branch: 'regulation',
    tier: 5,
    requires: ['regulation-the-whole-page', 'regulation-close-enough-to-count'],
    baseCost: 30,
    effects: [
      { kind: 'previewHorizon', magnitude: 180 },
      { kind: 'conjunctionTolerance', magnitude: 2 * DEG },
    ],
  },
] as const

const BY_ID = new Map(UPGRADE_NODES.map((n) => [n.id, n]))

export function upgradeById(id: string): UpgradeNodeDef | undefined {
  return BY_ID.get(id)
}

/** Every node in a branch, in tier order. */
export function nodesInBranch(branch: UpgradeNodeDef['branch']): readonly UpgradeNodeDef[] {
  return UPGRADE_NODES.filter((n) => n.branch === branch).sort((a, b) => a.tier - b.tier)
}
