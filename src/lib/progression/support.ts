import { SUPPORT } from '../content/economy'
import { ARRAYS, arrayById } from '../content/arrays'
import { isUnlocked } from './roster'
import type { ArrayDef } from '../entities/Array'
import type { SaveData } from '../core/saveSchema'

/**
 * Array upgrade tracks.
 *
 * **Arrays are shaped, not levelled.** A Platform levels and gets uniformly
 * stronger; a Array picks between burst, sustain and punch, and the three pull
 * against each other for the same scarce Clearance. That is the "distinct in feel
 * from front-line allies" PLAN.md Phase 25 asks for, expressed as a different
 * *shape* of decision rather than as different numbers on the same lever.
 *
 * Two of the three tracks are about Charge, because Charge is what makes a
 * Array a Array (combat-spec.md §4).
 */

export type SupportTrack = 'capacity' | 'recharge' | 'resonance'

export const SUPPORT_TRACKS: readonly SupportTrack[] = [
  'capacity',
  'recharge',
  'resonance',
] as const

const MAX_LEVEL: Record<SupportTrack, number> = {
  capacity: SUPPORT.capacity.maxLevel,
  recharge: SUPPORT.recharge.maxLevel,
  resonance: SUPPORT.resonance.maxLevel,
}

function ledger(save: SaveData, defId: string): Record<string, number> {
  const all = save.meta.arrayUpgrades
  if (!all[defId]) all[defId] = {}
  return all[defId]
}

export function trackLevel(save: SaveData, defId: string, track: SupportTrack): number {
  return save.meta.arrayUpgrades[defId]?.[track] ?? 0
}

export function maxTrackLevel(track: SupportTrack): number {
  return MAX_LEVEL[track]
}

/**
 * Clearance for the next level of a track, or null at its ceiling.
 *
 * Null rather than a price the player can never pay — the same contract
 * `roster.levelCost` uses, so the two read alike in the editor.
 */
export function trackCost(
  save: SaveData,
  defId: string,
  track: SupportTrack,
): number | null {
  if (!isUnlocked(save, 'array', defId)) return null

  const level = trackLevel(save, defId, track)
  if (level >= MAX_LEVEL[track]) return null

  return Math.ceil(SUPPORT.trackCost.base * SUPPORT.trackCost.growth ** level)
}

/** Buy one level of a track, or refuse. Refusal changes nothing. */
export function buyTrack(save: SaveData, defId: string, track: SupportTrack): boolean {
  const cost = trackCost(save, defId, track)
  if (cost === null || save.meta.clearance < cost) return false

  // Refused here as well as hidden in the view. The Spotter's recharge track is
  // priced and purchasable and, because the unit is authored exactly at
  // `SUPPORT.recharge.floorSeconds`, changes nothing — see `movesTheNeedle`. A
  // rule that only the roster view enforces is a rule a preset, a test or a
  // later caller can walk straight past.
  const def = arrayById(defId)
  if (def && !movesTheNeedle(save, def, track)) return false

  save.meta.clearance -= cost
  const entry = ledger(save, defId)
  entry[track] = (entry[track] ?? 0) + 1
  return true
}

/**
 * A Array's stats after its tracks.
 *
 * Returned as a plain shape rather than a mutated `ArrayDef`: defs are
 * immutable content (CLAUDE.md), and a save that has bought upgrades must never
 * be able to write into the roster every other save shares.
 */
export interface SupportStats {
  maxCharge: number
  chargeInterval: number
  attack: number
}

export function supportStats(save: SaveData, def: ArrayDef): SupportStats {
  const capacity = trackLevel(save, def.id, 'capacity')
  const recharge = trackLevel(save, def.id, 'recharge')
  const resonance = trackLevel(save, def.id, 'resonance')

  return {
    maxCharge: def.maxCharge + capacity * SUPPORT.capacity.chargesPerLevel,
    // Floored, not merely bounded by the level cap: `chargeInterval` is the
    // balance lever between Arrays and Platforms (combat-spec.md §4), and a
    // later re-balance of the levels must not be able to cross it by accident.
    chargeInterval: Math.max(
      SUPPORT.recharge.floorSeconds,
      def.chargeInterval - recharge * SUPPORT.recharge.secondsPerLevel,
    ),
    attack: def.attack * (1 + resonance * SUPPORT.resonance.attackPerLevel),
  }
}

