import type { ContactDef } from '../entities/Contact'

/**
 * The Contact roster — Phase 31.
 *
 * Ten craft across the three tiers PLAN.md asks for, each with its own pattern
 * from systems/patterns.ts. The six that existed before this phase keep their
 * numbers: they were tuned against measured clear rates across Phases 15 to 20,
 * and re-tuning them in the same commit that adds four unmeasured Contacts
 * would destroy the baseline the four are judged against — the same rule Phase
 * 29 applied to Bolt and Phase 30 to Long Baseline.
 *
 * ## The tiers are mechanical, not decorative
 *
 * `tier` changes what the wave director does: the over-level bonus adds
 * **basic** Contacts only (systems/scaling.ts). A player who has out-levelled a
 * stage meets more bodies, never more set pieces — a stage whose two Shells
 * quietly became five is a different puzzle rather than a harder one.
 *
 * | Tier | Is | Answered by | Sprite |
 * |------|-----|-------------|--------|
 * | basic | fills waves | anything, in enough quantity | `contact-2` |
 * | elite | a step up in body and bite | positioning and type | `contact-3` |
 * | specialist | demands a specific answer | a particular unit or order | `contact-1` |
 *
 * **`assetKey` is per tier, not per craft, and that is interim.** Phase 38 owns
 * per-unit art; until it lands, three silhouettes across ten craft is what the
 * staged art supports, and it is what the player most needs to read anyway —
 * tier is the thing that changes how a wave must be answered. Ten identical
 * grey circles, which is what this replaces, communicated nothing at all.
 *
 * ## Coverage
 *
 * Every armour class appears in more than one tier, so no tier can be answered
 * with a single damage type:
 *
 *   massed   Skiff (basic), Harrier (elite), Brood (specialist)
 *   erratic  Mote (basic), Lance (elite), Picket (specialist)
 *   rigid    Tender (basic), Shell (specialist)
 *   seized   Hulk (elite), Warden (specialist)
 *
 * Names follow narrative.md: a Contact is classed the way a watch officer
 * classes one — by silhouette, never by intent. Nothing out there has been
 * asked what it wants and nothing has volunteered.
 */

