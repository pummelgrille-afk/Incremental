import { RIM_MOUNTS, RINGS } from '../content/field'
import { mountCost, slotCost } from './currencies'
import { grantStartingRoster, isUnlocked } from './roster'
import { STARTING_PLATFORM_ID } from '../content/platforms'
import type { RingIndex } from '../entities/types'
import type { SaveData } from '../core/saveSchema'

export function slotKeyOf(ring: RingIndex, slot: number): string {
  return `${ring}:${slot}`
}

export function isValidSlot(ring: number, slot: number): boolean {
  const config = RINGS.find((r) => r.index === ring)
  return config !== undefined && Number.isInteger(slot) && slot >= 0 && slot < config.slots
}

export function isValidMount(mount: number): boolean {
  return Number.isInteger(mount) && mount >= 0 && mount < RIM_MOUNTS
}

export function slotsUsed(save: SaveData): number {
  return Object.keys(save.run.formation).length
}

export function mountsUsed(save: SaveData): number {
  return Object.keys(save.run.mounts).length
}

export function nextSlotCost(save: SaveData): number {
  return slotCost(slotsUsed(save))
}

export function nextMountCost(save: SaveData): number {
  return mountCost(mountsUsed(save))
}

export type PlacementRefusal =
  | 'invalid-slot'
  | 'occupied'
  | 'not-unlocked'
  | 'unaffordable'

export interface PlacementResult {
  placed: boolean

  spent: number
  refusedBecause: PlacementRefusal | null
}

const refused = (reason: PlacementRefusal): PlacementResult => ({
  placed: false,
  spent: 0,
  refusedBecause: reason,
})

export function placePlatform(
  save: SaveData,
  defId: string,
  ring: RingIndex,
  slot: number,
  from?: { ring: RingIndex; slot: number },
): PlacementResult {
  if (!isValidSlot(ring, slot)) return refused('invalid-slot')
  if (!isUnlocked(save, 'platform', defId)) return refused('not-unlocked')

  const target = slotKeyOf(ring, slot)
  const origin = from ? slotKeyOf(from.ring, from.slot) : null

  if (save.run.formation[target] !== undefined && target !== origin) {
    return refused('occupied')
  }

  if (origin !== null && save.run.formation[origin] !== undefined) {
    delete save.run.formation[origin]
    save.run.formation[target] = defId
    return { placed: true, spent: 0, refusedBecause: null }
  }

  const cost = nextSlotCost(save)
  if (save.run.salvage < cost) return refused('unaffordable')

  save.run.salvage -= cost
  save.run.formation[target] = defId
  return { placed: true, spent: cost, refusedBecause: null }
}

export function removePlatform(save: SaveData, ring: RingIndex, slot: number): number {
  const key = slotKeyOf(ring, slot)
  if (save.run.formation[key] === undefined) return 0

  delete save.run.formation[key]
  const refund = slotCost(slotsUsed(save))
  save.run.salvage += refund
  return refund
}

export function mountArray(save: SaveData, defId: string, mount: number): PlacementResult {
  if (!isValidMount(mount)) return refused('invalid-slot')
  if (!isUnlocked(save, 'array', defId)) return refused('not-unlocked')
  if (save.run.mounts[String(mount)] !== undefined) return refused('occupied')

  const cost = nextMountCost(save)
  if (save.run.salvage < cost) return refused('unaffordable')

  save.run.salvage -= cost
  save.run.mounts[String(mount)] = defId

  save.run.arraysEverMounted = true
  return { placed: true, spent: cost, refusedBecause: null }
}

export function unmountArray(save: SaveData, mount: number): number {
  const key = String(mount)
  if (save.run.mounts[key] === undefined) return 0

  delete save.run.mounts[key]
  const refund = mountCost(mountsUsed(save))
  save.run.salvage += refund
  return refund
}

export function clearFormation(save: SaveData): void {
  save.run.formation = {}
  save.run.mounts = {}
}

export const MAX_PRESETS = 5

export interface Preset {
  name: string
  formation: Record<string, string>
  mounts: Record<string, string>
}

export function savePreset(save: SaveData, name: string): boolean {
  const presets = save.meta.presets
  const existing = presets.findIndex((p) => p.name === name)

  const entry: Preset = {
    name,
    formation: { ...save.run.formation },
    mounts: { ...save.run.mounts },
  }

  if (existing >= 0) {
    presets[existing] = entry
    return true
  }
  if (presets.length >= MAX_PRESETS) return false

  presets.push(entry)
  return true
}

export function deletePreset(save: SaveData, name: string): boolean {
  const index = save.meta.presets.findIndex((p) => p.name === name)
  if (index < 0) return false
  save.meta.presets.splice(index, 1)
  return true
}

export interface LoadPresetResult {
  loaded: boolean

  spent: number

  skipped: string[]
}

export function loadPreset(save: SaveData, name: string): LoadPresetResult {
  const preset = save.meta.presets.find((p) => p.name === name)
  if (!preset) return { loaded: false, spent: 0, skipped: [] }

  const before = save.run.salvage

  while (slotsUsed(save) > 0) {
    const key = Object.keys(save.run.formation)[0]
    const [ring, slot] = key.split(':').map(Number)
    removePlatform(save, ring as RingIndex, slot)
  }
  while (mountsUsed(save) > 0) {
    unmountArray(save, Number(Object.keys(save.run.mounts)[0]))
  }

  const skipped: string[] = []

  for (const [key, defId] of Object.entries(preset.formation)) {
    const [ring, slot] = key.split(':').map(Number)
    const result = placePlatform(save, defId, ring as RingIndex, slot)
    if (!result.placed) skipped.push(key)
  }
  for (const [mount, defId] of Object.entries(preset.mounts)) {
    const result = mountArray(save, defId, Number(mount))
    if (!result.placed) skipped.push(`mount ${mount}`)
  }

  return { loaded: true, spent: before - save.run.salvage, skipped }
}

export const OPENING_SLOTS: readonly [RingIndex, number][] = [
  [1, 0],
  [1, 3],
  [2, 0],
  [2, 5],
]

export function placeOpeningFormation(save: SaveData): void {
  for (const [ring, slot] of OPENING_SLOTS) {
    save.run.formation[slotKeyOf(ring, slot)] = STARTING_PLATFORM_ID
  }
}

export function grantStartingLoadout(save: SaveData): void {
  if (!grantStartingRoster(save)) return
  placeOpeningFormation(save)
}
