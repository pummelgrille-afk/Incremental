
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
  PlatformDef,
  PlatformInstance,
} from './Platform'
export { conjunctionScaleOf, NO_FORMATION_BONUSES } from './Platform'

export type { ArrayDef, ArrayInstance } from './Array'
export { canFire } from './Array'

export type { ContactDef, ContactInstance, ContactMotion, ContactTraits } from './Contact'
export { distanceToCentre } from './Contact'

export type { Projectile, ProjectileFaction } from './Projectile'
export { deactivate } from './Projectile'

export type { SunState } from './Sun'
export { createSun, isOverwhelmed, SUN_HITBOX_RADIUS } from './Sun'

export type { AnyWaveDef, BossWaveDef, SpawnGroup, WaveDef, WaveTemplate } from './Wave'
export { isBossWave } from './Wave'

export type { StageAddress, StageDef, ZoneDef } from './Zone'
export { parseStageAddress, stageAddress } from './Zone'