export const CONTACT: readonly ContactDef[] = [
  // -------------------------------------------------------------- basic ---
  {
    id: 'skiff',
    name: 'Skiff',
    description:
      'Small, and under power the whole way in. Individually trivial; they ' +
      'have never once arrived individually.',
    tier: 'basic',
    assetKey: 'contact-2',
    armour: 'massed',
    motion: 'swarm',
    maxHp: 12,
    attack: 4,
    defence: 0,
    speed: 34,
    hurtboxRadius: 10,
    patternId: 'spread-3',
    patternInterval: 3.2,
    baseDrop: 5,
    threatWeight: 1,
  },
  {
    id: 'mote',
    name: 'Mote',
    description:
      'Too small to be worth a line in the log, and logged anyway, because ' +
      'the count is the only thing about them that matters.',
    tier: 'basic',
    assetKey: 'contact-2',
    armour: 'erratic',
    motion: 'swarm',
    // The frailest Contact in the game and the fastest of the basics. It exists
    // to make a wave feel like weather rather than like a list.
    maxHp: 7,
    attack: 3,
    defence: 0,
    speed: 46,
    hurtboxRadius: 8,
    patternId: 'spread-2',
    patternInterval: 2.8,
    baseDrop: 3,
    threatWeight: 0.8,
  },
  {
    id: 'tender',
    name: 'Tender',
    description:
      'Carries something. Nobody has established what, and the Manual is ' +
      'content to describe the question as outside the scope of the post.',
    tier: 'basic',
    assetKey: 'contact-2',
    armour: 'rigid',
    motion: 'drift',
    // Slow and stolid: the basic that cannot simply be swept aside, so a wave
    // of basics still has something in it worth aiming at.
    maxHp: 30,
    attack: 5,
    defence: 4,
    speed: 20,
    hurtboxRadius: 12,
    patternId: 'ring-6',
    patternInterval: 4.5,
    baseDrop: 9,
    threatWeight: 1.2,
  },

  // -------------------------------------------------------------- elite ---
  {
    id: 'lance',
    name: 'Lance',
    description:
      'Comes down the well nose-first and does not correct. Accelerates as it ' +
      'nears the centre, in the manner of everything the Manual warns about.',
    tier: 'elite',
    assetKey: 'contact-3',
    armour: 'erratic',
    motion: 'charge',
    maxHp: 20,
    attack: 9,
    defence: 2,
    speed: 52,
    hurtboxRadius: 10,
    patternId: 'aimed-1',
    patternInterval: 2.4,
    baseDrop: 9,
    threatWeight: 2.5,
  },
  {
    id: 'harrier',
    name: 'Harrier',
    description:
      'Fires on the way in rather than on arrival, which is the entire ' +
      'difference between it and a Lance and rather more trouble than it sounds.',
    tier: 'elite',
    assetKey: 'contact-3',
    armour: 'massed',
    motion: 'charge',
    maxHp: 26,
    attack: 8,
    defence: 3,
    speed: 44,
    hurtboxRadius: 11,
    // A short wall thrown from close in. Shorter telegraph than wall-9 because
    // it is fired at much closer range and a long warning would be a lie.
    patternId: 'wall-5',
    patternInterval: 3,
    baseDrop: 12,
    threatWeight: 2.8,
  },
  {
    id: 'hulk',
    name: 'Hulk',
    description:
      'Slow, heavy, and entirely indifferent to being shot. Operator Ock ' +
      'records having watched one cross Earth orbit across a full shift.',
    tier: 'elite',
    assetKey: 'contact-3',
    armour: 'seized',
    motion: 'drift',
    maxHp: 70,
    attack: 6,
    defence: 8,
    speed: 15,
    hurtboxRadius: 15,
    // Pulls a wedge in from the rim behind it. The longest telegraph in the
    // game, because it denies the most ground.
    patternId: 'converge-7',
    patternInterval: 5.5,
    baseDrop: 18,
    threatWeight: 1.8,
  },

  // --------------------------------------------------------- specialist ---
  {
    id: 'shell',
    name: 'Shell',
    description:
      'Presents an angled face to whatever it is approaching, and is protected ' +
      'by the fact. Strike it square or do not bother.',
    tier: 'specialist',
    assetKey: 'contact-1',
    armour: 'rigid',
    motion: 'drift',
    maxHp: 34,
    attack: 11,
    defence: 14,
    speed: 22,
    hurtboxRadius: 12,
    // Lays a wall across the arc it is approaching on. Slow enough to be a
    // wall you plan around rather than one you react to.
    patternId: 'wall-9',
    patternInterval: 4.2,
    baseDrop: 14,
    threatWeight: 2,
    traits: {
      // Shielded: shrugs off the first hits regardless of size, so chip damage
      // is the wrong answer and a single heavy strike is the right one.
      shieldHits: 3,
    },
  },
  {
    id: 'brood',
    name: 'Brood',
    description:
      'Does not break so much as divide. The Manual notes that this was ' +
      'observed on the eleventh pass and recommends no change in procedure.',
    tier: 'specialist',
    assetKey: 'contact-1',
    armour: 'massed',
    motion: 'drift',
    maxHp: 48,
    attack: 7,
    defence: 3,
    speed: 26,
    hurtboxRadius: 13,
    patternId: 'ring-8',
    patternInterval: 5,
    baseDrop: 16,
    threatWeight: 1.5,
    traits: {
      // Splitter: killing it far out is better than killing it late, because
      // the children still have to cross the same distance.
      splitsInto: { defId: 'skiff', count: 3 },
    },
  },
  {
    id: 'picket',
    name: 'Picket',
    description:
      'Takes a station at a distance and works away at the same spot ' +
      'indefinitely. Cannot be waited out; it has more time than the shift does.',
    tier: 'specialist',
    assetKey: 'contact-1',
    armour: 'erratic',
    motion: 'orbit',
    maxHp: 40,
    attack: 8,
    defence: 5,
    speed: 46,
    hurtboxRadius: 11,
    // An orbiting emitter tracing curved arms is what a spiral actually is.
    patternId: 'spiral-4',
    patternInterval: 2.6,
    baseDrop: 20,
    threatWeight: 3,
    traits: {
      orbitRadius: 205,
      // Wide open while winding up: a player who reads the telegraph and acts
      // is rewarded, not merely spared.
      vulnerableWhileTelegraphing: 2,
    },
  },
  {
    id: 'warden',
    name: 'Warden',
    description:
      'Does nothing on its own account. Everything near it is harder to ' +
      'put down, which the log records as an increase in workload rather ' +
      'than in danger.',
    tier: 'specialist',
    assetKey: 'contact-1',
    armour: 'seized',
    motion: 'drift',
    maxHp: 44,
    // Deliberately the weakest attack of any specialist. A Warden is a problem
    // of *order*, not of damage: it has to die first, and nothing else in the
    // roster asks that.
    attack: 4,
    defence: 6,
    speed: 18,
    hurtboxRadius: 12,
    patternId: 'spiral-3',
    patternInterval: 3.4,
    // Worth the most in the game, because killing it first costs the most.
    baseDrop: 24,
    // The highest threat weight of anything: `highestThreat` targeting should
    // pick a Warden over a closer, bigger Contact, which is the one case that
    // makes the policy meaningfully different from `nearest`.
    threatWeight: 4,
    traits: {
      // Measured: a 90 px / 5 HP-per-second *heal* put back 4 HP across an
      // entire stage-3 clear, because nothing here survives damaged for long.
      // Reduction is felt on the first hit instead, so it cannot be skipped by
      // killing quickly. At 0.35 a warded Skiff takes two Bolt hits instead of
      // one, which is the threshold where the aura changes what a player does.
      wardsNearby: { radius: 110, reduction: 0.35 },
    },
  },
] as const

const BY_ID = new Map(CONTACT.map((s) => [s.id, s]))

export function contactById(id: string): ContactDef | undefined {
  return BY_ID.get(id)
}

/** Every Contact of a tier. Used by the wave director and by zone validation. */
export function contactsOfTier(tier: ContactDef['tier']): readonly ContactDef[] {
  return CONTACT.filter((c) => c.tier === tier)
}
