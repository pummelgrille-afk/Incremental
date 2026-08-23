import { SUPPORT } from '../content/economy'
import { ARRAYS, arrayById } from '../content/arrays'
import { isUnlocked } from './roster'
import type { ArrayDef } from '../entities/Array'
import type { SaveData } from '../core/saveSchema'

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

export function buyTrack(save: SaveData, defId: string, track: SupportTrack): boolean {
  const cost = trackCost(save, defId, track)
  if (cost === null || save.meta.clearance < cost) return false

  const def = arrayById(defId)
  if (def && !movesTheNeedle(save, def, track)) return false

  save.meta.clearance -= cost
  const entry = ledger(save, defId)
  entry[track] = (entry[track] ?? 0) + 1
  return true
}

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

    chargeInterval: Math.max(
      SUPPORT.recharge.floorSeconds,
      def.chargeInterval - recharge * SUPPORT.recharge.secondsPerLevel,
    ),
    attack: def.attack * (1 + resonance * SUPPORT.resonance.attackPerLevel),
  }
}

export interface TrackView {
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

function movesTheNeedle(save: SaveData, def: ArrayDef, track: SupportTrack): boolean {
  const current = supportStats(save, def)
  const next = supportStats(withOneMore(save, def.id, track), def)

  return (
    next.maxCharge !== current.maxCharge ||
    next.chargeInterval !== current.chargeInterval ||
    next.attack !== current.attack
  )
}

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
