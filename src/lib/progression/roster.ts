import { ROSTER } from '../content/economy'
import { PLATFORMS, platformById, STARTING_PLATFORM_ID } from '../content/platforms'
import { ARRAYS, arrayById } from '../content/arrays'
import type { DamageType, TargetingPolicy, UnitRole } from '../entities/types'
import type { SaveData } from '../core/saveSchema'

export type UnitKind = 'platform' | 'array'

export interface UnitDefLike {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly role: UnitRole
  readonly damageType: DamageType
  readonly maxHp: number
  readonly attack: number
  readonly defence: number
  readonly baseInterval: number
  readonly targeting: TargetingPolicy
  readonly conjunctionEffect?: { readonly kind: string; readonly magnitude: number }
  readonly unlockCost: number
}

function defsFor(kind: UnitKind): readonly UnitDefLike[] {
  return kind === 'platform' ? PLATFORMS : ARRAYS
}

function defFor(kind: UnitKind, id: string): UnitDefLike | undefined {
  return kind === 'platform' ? platformById(id) : arrayById(id)
}

function ledger(save: SaveData, kind: UnitKind): Record<string, number> {
  return kind === 'platform' ? save.meta.platforms : save.meta.arrays
}

export function grantStartingRoster(save: SaveData): boolean {
  if (save.meta.platforms[STARTING_PLATFORM_ID] !== undefined) return false
  save.meta.platforms[STARTING_PLATFORM_ID] = 1
  return true
}

export function isUnlocked(save: SaveData, kind: UnitKind, id: string): boolean {
  return ledger(save, kind)[id] !== undefined
}

export function levelOf(save: SaveData, kind: UnitKind, id: string): number {
  return ledger(save, kind)[id] ?? 0
}

export function unlockCost(kind: UnitKind, id: string): number {
  return defFor(kind, id)?.unlockCost ?? Infinity
}

export function levelCost(save: SaveData, kind: UnitKind, id: string): number | null {
  const level = levelOf(save, kind, id)
  if (level < 1) return null
  if (level >= ROSTER.maxLevel) return null
  return Math.ceil(ROSTER.levelCost.base * ROSTER.levelCost.growth ** (level - 1))
}

export function levelScale(level: number): number {
  return 1 + Math.max(0, level - 1) * ROSTER.levelScaling
}

export function unlock(save: SaveData, kind: UnitKind, id: string): boolean {
  if (isUnlocked(save, kind, id)) return false

  const def = defFor(kind, id)
  if (!def) return false
  if (save.meta.clearance < def.unlockCost) return false

  save.meta.clearance -= def.unlockCost
  ledger(save, kind)[id] = 1
  return true
}

export function levelUp(save: SaveData, kind: UnitKind, id: string): boolean {
  const cost = levelCost(save, kind, id)
  if (cost === null || save.meta.clearance < cost) return false

  save.meta.clearance -= cost
  ledger(save, kind)[id] = levelOf(save, kind, id) + 1
  return true
}

export interface UnitProfile {
  description: string
  role: UnitRole
  damageType: DamageType
  targeting: TargetingPolicy
  attack: number
  maxHp: number
  defence: number

  interval: number

  conjunction: { kind: string; magnitude: number } | null
}

export interface RosterEntry {
  kind: UnitKind
  id: string
  name: string
  unlocked: boolean
  level: number

  unlockCost: number

  levelCost: number | null
  atMaxLevel: boolean
  canUnlock: boolean
  canLevel: boolean
  profile: UnitProfile
}

function profileOf(def: UnitDefLike, level: number): UnitProfile {
  const scale = levelScale(Math.max(1, level))

  return {
    description: def.description,
    role: def.role,
    damageType: def.damageType,
    targeting: def.targeting,
    attack: def.attack * scale,
    maxHp: def.maxHp * scale,
    defence: def.defence * scale,
    interval: def.baseInterval,
    conjunction: def.conjunctionEffect
      ? { kind: def.conjunctionEffect.kind, magnitude: def.conjunctionEffect.magnitude }
      : null,
  }
}

export function rosterOf(save: SaveData, kind: UnitKind): RosterEntry[] {
  return defsFor(kind).map((def) => {
    const unlocked = isUnlocked(save, kind, def.id)
    const level = levelOf(save, kind, def.id)
    const cost = levelCost(save, kind, def.id)

    return {
      kind,
      id: def.id,
      name: def.name,
      unlocked,
      level,
      unlockCost: def.unlockCost,
      levelCost: cost,
      atMaxLevel: unlocked && level >= ROSTER.maxLevel,
      canUnlock: !unlocked && save.meta.clearance >= def.unlockCost,
      canLevel: cost !== null && save.meta.clearance >= cost,
      profile: profileOf(def, level),
    }
  })
}

export function levelsOf(save: SaveData, kind: UnitKind): Record<string, number> {
  return { ...ledger(save, kind) }
}
