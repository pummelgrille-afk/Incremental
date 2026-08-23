import { ZONES, nextZoneAfter, zoneById, zonesInOrder } from '../content/zones'
import { stageAddress, type StageAddress, type ZoneDef } from '../entities/Zone'
import { isBossWave } from '../entities/Wave'
import type { SaveData } from '../core/saveSchema'

export function isZoneUnlocked(save: SaveData, zoneId: string): boolean {
  return save.meta.unlockedZones.includes(zoneId)
}

export function isStageCleared(save: SaveData, address: StageAddress): boolean {
  return save.meta.clearedStages.includes(address)
}

export function isZoneCleared(save: SaveData, zone: ZoneDef): boolean {
  return zone.stages.every((s) => isStageCleared(save, stageAddress(zone.id, s.id)))
}

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

export function unlockReachableZones(save: SaveData): string[] {
  const added: string[] = []

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

  clearedCount: number
  stageCount: number
  stages: StageView[]
}

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

export function nextStageFor(save: SaveData): StageAddress | null {
  for (const zone of zonesInOrder()) {
    if (!isZoneUnlocked(save, zone.id)) continue
    for (const s of zone.stages) {
      const address = stageAddress(zone.id, s.id)
      if (!isStageCleared(save, address) && isStageUnlocked(save, address)) return address
    }
  }

  const last = zonesInOrder().at(-1)
  const stage = last?.stages.at(-1)
  return last && stage ? stageAddress(last.id, stage.id) : null
}

export { nextZoneAfter }
