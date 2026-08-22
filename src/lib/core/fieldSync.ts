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

/**
 * Reconcile the live field with the save.
 *
 * Called after every formation edit and every purchase. It used to live inside
 * `bootstrap.ts`, which meant the one rule in it that is easy to get wrong —
 * *what happens to a unit that is already on the field* — could not be tested
 * at all, because `bootstrap.ts` reaches for Pixi and cannot run without a DOM.
 * It got that rule wrong for thirteen phases. See "Refreshed, not skipped".
 *
 * Three passes, in order:
 *
 * 1. Remove anything on the field the save no longer has there.
 * 2. **Refresh** what remains, so an upgrade reaches a unit already fielded.
 * 3. Add anything the save has that the field does not.
 */
export function syncFieldToSave(sim: SimulationState, save: SaveData): void {
  // --- 1. Anything whose identity no longer matches the save. ---------------
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

  // --- 2. Refresh what survived, then 3. place what is missing. -------------
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

/*
 * ## Refreshed, not skipped
 *
 * Both of the functions below exist because of one bug, reported by a player:
 * upgrading a Spotter did nothing until you unmounted it and mounted it again.
 *
 * The cause was that a unit's *derived* numbers — level scale, max HP, charge
 * capacity, recharge rate, attack multiplier — are computed once, when the
 * instance is created, and stored on it. That is the right shape: they are read
 * every tick by dozens of units and recomputing them from the save each time
 * would put progression lookups inside the hot loop. What was missing was the
 * other half of the bargain, which is that anything cached has to be
 * invalidated. Reconciliation only ever *added* and *removed* units, so an
 * instance that stayed put kept the numbers it was born with.
 *
 * It applied to Platform levels too, by exactly the same route. Nobody had
 * reported that one, presumably because levelling a Platform you have not
 * fielded yet is the common case and levelling one mid-run is not.
 *
 * ## What a refresh may and may not do
 *
 * **An upgrade raises the ceiling; it does not change the current state.** HP
 * and charge are kept where they are and clamped to the new maximum. The
 * alternative — scaling them to preserve the *fraction* — makes a purchase heal
 * a damaged unit, and repairs cost Salvage in this game. An upgrade must not be
 * a cheaper repair.
 *
 * Nothing else is touched: not the cooldown, not the current target, not the
 * retarget clock, not a running disable. Those are all "how this unit is doing
 * right now", and an upgrade is not an event in the fight.
 */

/** Bring a fielded Platform's derived stats up to date with its saved level. */
export function refreshPlatform(platform: PlatformInstance, level: number): void {
  if (platform.level === level) return

  const scale = levelScale(level)
  platform.level = level
  platform.levelScale = scale
  platform.maxHp = platform.def.maxHp * scale
  platform.hp = Math.min(platform.hp, platform.maxHp)
}

/** Bring a mounted Array's derived stats up to date with the save. */
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
  // Stored as a multiplier against the def, which is what `combat.ts` reads.
  array.attackScale = stats.attack / array.def.attack

  // Buying capacity must not also fill it. The extra charge is earned at the
  // recharge rate like any other.
  array.charge = Math.min(array.charge, array.maxCharge)
}
