import { ROSTER } from '../content/economy'
import { PLATFORMS, platformById, STARTING_PLATFORM_ID } from '../content/platforms'
import { ARRAYS, arrayById } from '../content/arrays'
import type { SaveData } from '../core/saveSchema'

/**
 * The roster: which units a player owns, and how far each is levelled.
 *
 * Both are bought with **Clearance**, which are first-clear only (economy-spec.md
 * §1). That separation is load-bearing: Clearance measure content *seen*, so the
 * roster curve is authored rather than grindable, and a long idle session can
 * never substitute for it.
 *
 * Like the rest of `progression/`, everything here is a pure function of the
 * save plus its arguments. Nothing reaches into a running simulation.
 */

/** A Platform or a Array — the two are levelled identically. */
export type UnitKind = 'platform' | 'array'

export interface UnitDefLike {
  readonly id: string
  readonly name: string
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

/**
 * Ensure the starting Platform is owned.
 *
 * Its `unlockCost` is 0, but a save that has never bought anything would
 * otherwise have an empty roster and no way to field a formation — a new player
 * cannot spend Clearance they have not earned.
 *
 * Returns whether it granted, so the caller can pair the grant with a free
 * placement exactly once. Idempotent; called on load.
 */
export function grantStartingRoster(save: SaveData): boolean {
  if (save.meta.platforms[STARTING_PLATFORM_ID] !== undefined) return false
  save.meta.platforms[STARTING_PLATFORM_ID] = 1
  return true
}

export function isUnlocked(save: SaveData, kind: UnitKind, id: string): boolean {
  return ledger(save, kind)[id] !== undefined
}

/** 0 when not owned. Owned units start at 1. */
export function levelOf(save: SaveData, kind: UnitKind, id: string): number {
  return ledger(save, kind)[id] ?? 0
}

export function unlockCost(kind: UnitKind, id: string): number {
  return defFor(kind, id)?.unlockCost ?? Infinity
}

/**
 * Clearance to raise a unit one level, or null when it is already at the ceiling.
 *
 * Null rather than Infinity so a caller has to handle "cannot" rather than
 * quietly rendering an unaffordable price the player can never reach.
 */
export function levelCost(save: SaveData, kind: UnitKind, id: string): number | null {
  const level = levelOf(save, kind, id)
  if (level < 1) return null
  if (level >= ROSTER.maxLevel) return null
  return Math.ceil(ROSTER.levelCost.base * ROSTER.levelCost.growth ** (level - 1))
}

/**
 * Total stat multiplier at a level.
 *
 * Flat rather than compounding — see `content/economy.ts` for why. Level 1 is
 * exactly 1, so an unlevelled roster behaves as though this did not exist.
 */
export function levelScale(level: number): number {
  return 1 + Math.max(0, level - 1) * ROSTER.levelScaling
}

/** Unlock a unit, or refuse. Refusal changes nothing. */
export function unlock(save: SaveData, kind: UnitKind, id: string): boolean {
  if (isUnlocked(save, kind, id)) return false

  const def = defFor(kind, id)
  if (!def) return false
  if (save.meta.clearance < def.unlockCost) return false

  save.meta.clearance -= def.unlockCost
  ledger(save, kind)[id] = 1
  return true
}

/** Raise a unit one level, or refuse. */
export function levelUp(save: SaveData, kind: UnitKind, id: string): boolean {
  const cost = levelCost(save, kind, id)
  if (cost === null || save.meta.clearance < cost) return false

  save.meta.clearance -= cost
  ledger(save, kind)[id] = levelOf(save, kind, id) + 1
  return true
}

export interface RosterEntry {
  kind: UnitKind
  id: string
  name: string
  unlocked: boolean
  level: number
  /** Clearance to unlock, when locked. */
  unlockCost: number
  /** Clearance for the next level, null at the ceiling or when locked. */
  levelCost: number | null
  atMaxLevel: boolean
  canUnlock: boolean
  canLevel: boolean
}

/** Every authored unit with its state, for the formation editor. */
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
    }
  })
}

/** Levels keyed by def id, in the shape `applyFormation` wants. */
export function levelsOf(save: SaveData, kind: UnitKind): Record<string, number> {
  return { ...ledger(save, kind) }
}
