import { arrayById } from '../content/arrays'
import { platformById } from '../content/platforms'
import { levelScale, levelsOf } from '../progression/roster'
import { supportStats } from '../progression/support'
import type { SaveData } from './saveSchema'
import type { SimulationState } from './simulation'
import type { RingIndex } from '../entities/types'
import type { ArrayInstance } from '../entities/Array'
import type { PlatformInstance } from '../entities/Platform'
import { mountArray, placePlatform, recomputeBonuses, removePlatform } from './formation'

export function syncFieldToSave(sim: SimulationState, save: SaveData): void {
  for (const platform of [...sim.platforms]) {
    const key = `${platform.slot.ring}:${platform.slot.slot}`
    if (save.run.formation[key] !== platform.def.id) {
      removePlatform(sim, platform.slot.ring, platform.slot.slot)
    }
  }
  for (const array of [...sim.arrays]) {
    if (save.run.mounts[String(array.mount)] !== array.def.id) {
      sim.arrays.splice(sim.arrays.indexOf(array), 1)
    }
  }

  const platformLevels = levelsOf(save, 'platform')
  const arrayLevels = levelsOf(save, 'array')

  for (const [key, defId] of Object.entries(save.run.formation)) {
    const [ring, slot] = key.split(':').map(Number)
    const existing = sim.platforms.find((m) => m.slot.ring === ring && m.slot.slot === slot)

    if (existing) {
      refreshPlatform(existing, platformLevels[defId] ?? 1)
      continue
    }

    const def = platformById(defId)
    if (def) placePlatform(sim, def, ring as RingIndex, slot, platformLevels[defId] ?? 1)
  }

  for (const [mount, defId] of Object.entries(save.run.mounts)) {
    const def = arrayById(defId)
    if (!def) continue

    const existing = sim.arrays.find((c) => c.mount === Number(mount))

    if (existing) {
      refreshArray(existing, arrayLevels[defId] ?? 1, supportStats(save, def))
      continue
    }

    mountArray(sim, def, Number(mount), arrayLevels[defId] ?? 1, supportStats(save, def))
  }

  recomputeBonuses(sim)
}

export function refreshPlatform(platform: PlatformInstance, level: number): void {
  if (platform.level === level) return

  const scale = levelScale(level)
  platform.level = level
  platform.levelScale = scale
  platform.maxHp = platform.def.maxHp * scale
  platform.hp = Math.min(platform.hp, platform.maxHp)
}

export function refreshArray(
  array: ArrayInstance,
  level: number,
  stats: { maxCharge: number; chargeInterval: number; attack: number },
): void {
  const scale = levelScale(level)

  array.level = level
  array.levelScale = scale
  array.maxHp = array.def.maxHp * scale
  array.hp = Math.min(array.hp, array.maxHp)

  array.maxCharge = stats.maxCharge
  array.chargeInterval = stats.chargeInterval

  array.attackScale = stats.attack / array.def.attack

  array.charge = Math.min(array.charge, array.maxCharge)
}
