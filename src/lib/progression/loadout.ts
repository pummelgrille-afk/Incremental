import { RIM_MOUNTS, RINGS } from '../content/field'
import { mountCost, slotCost } from './currencies'
import { grantStartingRoster, isUnlocked } from './roster'
import { STARTING_MOVEMENT_ID } from '../content/allies'
import type { RingIndex } from '../entities/types'
import type { SaveData } from '../core/saveSchema'

/**
 * The formation a player fields, and the presets they keep.
 *
 * **Filings buy the size of a formation, not each placement.** Growing costs
 * `slotCost(slotsUsed)`; moving a unit between slots is free; removing refunds
 * in full. The alternative — charging per placement — would tax rearranging,
 * and rearranging is the game's main pleasure, the same argument economy-spec.md
 * §2 makes for a free respec. What Filings gate is *how large a machine you
 * run*, which is the sink the cost curve was authored for.
 *
 * The formation lives in `run` and is cleared by a Rewind. Presets live in
 * `meta` and are not: an arrangement you liked should survive the reset that
 * takes the units away, or every Rewind would mean rebuilding from memory.
 */

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

/** What adding one more Movement would cost. */
export function nextSlotCost(save: SaveData): number {
  return slotCost(slotsUsed(save))
}

/** What adding one more Chime would cost. */
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
  /** Filings spent. Zero when moving a unit already in the formation. */
  spent: number
  refusedBecause: PlacementRefusal | null
}

const refused = (reason: PlacementRefusal): PlacementResult => ({
  placed: false,
  spent: 0,
  refusedBecause: reason,
})

/**
 * Put a Movement in a slot, charging only if the formation grew.
 *
 * `from` names a slot the unit is being moved out of. Supplying it makes the
 * placement a move — same size, no charge — and is what keeps rearranging free.
 */
export function placeMovement(
  save: SaveData,
  defId: string,
  ring: RingIndex,
  slot: number,
  from?: { ring: RingIndex; slot: number },
): PlacementResult {
  if (!isValidSlot(ring, slot)) return refused('invalid-slot')
  if (!isUnlocked(save, 'movement', defId)) return refused('not-unlocked')

  const target = slotKeyOf(ring, slot)
  const origin = from ? slotKeyOf(from.ring, from.slot) : null

  if (save.run.formation[target] !== undefined && target !== origin) {
    return refused('occupied')
  }

  // A move keeps the formation the same size, so it is free.
  if (origin !== null && save.run.formation[origin] !== undefined) {
    delete save.run.formation[origin]
    save.run.formation[target] = defId
    return { placed: true, spent: 0, refusedBecause: null }
  }

  const cost = nextSlotCost(save)
  if (save.run.filings < cost) return refused('unaffordable')

  save.run.filings -= cost
  save.run.formation[target] = defId
  return { placed: true, spent: cost, refusedBecause: null }
}

/**
 * Take a Movement out, refunding what the slot cost.
 *
 * Refunded at the *current* price of the slot being given up, which is the
 * price the formation would pay to get back to this size — so the round trip
 * is exactly neutral and cannot be farmed in either direction.
 */
export function removeMovement(save: SaveData, ring: RingIndex, slot: number): number {
  const key = slotKeyOf(ring, slot)
  if (save.run.formation[key] === undefined) return 0

  delete save.run.formation[key]
  const refund = slotCost(slotsUsed(save))
  save.run.filings += refund
  return refund
}

export function mountChime(save: SaveData, defId: string, mount: number): PlacementResult {
  if (!isValidMount(mount)) return refused('invalid-slot')
  if (!isUnlocked(save, 'chime', defId)) return refused('not-unlocked')
  if (save.run.mounts[String(mount)] !== undefined) return refused('occupied')

  const cost = nextMountCost(save)
  if (save.run.filings < cost) return refused('unaffordable')

  save.run.filings -= cost
  save.run.mounts[String(mount)] = defId
  // Sticky for the whole run — see `chimesEverMounted` in saveSchema.ts.
  save.run.chimesEverMounted = true
  return { placed: true, spent: cost, refusedBecause: null }
}

export function unmountChime(save: SaveData, mount: number): number {
  const key = String(mount)
  if (save.run.mounts[key] === undefined) return 0

  delete save.run.mounts[key]
  const refund = mountCost(mountsUsed(save))
  save.run.filings += refund
  return refund
}

