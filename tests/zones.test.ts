import { beforeEach, describe, expect, it } from 'vitest'
import { ZONES, nextZoneAfter, zoneById, zonesInOrder } from '../src/lib/content/zones'
import { BOSSES, bossById } from '../src/lib/content/bosses'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { loadStage } from '../src/lib/core/stageLoader'
import { isBossStage } from '../src/lib/systems/scaling'
import { applyStageClear } from '../src/lib/progression/currencies'
import {
  isStageUnlocked,
  isZoneCleared,
  isZoneUnlocked,
  mapView,
  nextStageFor,
  unlockReachableZones,
} from '../src/lib/progression/map'
import { isBossWave } from '../src/lib/entities/Wave'
import { stageAddress, type StageAddress } from '../src/lib/entities/Zone'
import type { SaveData } from '../src/lib/core/saveSchema'

let save: SaveData

beforeEach(() => {
  save = createDefaultSave(0)
})

function clearZone(zoneId: string): void {
  const zone = zoneById(zoneId)!
  for (const s of zone.stages) applyStageClear(save, stageAddress(zone.id, s.id))
}

describe('the ladder', () => {
  it('transcribes the zone names narrative.md authored, in order', () => {
    expect(zonesInOrder().map((z) => z.name)).toEqual([
      'The Service Floor',
      'The Fast Orbit',
      'The Veil',
      'The Home Orbit',
      'The Cold Line',
      'The Unlit Orbit',
    ])
  })

  it('gives every zone an epigraph and an attribution', () => {
    for (const z of ZONES) {
      expect(z.epigraph.length, z.id).toBeGreaterThan(20)
      expect(z.epigraphAttribution.length, z.id).toBeGreaterThan(0)
    }
  })

  it('is continuous and starts at one', () => {
    const indices = zonesInOrder().flatMap((z) => z.stages.map((s) => s.scalingIndex))
    expect(indices[0]).toBe(1)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i], `after ${indices[i - 1]}`).toBe(indices[i - 1] + 1)
    }
  })

  it('chains every zone to the one before it', () => {
    const order = zonesInOrder()
    expect(order[0].requires, 'the first zone requires nothing').toBeUndefined()
    for (let i = 1; i < order.length; i++) {
      expect(order[i].requires, order[i].id).toBe(order[i - 1].id)
    }
  })

  it('has unique zone ids, stage ids and stage names', () => {
    const zoneIds = ZONES.map((z) => z.id)
    expect(new Set(zoneIds).size).toBe(zoneIds.length)

    const addresses = ZONES.flatMap((z) => z.stages.map((s) => stageAddress(z.id, s.id)))
    expect(new Set(addresses).size).toBe(addresses.length)

    const names = ZONES.flatMap((z) => z.stages.map((s) => s.name))
    expect(new Set(names).size, 'two stages share a name').toBe(names.length)
  })

  it('gets harder outward', () => {
    const order = zonesInOrder()
    for (let i = 1; i < order.length; i++) {
      expect(order[i].scalingMultiplier, order[i].id).toBeGreaterThan(
        order[i - 1].scalingMultiplier,
      )
    }
  })

  it('loads every authored stage', () => {
    for (const zone of ZONES) {
      for (const s of zone.stages) {
        expect(() => loadStage(stageAddress(zone.id, s.id))).not.toThrow()
      }
    }
  })
})

describe('bosses are reachable', () => {
  it('puts a boss on every stage the interval calls for, and nowhere else', () => {
    for (const zone of ZONES) {
      for (const s of zone.stages) {
        const hasBoss = s.waves.some(isBossWave)
        expect(hasBoss, `${zone.id}:${s.id} at index ${s.scalingIndex}`).toBe(
          isBossStage(s.scalingIndex),
        )
      }
    }
  })

  it('makes every boss the final stage of its zone', () => {
    for (const zone of ZONES) {
      const bossIndexes = zone.stages
        .map((s, i) => (s.waves.some(isBossWave) ? i : -1))
        .filter((i) => i >= 0)
      for (const i of bossIndexes) {
        expect(i, `${zone.id} has a boss at stage ${i + 1} of ${zone.stages.length}`).toBe(
          zone.stages.length - 1,
        )
      }
    }
  })

  it('reaches every authored boss exactly once', () => {
    const placed = ZONES.flatMap((z) =>
      z.stages.flatMap((s) => s.waves.filter(isBossWave).map((w) => w.bossId)),
    )
    expect(new Set(placed).size, 'a boss is placed twice').toBe(placed.length)
    for (const b of BOSSES) {
      expect(placed, `${b.id} is unreachable`).toContain(b.id)
    }
  })

  it('names a boss that exists at every boss stage', () => {
    for (const zone of ZONES) {
      for (const s of zone.stages) {
        for (const wave of s.waves) {
          if (!isBossWave(wave)) continue
          expect(bossById(wave.bossId), `${zone.id}:${s.id}`).toBeDefined()
        }
      }
    }
  })

  it('puts the first boss inside a first run', () => {
    const first = ZONES.flatMap((z) => z.stages)
      .filter((s) => s.waves.some(isBossWave))
      .sort((a, b) => a.scalingIndex - b.scalingIndex)[0]
    expect(first.scalingIndex).toBeLessThanOrEqual(8)
  })
})

