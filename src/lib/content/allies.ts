import type { MovementDef } from '../entities/Movement'

/**
 * Movement roster.
 *
 * PLACEHOLDER — Phase 29 produces the 8–12 launch allies. Three are here rather
 * than PLAN.md's literal "one ally", because the Phase 10 slice has to answer
 * the open questions in combat-spec.md §9: conjunction needs at least two
 * Movements on different rings, and the type matrix needs at least two damage
 * types to mean anything.
 *
 * Names are real horological parts, per narrative.md.
 */

const DEG = Math.PI / 180

export const MOVEMENTS: readonly MovementDef[] = [
  {
    id: 'hammer',
    name: 'Hammer',
    description:
      'Strikes on the beat and does not vary. The Manual describes its ' +
      'maintenance schedule in one word: none.',
    role: 'damage',
    damageType: 'percussive',
    maxHp: 60,
    attack: 14,
    defence: 4,
    baseInterval: 1.1,
    angularReach: 32 * DEG,
    radialReach: 1,
    targeting: 'nearest',
    blockArc: 12 * DEG,
    conjunctionEffect: { kind: 'damagePulse', magnitude: 26 },
    unlockCost: 0,
  },
  {
    id: 'detent',
    name: 'Detent',
    description:
      'Holds. That is the entire function, and it performs it without ' +
      'complaint or notable incident.',
    role: 'tank',
    damageType: 'percussive',
    maxHp: 160,
    attack: 6,
    defence: 22,
    baseInterval: 1.6,
    angularReach: 22 * DEG,
    radialReach: 0,
    targeting: 'deepest',
    // Wider block arc is the whole point of a Detent.
    blockArc: 26 * DEG,
    conjunctionEffect: { kind: 'shield', magnitude: 40, duration: 5 },
    unlockCost: 2,
  },
  {
    id: 'pallet',
    name: 'Pallet',
    description:
      'Cuts on the release stroke. Effective against anything that arrives ' +
      'in quantity, which is most things.',
    role: 'damage',
    damageType: 'shear',
    maxHp: 45,
    attack: 9,
    defence: 2,
    baseInterval: 0.65,
    angularReach: 40 * DEG,
    radialReach: 1,
    targeting: 'lowestHp',
    blockArc: 9 * DEG,
    conjunctionEffect: { kind: 'haste', magnitude: 0.6, duration: 4 },
    unlockCost: 3,
  },
] as const

const BY_ID = new Map(MOVEMENTS.map((m) => [m.id, m]))

export function movementById(id: string): MovementDef | undefined {
  return BY_ID.get(id)
}

/** Granted on a new save so the field is never empty. */
export const STARTING_MOVEMENT_ID = 'hammer'