/** Clear the field without refunding — what a Rewind does. */
export function clearFormation(save: SaveData): void {
  save.run.formation = {}
  save.run.mounts = {}
}

// --- Presets. --------------------------------------------------------------

export const MAX_PRESETS = 5

export interface Preset {
  name: string
  formation: Record<string, string>
  mounts: Record<string, string>
}

/**
 * Save the current arrangement under a name.
 *
 * Presets store **ids and slots only**, never costs or levels. Loading one
 * therefore costs whatever the formation costs today, and a preset saved before
 * a Phase 34 re-balance still means what it said: "these units, these slots".
 */
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
  /** Net Filings change. Negative when the preset is larger than the current field. */
  spent: number
  /** Entries dropped because the unit is not unlocked or the slot is gone. */
  skipped: string[]
}

/**
 * Field a preset.
 *
 * Refunds the current formation first, then buys the preset's — so the price is
 * the preset's size, not the difference, and the order can never leave a player
 * unable to afford a formation they already had.
 *
 * Entries are skipped rather than refused wholesale when a unit is locked or a
 * slot no longer exists. A preset saved across a content change must still do
 * as much as it can; refusing entirely would be worse than a partial field.
 */
export function loadPreset(save: SaveData, name: string): LoadPresetResult {
  const preset = save.meta.presets.find((p) => p.name === name)
  if (!preset) return { loaded: false, spent: 0, skipped: [] }

  const before = save.run.filings

  // Refund everything currently fielded, cheapest slot last.
  while (slotsUsed(save) > 0) {
    const key = Object.keys(save.run.formation)[0]
    const [ring, slot] = key.split(':').map(Number)
    removeMovement(save, ring as RingIndex, slot)
  }
  while (mountsUsed(save) > 0) {
    unmountChime(save, Number(Object.keys(save.run.mounts)[0]))
  }

  const skipped: string[] = []

  for (const [key, defId] of Object.entries(preset.formation)) {
    const [ring, slot] = key.split(':').map(Number)
    const result = placeMovement(save, defId, ring as RingIndex, slot)
    if (!result.placed) skipped.push(key)
  }
  for (const [mount, defId] of Object.entries(preset.mounts)) {
    const result = mountChime(save, defId, Number(mount))
    if (!result.placed) skipped.push(`mount ${mount}`)
  }

  return { loaded: true, spent: before - save.run.filings, skipped }
}

/**
 * The opening formation, granted free on a new save.
 *
 * **Four Movements, two on ring 1 and two on ring 2.** Both halves of that were
 * measured, not chosen:
 *
 * *Four*, because "doing nothing is viable" (combat-spec.md §1, pillar P1) does
 * not survive fewer. One unit loses First Shift in 16 of 16 runs without the
 * Beat, three lose 8 of 16, four clear all of them. The pillar is the reason
 * the Beat exists as upside rather than as a tax, so it wins over the slot
 * curve's first four purchases.
 *
 * *Two rings*, because coverage matters more than count at this size: four
 * Hammers all on ring 2 lose 24 of 24 without the Beat, while two-and-two clear
 * 24 of 24 at 0.78 Tension. Ring 1 is the last line — the only ring that
 * reaches the Mainspring itself. Splitting them also means conjunction can fire
 * in the first stage, since it requires two Movements on *different* rings.
 *
 * The slot curve is untouched: the granted four count toward `slotsUsed`, so
 * the fifth Movement costs what the fifth Movement costs. The player is given a
 * machine, not a discount.
 */
export const OPENING_SLOTS: readonly [RingIndex, number][] = [
  [1, 0],
  [1, 3],
  [2, 0],
  [2, 5],
]

/**
 * Put the opening formation on the field, free.
 *
 * Separate from the grant below because **a Rewind needs it too**: the roster
 * survives a Rewind, so the first-time grant declines to fire, and without this
 * a Rewind would land the player in the same deadlock a fresh save had — no
 * units, no Filings, and Filings only come from kills.
 */
export function placeOpeningFormation(save: SaveData): void {
  for (const [ring, slot] of OPENING_SLOTS) {
    save.run.formation[slotKeyOf(ring, slot)] = STARTING_MOVEMENT_ID
  }
}

export function grantStartingLoadout(save: SaveData): void {
  if (!grantStartingRoster(save)) return
  placeOpeningFormation(save)
}
