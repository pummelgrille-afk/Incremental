import type { UpgradeNodeDef } from '../entities/Upgrade'

/**
 * The Almanac.
 *
 * PLACEHOLDER — **Phase 34 fills out the full ~72 nodes** across the tiers
 * economy-spec.md §2 authors. What is here is a starter set, three nodes per
 * branch, chosen so that:
 *
 * - every branch has a root and a two-deep chain, exercising prerequisites;
 * - every `UpgradeEffectKind` has at least one node using it, so no effect is
 *   untested configuration;
 * - each branch's identity is legible from its nodes alone.
 *
 * Voices follow narrative.md: Aperture is the Manual, terse. Shielding is the
 * Undermaster. Recovery is Sabel Ock, dry to the point of rudeness. Regulation
 * is the Manual's marginalia — later hands correcting earlier ones.
 */

export const UPGRADE_NODES: readonly UpgradeNodeDef[] = [
  // ---- Aperture: offence. The Manual, imperative and terse. ----
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
    id: 'aperture-shortened-dwell',
    name: 'Shortened Dwell',
    description: 'Less time between pulses. Nothing else changes.',
    branch: 'aperture',
    tier: 2,
    requires: ['aperture-force-of-the-pulse'],
    baseCost: 6,
    effects: [{ kind: 'haste', magnitude: 0.1 }],
  },
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

  // ---- Shielding: defence. The Undermaster, plain and responsible. ----
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
    id: 'shielding-hardened-plating',
    name: 'Hardened Plating',
    description:
      'It will still fail. It will fail later, which is the whole of what ' +
      'this post can promise anyone.',
    branch: 'shielding',
    tier: 2,
    requires: ['shielding-deeper-reserves'],
    baseCost: 6,
    effects: [{ kind: 'defence', magnitude: 0.12 }],
  },
  {
    id: 'shielding-broadened-guard',
    name: 'Broadened Guard',
    description:
      'A wider stance covers more of the arc. It also tires the mechanism, ' +
      'but the mechanism does not complain and neither should you.',
    branch: 'shielding',
    tier: 3,
    requires: ['shielding-hardened-plating'],
    baseCost: 11,
    // 3°, in radians. Block arcs are 9–26°, so this is a real widening.
    effects: [{ kind: 'blockArc', magnitude: (3 * Math.PI) / 180 }],
  },

  // ---- Recovery: economy. Sabel Ock, dry to the point of rudeness. ----
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
    id: 'recovery-honest-accounting',
    name: 'Honest Accounting',
    description:
      'A repair costs what it costs. It has never once cost what the ' +
      'requisition said it would.',
    branch: 'recovery',
    tier: 2,
    requires: ['recovery-debris-discipline'],
    baseCost: 7,
    effects: [{ kind: 'repairCost', magnitude: 0.15 }],
  },
  {
    id: 'recovery-the-long-view',
    name: 'The Long View',
    description:
      'You will do this again. Everyone does. The only question the logs ' +
      'settle is whether you learned anything the first time.',
    branch: 'recovery',
    tier: 3,
    requires: ['recovery-honest-accounting'],
    baseCost: 14,
    effects: [{ kind: 'recollection', magnitude: 0.2 }],
  },

  {
    id: 'recovery-the-night-shift',
    name: 'The Night Shift',
    description:
      'The watch does not stop when you do. It does not do the job well ' +
      'either, but it does it.',
    branch: 'recovery',
    tier: 4,
    requires: ['recovery-the-long-view'],
    baseCost: 18,
    // Four hours on top of the base four, doubling the window.
    effects: [{ kind: 'offlineCap', magnitude: 4 * 3600 }],
  },
  {
    id: 'recovery-standing-orders',
    name: 'Standing Orders',
    description:
      'Written so a competent Operator can follow them unsupervised. I have ' +
      'yet to meet one, but the orders are sound.',
    branch: 'recovery',
    tier: 5,
    requires: ['recovery-the-night-shift'],
    baseCost: 26,
    effects: [{ kind: 'offlineEfficiency', magnitude: 0.15 }],
  },

  // ---- Regulation: reach and readability. The Manual's marginalia. ----
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
    effects: [{ kind: 'conjunctionTolerance', magnitude: (2 * Math.PI) / 180 }],
  },
] as const

const BY_ID = new Map(UPGRADE_NODES.map((n) => [n.id, n]))

export function upgradeById(id: string): UpgradeNodeDef | undefined {
  return BY_ID.get(id)
}
