/**
 * Shared primitives every entity is built from.
 *
 * Nothing in this file imports Svelte or Pixi — see docs/architecture.md,
 * "Layer boundaries". These types must stay usable in a plain Vitest process.
 */

/** Dense integer handle. Entities are pooled, so ids are reused. */
export type EntityId = number

/** Ring 0 is the Mainspring; 1–4 are the rotating rings. Rim mounts are static. */
export type RingIndex = 0 | 1 | 2 | 3 | 4

/**
 * A unit's position on the field. Units store a *slot*, never an angle — the
 * angle is derived from the ring's current phase. This is what keeps rotation
 * O(rings) rather than O(units) (ADR-001).
 */
export interface SlotRef {
  ring: RingIndex
  slot: number
}

/** Free-moving entities (Slack, Projectiles) do carry a resolved position. */
export interface Vec2 {
  x: number
  y: number
}

/** What a Movement or Chime deals. See docs/design/combat-spec.md §7. */
export type DamageType = 'shear' | 'percussive' | 'thermal' | 'resonant'

/** What a Slack resists. Paired against DamageType in content/damageTypes.ts. */
export type ArmourClass = 'massed' | 'rigid' | 'seized' | 'erratic'

/** Target selection. Defaults per archetype; overridable per unit in content. */
export type TargetingPolicy =
  | 'nearest'
  | 'lowestHp'
  | 'highestThreat'
  | 'deepest'
  | 'none'

/** Broad role, used for roster filtering and formation advice — not for math. */
export type UnitRole = 'tank' | 'damage' | 'support' | 'control'

/**
 * Scale of a conjunction, by participant count.
 * See docs/design/combat-spec.md §3.
 */
export type ConjunctionScale = 'minor' | 'major' | 'grand'

/**
 * Anything with a health pool. Deliberately minimal — systems should depend on
 * this rather than on a concrete entity type where they can.
 */
export interface Damageable {
  hp: number
  maxHp: number
}

/** Every content definition carries a stable id and presentation copy. */
export interface ContentDef {
  /** Stable across saves. Never renumber — save files reference these. */
  readonly id: string
  readonly name: string
  /** Flavour, in the Manual's voice. See docs/design/narrative.md. */
  readonly description: string
  /** Key into the Phase 37 asset manifest. Unresolved until then. */
  readonly assetKey?: string
}

/**
 * A modifier with a life, in seconds. `magnitude` is zero exactly when nothing
 * is active. The stacking rule that governs these lives in systems/buffs.ts —
 * the shape is here because entities may not depend on systems.
 */
export interface TimedBonus {
  magnitude: number
  remaining: number
}
