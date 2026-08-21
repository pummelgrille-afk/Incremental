/**
 * Barrel for entity types.
 *
 * This is the one barrel in the codebase. Entity types are imported almost
 * everywhere, so a single entry point earns its keep here; elsewhere barrels
 * mostly add import cycles and defeat tree-shaking, so systems/, progression/
 * and content/ are imported directly by module. See CLAUDE.md.
 *
 * Type-only re-exports, so this file contributes nothing to the bundle.
 */

export type {
  ArmourClass,
  ConjunctionScale,
  ContentDef,
  Damageable,
  DamageType,
  EntityId,
  RingIndex,
  SlotRef,
  TargetingPolicy,
  UnitRole,
  Vec2,
} from './types'

export type {
  ConjunctionEffect,
  FormationBonuses,
  MovementDef,
  MovementInstance,
} from './Movement'
export { conjunctionScaleOf, NO_FORMATION_BONUSES } from './Movement'

export type { ChimeDef, ChimeInstance } from './Chime'
export { canFire } from './Chime'

export type { SlackDef, SlackInstance, SlackMotion, SlackTraits } from './Slack'
export { distanceToCentre } from './Slack'

export type { Projectile, ProjectileFaction } from './Projectile'
export { deactivate } from './Projectile'

export type { MainspringState } from './Mainspring'
export { createMainspring, isOverwhelmed, MAINSPRING_HITBOX_RADIUS } from './Mainspring'

export type { AnyWaveDef, BossWaveDef, SpawnGroup, WaveDef, WaveTemplate } from './Wave'
export { isBossWave } from './Wave'

export type { StageAddress, StageDef, ZoneDef } from './Zone'
export { parseStageAddress, stageAddress } from './Zone'
