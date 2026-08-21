import type { UpgradeNodeDef } from '../entities/Upgrade'

/**
 * The Escapement Tree.
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
 * Voices follow narrative.md: Winding is the Manual, terse. Bracing is the
 * Undermaster. Salvage is Sabel Ock, dry to the point of rudeness. Regulation
 * is the Manual's marginalia — later hands correcting earlier ones.
 */

export const UPGRADE_NODES: readonly UpgradeNodeDef[] = [
  // ---- Winding: offence. The Manual, imperative and terse. ----
  {
    id: 'winding-tension-of-the-stroke',
    name: 'Tension of the Stroke',
    description: 'Wind harder. The stroke carries what you put into it.',
    branch: 'winding',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'attack', magnitude: 0.08 }],
  },
  {
    id: 'winding-shortened-escape',
    name: 'Shortened Escape',
    description: 'Less travel between strokes. Nothing else changes.',
    branch: 'winding',
    tier: 2,
    requires: ['winding-tension-of-the-stroke'],
    baseCost: 6,
    effects: [{ kind: 'haste', magnitude: 0.1 }],
  },
  {
    id: 'winding-sympathetic-stroke',
    name: 'Sympathetic Stroke',
    description:
      'Two mechanisms in agreement do more than twice one. The Manual does ' +
      'not explain this and does not appear to consider it remarkable.',
    branch: 'winding',
    tier: 3,
    requires: ['winding-shortened-escape'],
    baseCost: 12,
    effects: [{ kind: 'conjunctionPotency', magnitude: 0.15 }],
  },

  // ---- Bracing: defence. The Undermaster, plain and responsible. ----
  {
    id: 'bracing-deeper-winding',
    name: 'Deeper Winding',
    description:
      'The Mainspring holds more than it is usually asked to. We have simply ' +
      'never had cause to find out how much.',
    branch: 'bracing',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'tension', magnitude: 120 }],
  },
  {
    id: 'bracing-hardened-pallets',
    name: 'Hardened Pallets',
    description:
      'They will still fail. They will fail later, which is the whole of what ' +
      'this post can promise anyone.',
    branch: 'bracing',
    tier: 2,
    requires: ['bracing-deeper-winding'],
    baseCost: 6,
    effects: [{ kind: 'defence', magnitude: 0.12 }],
  },
  {
    id: 'bracing-broadened-guard',
    name: 'Broadened Guard',
    description:
      'A wider stance covers more of the arc. It also tires the mechanism, ' +
      'but the mechanism does not complain and neither should you.',
    branch: 'bracing',
    tier: 3,
    requires: ['bracing-hardened-pallets'],
    baseCost: 11,
    // 3°, in radians. Block arcs are 9–26°, so this is a real widening.
    effects: [{ kind: 'blockArc', magnitude: (3 * Math.PI) / 180 }],
  },

  // ---- Salvage: economy. Sabel Ock, dry to the point of rudeness. ----
  {
    id: 'salvage-swarf-discipline',
    name: 'Swarf Discipline',
    description:
      'Sweep the floor. I am aware this is beneath you. It is also where the ' +
      'brass is.',
    branch: 'salvage',
    tier: 1,
    requires: [],
    baseCost: 3,
    effects: [{ kind: 'filings', magnitude: 0.15 }],
  },
  {
    id: 'salvage-honest-accounting',
    name: 'Honest Accounting',
    description:
      'A repair costs what it costs. It has never once cost what the ' +
      'requisition said it would.',
    branch: 'salvage',
    tier: 2,
    requires: ['salvage-swarf-discipline'],
    baseCost: 7,
    effects: [{ kind: 'repairCost', magnitude: 0.15 }],
  },
  {
    id: 'salvage-the-long-view',
    name: 'The Long View',
    description:
      'You will do this again. Everyone does. The only question the logs ' +
      'settle is whether you learned anything the first time.',
    branch: 'salvage',
    tier: 3,
    requires: ['salvage-honest-accounting'],
    baseCost: 14,
    effects: [{ kind: 'recollection', magnitude: 0.2 }],
  },

  {
    id: 'salvage-the-night-shift',
    name: 'The Night Shift',
    description:
      'The floor does not stop when you do. It does not do the job well ' +
      'either, but it does it.',
    branch: 'salvage',
    tier: 4,
    requires: ['salvage-the-long-view'],
    baseCost: 18,
    // Four hours on top of the base four, doubling the window.
    effects: [{ kind: 'offlineCap', magnitude: 4 * 3600 }],
  },
  {
    id: 'salvage-standing-orders',
    name: 'Standing Orders',
    description:
      'Written so a competent Wright can follow them unsupervised. I have ' +
      'yet to meet one, but the orders are sound.',
    branch: 'salvage',
    tier: 5,
    requires: ['salvage-the-night-shift'],
    baseCost: 26,
    effects: [{ kind: 'offlineEfficiency', magnitude: 0.15 }],
  },

  // ---- Regulation: reach and readability. The Manual's marginalia. ----
  {
    id: 'regulation-second-beat',
    name: 'A Second Beat',
    description:
      'The margin here reads: "one is not enough". A later hand has added: ' +
      '"two is not either, but it is better".',
    branch: 'regulation',
    tier: 1,
    requires: [],
    baseCost: 4,
    effects: [{ kind: 'beatCharges', magnitude: 1 }],
  },
  {
    id: 'regulation-wider-report',
    name: 'Wider Report',
    description:
      'The strike carries further than the diagram shows. The diagram has ' +
      'been wrong for four hundred years and nobody has redrawn it.',
    branch: 'regulation',
    tier: 2,
    requires: ['regulation-second-beat'],
    baseCost: 8,
    effects: [{ kind: 'beatRadius', magnitude: 10 }],
  },
  {
    id: 'regulation-generous-reading',
    name: 'Generous Reading',
    description:
      'Two rings need not agree exactly to agree usefully. Annotated, in a ' +
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