export interface TrackView {
  /**
   * The track's id, and the only name it has.
   *
   * It carried an English `name` and `effect` until Phase 44. A projection is
   * not a place to keep copy — `progression/` cannot be translated, because
   * nothing under it may know which language is on screen — so the editor looks
   * the words up from this id instead.
   */
  track: SupportTrack
  level: number
  maxLevel: number
  cost: number | null
  atMax: boolean
  affordable: boolean
}

export interface SupportView {
  id: string
  name: string
  unlocked: boolean
  tracks: TrackView[]
  stats: SupportStats
}

/** Every Array with its tracks, for the formation editor. */
export function supportRoster(save: SaveData): SupportView[] {
  return ARRAYS.map((def) => {
    const unlocked = isUnlocked(save, 'array', def.id)

    return {
      id: def.id,
      name: def.name,
      unlocked,
      stats: supportStats(save, def),
      tracks: SUPPORT_TRACKS.map((track) => {
        const cost = trackCost(save, def.id, track)
        const level = trackLevel(save, def.id, track)
        const capped = level >= MAX_LEVEL[track] || !movesTheNeedle(save, def, track)
        return {
          track,
          level,
          maxLevel: MAX_LEVEL[track],
          cost,
          atMax: unlocked && capped,
          affordable: cost !== null && save.meta.clearance >= cost && !capped,
        }
      }),
    }
  })
}

/**
 * Would one more level of this track change anything?
 *
 * Almost always yes, and the exception is real: the Spotter is authored at
 * `chargeInterval: 4.5`, which is exactly `SUPPORT.recharge.floorSeconds`. The
 * floor is a **hard** balance bound — combat-spec.md §4 and the note in
 * economy.ts: `chargeInterval` is the lever between Arrays and Platforms, and a
 * later re-tune of the per-level step must not be able to cross it by accident.
 * So a Spotter's recharge track is priced, offered, purchasable, and does
 * literally nothing.
 *
 * Found in Phase 43's follow-up, while fixing a different bug on the same unit,
 * and fixed here rather than in the tuning: the balance is deliberate and
 * documented, so the wrong half is the *offer*. A track that cannot move is at
 * its maximum in every sense a player cares about.
 */
function movesTheNeedle(save: SaveData, def: ArrayDef, track: SupportTrack): boolean {
  const current = supportStats(save, def)
  const next = supportStats(withOneMore(save, def.id, track), def)

  return (
    next.maxCharge !== current.maxCharge ||
    next.chargeInterval !== current.chargeInterval ||
    next.attack !== current.attack
  )
}

/** A throwaway save with one more level in `track`, for the comparison above. */
function withOneMore(save: SaveData, defId: string, track: SupportTrack): SaveData {
  const tracks = save.meta.arrayUpgrades[defId] ?? {}
  return {
    ...save,
    meta: {
      ...save.meta,
      arrayUpgrades: {
        ...save.meta.arrayUpgrades,
        [defId]: { ...tracks, [track]: (tracks[track] ?? 0) + 1 },
      },
    },
  }
}

/** Total Clearance sunk into a Array's tracks. Used by the Rewind's before/after. */
export function investedIn(save: SaveData, defId: string): number {
  const def = arrayById(defId)
  if (!def) return 0

  let total = 0
  for (const track of SUPPORT_TRACKS) {
    const level = trackLevel(save, defId, track)
    for (let i = 0; i < level; i++) {
      total += Math.ceil(SUPPORT.trackCost.base * SUPPORT.trackCost.growth ** i)
    }
  }
  return total
}
