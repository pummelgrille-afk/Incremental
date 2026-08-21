import { game, GENERATORS } from './state.svelte'

const STORAGE_KEY = 'incremental:save:v1'

interface SaveData {
  version: 1
  points: number
  totalEarned: number
  owned: Record<string, number>
  savedAt: number
}

export function save(): void {
  const data: SaveData = {
    version: 1,
    points: game.points,
    totalEarned: game.totalEarned,
    owned: { ...game.owned },
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    game.lastSaved = data.savedAt
  } catch {
    // Private browsing or a full quota: losing a save beats crashing the loop.
  }
}

/** Returns seconds of offline time that were credited, or 0 for a fresh start. */
export function load(): number {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return 0
  }
  if (!raw) return 0

  let data: SaveData
  try {
    data = JSON.parse(raw)
  } catch {
    return 0
  }
  if (data?.version !== 1) return 0

  game.points = Number(data.points) || 0
  game.totalEarned = Number(data.totalEarned) || 0
  for (const def of GENERATORS) {
    game.owned[def.id] = Number(data.owned?.[def.id]) || 0
  }

  const offlineSeconds = Math.max(0, (Date.now() - data.savedAt) / 1000)
  if (offlineSeconds > 1) game.gain(game.pointsPerSecond * offlineSeconds)
  return offlineSeconds
}

export function reset(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
  game.points = 0
  game.totalEarned = 0
  for (const def of GENERATORS) game.owned[def.id] = 0
}
