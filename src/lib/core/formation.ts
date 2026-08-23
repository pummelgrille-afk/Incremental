import type { ArrayDef, ArrayInstance } from '../entities/Array'
import type { FormationBonuses, PlatformDef, PlatformInstance } from '../entities/Platform'
import { createBuffs } from '../systems/buffs'
import { levelScale } from '../progression/roster'
import type { RingIndex } from '../entities/types'
import { OUTERMOST_RING, RINGS, ringByIndex } from '../content/field'
import { allocateId, type SimulationState } from './simulation'

export function slotKey(ring: RingIndex, slot: number): string {
  return `${ring}:${slot}`
}

export class FormationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormationError'
  }
}

export function isValidSlot(ring: RingIndex, slot: number): boolean {
  const config = ringByIndex(ring)
  if (!config) return false
  return Number.isInteger(slot) && slot >= 0 && slot < config.slots
}

export function slotOccupied(sim: SimulationState, ring: RingIndex, slot: number): boolean {
  return sim.platforms.some((m) => m.slot.ring === ring && m.slot.slot === slot)
}

export function createPlatform(
  sim: SimulationState,
  def: PlatformDef,
  ring: RingIndex,
  slot: number,
  level = 1,
): PlatformInstance {
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
    hitFlash: 0,
    bonuses: { attack: 0, defence: 0, range: 0 },
    levelScale: scale,
    buffs: createBuffs(),
  }
}

export function createArray(
  sim: SimulationState,
  def: ArrayDef,
  mount: number,
  level = 1,
  stats?: { maxCharge: number; chargeInterval: number; attack: number },
): ArrayInstance {
  const scale = levelScale(level)
  const maxHp = def.maxHp * scale

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

export function placePlatform(
  sim: SimulationState,
  def: PlatformDef,
  ring: RingIndex,
  slot: number,
  level = 1,
): PlatformInstance {
  if (!isValidSlot(ring, slot)) {
    throw new FormationError(`Slot ${slot} does not exist on ring ${ring}`)
  }
  if (slotOccupied(sim, ring, slot)) {
    throw new FormationError(`Slot ${ring}:${slot} is already occupied`)
  }

  const platform = createPlatform(sim, def, ring, slot, level)
  sim.platforms.push(platform)
  recomputeBonuses(sim)
  return platform
}

export function removePlatform(sim: SimulationState, ring: RingIndex, slot: number): boolean {
  const before = sim.platforms.length
  sim.platforms = sim.platforms.filter(
    (m) => !(m.slot.ring === ring && m.slot.slot === slot),
  )
  if (sim.platforms.length === before) return false
  recomputeBonuses(sim)
  return true
}

export function mountArray(
  sim: SimulationState,
  def: ArrayDef,
  mount: number,
  level = 1,
  stats?: { maxCharge: number; chargeInterval: number; attack: number },
): ArrayInstance {
  if (sim.arrays.some((c) => c.mount === mount)) {
    throw new FormationError(`Mount ${mount} is already occupied`)
  }
  const array = createArray(sim, def, mount, level, stats)
  sim.arrays.push(array)
  return array
}

export function recomputeBonuses(sim: SimulationState): void {
  sim.formationVersion++
  const occupied = new Set(sim.platforms.map((m) => slotKey(m.slot.ring, m.slot.slot)))

  const perRingCount = new Map<RingIndex, number>()
  for (const m of sim.platforms) {
    perRingCount.set(m.slot.ring, (perRingCount.get(m.slot.ring) ?? 0) + 1)
  }

  const fullRings = new Set<RingIndex>()
  for (const ring of RINGS) {
    if ((perRingCount.get(ring.index) ?? 0) === ring.slots) fullRings.add(ring.index)
  }

  for (const platform of sim.platforms) {
    const { ring, slot } = platform.slot
    const config = ringByIndex(ring)
    if (!config) continue

    const bonuses: FormationBonuses = { attack: 0, defence: 0, range: 0 }

    if (ring === 1) bonuses.defence += 0.15

    if (ring === OUTERMOST_RING) bonuses.range += 0.1

    const left = slotKey(ring, (slot - 1 + config.slots) % config.slots)
    const right = slotKey(ring, (slot + 1) % config.slots)
    if (occupied.has(left) && occupied.has(right)) bonuses.attack += 0.1

    if (ring < OUTERMOST_RING) {
      const outer = ringByIndex((ring + 1) as RingIndex)
      if (outer) {
        const outerSlot = Math.round((slot / config.slots) * outer.slots) % outer.slots
        if (occupied.has(slotKey(outer.index, outerSlot))) bonuses.defence += 0.05
      }
    }

    if (fullRings.has(ring)) bonuses.attack += 0.08

    platform.bonuses = bonuses
  }
}

export function applyFormation(
  sim: SimulationState,
  formation: Record<string, string>,
  resolve: (id: string) => PlatformDef | undefined,
  levels: Record<string, number> = {},
): void {
  for (const [key, defId] of Object.entries(formation)) {
    const [ringText, slotText] = key.split(':')
    const ring = Number(ringText) as RingIndex
    const slot = Number(slotText)
    const def = resolve(defId)

    if (!def || !isValidSlot(ring, slot) || slotOccupied(sim, ring, slot)) continue

    sim.platforms.push(createPlatform(sim, def, ring, slot, levels[defId] ?? 1))
  }
  recomputeBonuses(sim)
}
