import type { ChimeDef, ChimeInstance } from '../entities/Chime'
import type { FormationBonuses, MovementDef, MovementInstance } from '../entities/Movement'
import { createBuffs } from '../systems/buffs'
import { levelScale } from '../progression/roster'
import type { RingIndex } from '../entities/types'
import { RINGS, ringByIndex } from '../content/field'
import { allocateId, type SimulationState } from './simulation'

/**
 * Placing units on the field, and the formation bonuses that follow.
 *
 * Bonuses are computed on placement and cached on the instance — combat-spec.md
 * §2 is explicit that they are never recomputed per tick. Recomputing would put
 * an O(units²) neighbour scan on the hot path to produce a number that only
 * changes when the player rearranges.
 *
 * PLACEHOLDER SCOPE — Phase 24 builds the drag-and-drop editor and persistence
 * of loadouts. This is the minimum for the Phase 10 slice.
 */

export function slotKey(ring: RingIndex, slot: number): string {
  return `${ring}:${slot}`
}

export class FormationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormationError'
  }
}

/** Is a slot index valid for this ring? */
export function isValidSlot(ring: RingIndex, slot: number): boolean {
  const config = ringByIndex(ring)
  if (!config) return false
  return Number.isInteger(slot) && slot >= 0 && slot < config.slots
}

export function slotOccupied(sim: SimulationState, ring: RingIndex, slot: number): boolean {
  return sim.movements.some((m) => m.slot.ring === ring && m.slot.slot === slot)
}

export function createMovement(
  sim: SimulationState,
  def: MovementDef,
  ring: RingIndex,
  slot: number,
  level = 1,
): MovementInstance {
  // The curve lives in content/economy.ts with the rest of the roster tuning.
  const scale = levelScale(level)
  const maxHp = def.maxHp * scale

  return {
    id: allocateId(sim),
    def,
    slot: { ring, slot },
    level,
    hp: maxHp,
    maxHp,
    cooldownRemaining: 0,
    targetId: null,
    timeSinceRetarget: 0,
    disabledFor: 0,
    bonuses: { attack: 0, defence: 0, range: 0 },
    levelScale: scale,
    buffs: createBuffs(),
  }
}

export function createChime(
  sim: SimulationState,
  def: ChimeDef,
  mount: number,
  level = 1,
  stats?: { maxCharge: number; chargeInterval: number; attack: number },
): ChimeInstance {
  const scale = levelScale(level)
  const maxHp = def.maxHp * scale

  // Defaults to the def's own numbers, so a caller with no save — a test, or
  // the loader before progression exists — gets an unupgraded Chime rather
  // than having to know about tracks.
  const maxCharge = stats?.maxCharge ?? def.maxCharge
  const chargeInterval = stats?.chargeInterval ?? def.chargeInterval
  const attackScale = (stats?.attack ?? def.attack) / def.attack

  return {
    id: allocateId(sim),
    def,
    mount,
    level,
    hp: maxHp,
    maxHp,
    charge: maxCharge,
    cooldownRemaining: 0,
    targetId: null,
    timeSinceRetarget: 0,
    disabledFor: 0,
    levelScale: scale,
    maxCharge,
    chargeInterval,
    attackScale,
  }
}

/** Place a Movement, then refresh every cached bonus. */
export function placeMovement(
  sim: SimulationState,
  def: MovementDef,
  ring: RingIndex,
  slot: number,
  level = 1,
): MovementInstance {
  if (!isValidSlot(ring, slot)) {
    throw new FormationError(`Slot ${slot} does not exist on ring ${ring}`)
  }
  if (slotOccupied(sim, ring, slot)) {
    throw new FormationError(`Slot ${ring}:${slot} is already occupied`)
  }

  const movement = createMovement(sim, def, ring, slot, level)
  sim.movements.push(movement)
  recomputeBonuses(sim)
  return movement
}

export function removeMovement(sim: SimulationState, ring: RingIndex, slot: number): boolean {
  const before = sim.movements.length
  sim.movements = sim.movements.filter(
    (m) => !(m.slot.ring === ring && m.slot.slot === slot),
  )
  if (sim.movements.length === before) return false
  recomputeBonuses(sim)
  return true
}

export function mountChime(
  sim: SimulationState,
  def: ChimeDef,
  mount: number,
  level = 1,
  stats?: { maxCharge: number; chargeInterval: number; attack: number },
): ChimeInstance {
  if (sim.chimes.some((c) => c.mount === mount)) {
    throw new FormationError(`Mount ${mount} is already occupied`)
  }
  const chime = createChime(sim, def, mount, level, stats)
  sim.chimes.push(chime)
  return chime
}

/**
 * Recompute every Movement's cached bonuses. Called on any formation change,
 * and never from the tick loop.
 *
 * Rules are combat-spec.md §2's table, in order.
 */
export function recomputeBonuses(sim: SimulationState): void {
  sim.formationVersion++
  const occupied = new Set(sim.movements.map((m) => slotKey(m.slot.ring, m.slot.slot)))

  const perRingCount = new Map<RingIndex, number>()
  for (const m of sim.movements) {
    perRingCount.set(m.slot.ring, (perRingCount.get(m.slot.ring) ?? 0) + 1)
  }

  const fullRings = new Set<RingIndex>()
  for (const ring of RINGS) {
    if ((perRingCount.get(ring.index) ?? 0) === ring.slots) fullRings.add(ring.index)
  }

  for (const movement of sim.movements) {
    const { ring, slot } = movement.slot
    const config = ringByIndex(ring)
    if (!config) continue

    const bonuses: FormationBonuses = { attack: 0, defence: 0, range: 0 }

    // Ring 1: close support from the Mainspring.
    if (ring === 1) bonuses.defence += 0.15
    // Ring 3: nothing blocking the sightline.
    if (ring === 3) bonuses.range += 0.1

    // Both neighbours on the same ring filled. Wraps around the ring.
    const left = slotKey(ring, (slot - 1 + config.slots) % config.slots)
    const right = slotKey(ring, (slot + 1) % config.slots)
    if (occupied.has(left) && occupied.has(right)) bonuses.attack += 0.1

    // Screened: something occupies the slot radially outward.
    if (ring < 3) {
      const outer = ringByIndex((ring + 1) as RingIndex)
      if (outer) {
        // Slot counts differ per ring, so map by angle fraction.
        const outerSlot = Math.round((slot / config.slots) * outer.slots) % outer.slots
        if (occupied.has(slotKey(outer.index, outerSlot))) bonuses.defence += 0.05
      }
    }

    if (fullRings.has(ring)) bonuses.attack += 0.08

    movement.bonuses = bonuses
  }
}

/** Apply a saved formation record (`"ring:slot" -> defId`) to a fresh stage. */
export function applyFormation(
  sim: SimulationState,
  formation: Record<string, string>,
  resolve: (id: string) => MovementDef | undefined,
  levels: Record<string, number> = {},
): void {
  for (const [key, defId] of Object.entries(formation)) {
    const [ringText, slotText] = key.split(':')
    const ring = Number(ringText) as RingIndex
    const slot = Number(slotText)
    const def = resolve(defId)

    // Silently skip content that no longer exists — a save must survive a
    // roster change, and refusing to load would be worse than a missing unit.
    if (!def || !isValidSlot(ring, slot) || slotOccupied(sim, ring, slot)) continue

    sim.movements.push(createMovement(sim, def, ring, slot, levels[defId] ?? 1))
  }
  recomputeBonuses(sim)
}
