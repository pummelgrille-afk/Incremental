import { ZONES, nextZoneAfter, zoneById, zonesInOrder } from '../content/zones'
import { stageAddress, type StageAddress, type ZoneDef } from '../entities/Zone'
import { isBossWave } from '../entities/Wave'
import type { SaveData } from '../core/saveSchema'

/**
 * The progression map — which zones and stages a save may enter.
 *
 * Pure functions over the save, like the rest of `progression/`. The one
 * mutation is `unlockReachableZones`, and it is idempotent.
 *
 * **`ZoneDef.requires` and `meta.unlockedZones` were both dead** until this
 * phase: the field was declared, the save carried the array, and nothing ever
 * added a zone to it. Every zone past the first was unreachable and nothing
 * said so, because there was no second zone to notice it with.
 */

/** Has this zone been unlocked? */
export function isZoneUnlocked(save: SaveData, zoneId: string): boolean {
  return save.meta.unlockedZones.includes(zoneId)
}

export function isStageCleared(save: SaveData, address: StageAddress): boolean {
  return save.meta.clearedStages.includes(address)
}

/** Every stage in a zone, cleared. */
export function isZoneCleared(save: SaveData, zone: ZoneDef): boolean {
  return zone.stages.every((s) => isStageCleared(save, stageAddress(zone.id, s.id)))
}

/**
 * May this stage be entered?
 *
 * Two gates, and both are needed. The zone must be unlocked, and within a zone
 * the stages are a chain: the first is always open and every other needs the
 * one before it cleared.
 *
 * A cleared stage stays open. Re-clearing awards nothing (economy-spec.md §1),
 * so there is no exploit in replaying one — and closing it would strand a
 * player who wants an easier stage to farm Salvage on.
 */
export function isStageUnlocked(save: SaveData, address: StageAddress): boolean {
  const separator = address.indexOf(':')
  const zoneId = address.slice(0, separator)
  const stageId = address.slice(separator + 1)

  const zone = zoneById(zoneId)
  if (!zone || !isZoneUnlocked(save, zoneId)) return false

  const index = zone.stages.findIndex((s) => s.id === stageId)
  if (index < 0) return false
  if (index === 0) return true

  const previous = zone.stages[index - 1]
  return isStageCleared(save, stageAddress(zone.id, previous.id))
}

/**
 * Unlock every zone whose prerequisite is now fully cleared.
 *
 * Called after a stage clear. Loops rather than unlocking one, because a save
 * repaired or migrated from an older build may satisfy several prerequisites at
 * once, and unlocking a single step per clear would leave such a save quietly
 * one zone short of where it earned.
 *
 * Returns the ids it added, so the caller can announce them.
 */
export function unlockReachableZones(save: SaveData): string[] {
  const added: string[] = []

  // Bounded by the zone count: each pass unlocks at least one or stops.
  for (let pass = 0; pass < ZONES.length; pass++) {
    let changed = false

    for (const zone of ZONES) {
      if (isZoneUnlocked(save, zone.id)) continue
      if (!zone.requires) continue

      const prerequisite = zoneById(zone.requires)
      if (!prerequisite || !isZoneUnlocked(save, prerequisite.id)) continue
      if (!isZoneCleared(save, prerequisite)) continue

      save.meta.unlockedZones.push(zone.id)
      added.push(zone.id)
      changed = true
    }

    if (!changed) break
  }

  return added
}

export interface StageView {
  address: StageAddress
  id: string
  name: string
  scalingIndex: number
  unlocked: boolean
  cleared: boolean
  /** True when this stage's only wave is an encounter. */
  isBoss: boolean
}

export interface ZoneView {
  id: string
  name: string
  description: string
  index: number
  epigraph: string
  epigraphAttribution: string
  unlocked: boolean
  cleared: boolean
  /** Cleared stages over total, for the zone's progress readout. */
  clearedCount: number
  stageCount: number
  stages: StageView[]
}

/**
 * The whole map, as the stage-select view needs it.
 *
 * Built here rather than in the component: which stages are enterable is a
 * progression rule, and a rule expressed in a Svelte template is a rule that
 * cannot be tested.
 */
export function mapView(save: SaveData): ZoneView[] {
  return zonesInOrder().map((zone) => {
    const stages: StageView[] = zone.stages.map((s) => {
      const address = stageAddress(zone.id, s.id)
      return {
        address,
        id: s.id,
        name: s.name,
        scalingIndex: s.scalingIndex,
        unlocked: isStageUnlocked(save, address),
        cleared: isStageCleared(save, address),
        isBoss: s.waves.some(isBossWave),
      }
    })

    return {
      id: zone.id,
      name: zone.name,
      description: zone.description,
      index: zone.index,
      epigraph: zone.epigraph,
      epigraphAttribution: zone.epigraphAttribution,
      unlocked: isZoneUnlocked(save, zone.id),
      cleared: isZoneCleared(save, zone),
      clearedCount: stages.filter((s) => s.cleared).length,
      stageCount: stages.length,
      stages,
    }
  })
}

/**
 * The stage a player should be dropped into.
 *
 * The first unenterable-but-unlocked stage in progression order, or the last
 * stage they cleared if they have finished everything authored. Used when a
 * save has no `currentStage` — a fresh save, or one whose stage id no longer
 * exists because content moved underneath it.
 */
export function nextStageFor(save: SaveData): StageAddress | null {
  for (const zone of zonesInOrder()) {
    if (!isZoneUnlocked(save, zone.id)) continue
    for (const s of zone.stages) {
      const address = stageAddress(zone.id, s.id)
      if (!isStageCleared(save, address) && isStageUnlocked(save, address)) return address
    }
  }

  // Everything authored is cleared. Send them to the deepest stage rather than
  // to nothing, so the field is never empty.
  const last = zonesInOrder().at(-1)
  const stage = last?.stages.at(-1)
  return last && stage ? stageAddress(last.id, stage.id) : null
}

export { nextZoneAfter }