describe('zone unlocking', () => {
  it('opens only the starting zone on a fresh save', () => {
    expect(save.meta.unlockedZones).toEqual(['service-floor'])
    for (const zone of ZONES.slice(1)) {
      expect(isZoneUnlocked(save, zone.id), zone.id).toBe(false)
    }
  })

  it('opens the next zone when the previous one is fully cleared', () => {
    clearZone('service-floor')
    expect(isZoneUnlocked(save, 'fast-orbit')).toBe(true)
    expect(isZoneUnlocked(save, 'the-veil'), 'only one step').toBe(false)
  })

  it('does not open the next zone on a partial clear', () => {
    const zone = zoneById('service-floor')!
    for (const s of zone.stages.slice(0, -1)) {
      applyStageClear(save, stageAddress(zone.id, s.id))
    }
    expect(isZoneCleared(save, zone)).toBe(false)
    expect(isZoneUnlocked(save, 'fast-orbit')).toBe(false)
  })

  it('reports what a clear opened', () => {
    const zone = zoneById('service-floor')!
    const last = zone.stages.at(-1)!
    for (const s of zone.stages.slice(0, -1)) {
      applyStageClear(save, stageAddress(zone.id, s.id))
    }
    const reward = applyStageClear(save, stageAddress(zone.id, last.id))
    expect(reward.unlockedZones).toEqual(['fast-orbit'])
  })

  it('catches up several zones at once', () => {
    clearZone('service-floor')
    clearZone('fast-orbit')
    clearZone('the-veil')
    save.meta.unlockedZones = ['service-floor']

    const added = unlockReachableZones(save)

    expect(added).toEqual(['fast-orbit', 'the-veil', 'home-orbit'])
  })

  it('is idempotent', () => {
    clearZone('service-floor')
    const before = [...save.meta.unlockedZones]
    unlockReachableZones(save)
    unlockReachableZones(save)
    expect(save.meta.unlockedZones).toEqual(before)
  })

  it('survives a Rewind, because a Rewind never takes access', () => {
    clearZone('service-floor')
    expect(isZoneUnlocked(save, 'fast-orbit')).toBe(true)

    save.run = createDefaultSave(0).run
    expect(isZoneUnlocked(save, 'fast-orbit')).toBe(true)
  })
})

describe('stage unlocking', () => {
  it('opens the first stage of an unlocked zone', () => {
    expect(isStageUnlocked(save, 'service-floor:first-shift')).toBe(true)
  })

  it('keeps later stages shut until the one before is cleared', () => {
    expect(isStageUnlocked(save, 'service-floor:routine-maintenance')).toBe(false)
    applyStageClear(save, 'service-floor:first-shift')
    expect(isStageUnlocked(save, 'service-floor:routine-maintenance')).toBe(true)
  })

  it('keeps a cleared stage open', () => {
    applyStageClear(save, 'service-floor:first-shift')
    expect(isStageUnlocked(save, 'service-floor:first-shift')).toBe(true)
  })

  it('shuts every stage of a locked zone', () => {
    const zone = zoneById('fast-orbit')!
    for (const s of zone.stages) {
      expect(isStageUnlocked(save, stageAddress(zone.id, s.id)), s.id).toBe(false)
    }
  })

  it('refuses an address that does not exist', () => {
    expect(isStageUnlocked(save, 'service-floor:nowhere' as StageAddress)).toBe(false)
    expect(isStageUnlocked(save, 'nowhere:first-shift' as StageAddress)).toBe(false)
  })
})

describe('nextStageFor', () => {
  it('starts a fresh save at the first stage', () => {
    expect(nextStageFor(save)).toBe('service-floor:first-shift')
  })

  it('walks forward as stages are cleared', () => {
    applyStageClear(save, 'service-floor:first-shift')
    expect(nextStageFor(save)).toBe('service-floor:routine-maintenance')
  })

  it('crosses a zone boundary', () => {
    clearZone('service-floor')
    expect(nextStageFor(save)).toBe('fast-orbit:close-work')
  })

  it('never returns null while content exists', () => {
    for (const zone of ZONES) clearZone(zone.id)
    expect(nextStageFor(save)).not.toBeNull()
  })
})

describe('the map view', () => {
  it('reports every zone, locked ones included', () => {
    const view = mapView(save)
    expect(view).toHaveLength(ZONES.length)
    expect(view.filter((z) => !z.unlocked).length).toBe(ZONES.length - 1)
  })

  it('orders zones by index', () => {
    const view = mapView(save)
    for (let i = 1; i < view.length; i++) {
      expect(view[i].index).toBeGreaterThan(view[i - 1].index)
    }
  })

  it('marks boss stages', () => {
    const view = mapView(save)
    const bossStages = view.flatMap((z) => z.stages.filter((s) => s.isBoss))
    expect(bossStages).toHaveLength(BOSSES.length)
  })

  it('counts progress within a zone', () => {
    applyStageClear(save, 'service-floor:first-shift')
    const zone = mapView(save).find((z) => z.id === 'service-floor')!
    expect(zone.clearedCount).toBe(1)
    expect(zone.stageCount).toBe(zoneById('service-floor')!.stages.length)
    expect(zone.cleared).toBe(false)
  })
})

describe('nextZoneAfter', () => {
  it('follows the chain', () => {
    expect(nextZoneAfter('service-floor')?.id).toBe('fast-orbit')
  })

  it('returns nothing past the last zone', () => {
    const last = zonesInOrder().at(-1)!
    expect(nextZoneAfter(last.id)).toBeUndefined()
  })
})
