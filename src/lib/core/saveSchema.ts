import type { StageAddress } from '../entities/Zone'
import { STARTING_ZONE_ID } from '../content/zones'

/**
 * The save schema.
 *
 * Structured around the single most important distinction in the economy: what
 * a Rewinding resets and what it keeps (docs/design/economy-spec.md §3).
 * `run` is discarded on Rewind; `meta` survives. Keeping them in separate
 * objects means prestige is a field swap rather than a field-by-field audit,
 * and a new persistent value cannot be reset by accident.
 *
 * Everything here references content by **stable string id**. Never store a
 * def object — content changes between versions, saves must not.
 */

export const SCHEMA_VERSION = 4

/** Discarded on Rewinding. */
export interface RunState {
  /** Run currency. Resets to zero. */
  filings: number

  /** Where the player is. Null before the first stage is entered. */
  currentStage: StageAddress | null

  /** Highest scalingIndex cleared this run — drives the Recollection award. */
  deepestScalingIndex: number

  /**
   * Formation: which Movement occupies which slot.
   * Key is `${ring}:${slot}`, value is a MovementDef id.
   */
  formation: Record<string, string>

  /** Chime mounts. Key is the rim mount index, value is a ChimeDef id. */
  mounts: Record<string, string>

  /** Escalating in-run sink counters — see economy-spec.md §1. */
  repairsThisStage: number
  reinforcements: number

  /** Epoch ms. Used for run-length statistics. */
  startedAt: number

  /**
   * Filings per second the player was earning when they last played, which is
   * what offline progress is scaled from. Added in schema 4.
   *
   * In `run` rather than `meta` because it describes the strength of *this*
   * run: a Rewind takes the formation away, so the rate it earned must go with
   * it. Otherwise the first absence after a Rewind would pay at the old
   * formation's rate.
   */
  filingsPerSecond: number
}

/** A named formation, kept across Rewinds. See progression/loadout.ts. */
export interface Preset {
  name: string
  formation: Record<string, string>
  mounts: Record<string, string>
}

/** Survives every Rewinding. */
export interface MetaState {
  /** Prestige currency. */
  recollection: number
  /** Roster tokens. First-clear only, so unfarmable. */
  keys: number

  /** Purchased Escapement Tree node ids. Respec is free, so this is a set. */
  purchasedNodes: string[]

  /** Unlocked roster. Key is a def id, value is its level. */
  movements: Record<string, number>
  chimes: Record<string, number>

  /**
   * Saved formations, by name. Added in schema 2.
   *
   * In `meta` rather than `run` deliberately: an arrangement a player liked
   * should survive the Rewind that takes the units away, or every reset would
   * mean rebuilding from memory. They store ids and slots only, never costs.
   */
  presets: Preset[]

  /**
   * Chime upgrade tracks, keyed by def id then track name. Added in schema 3.
   *
   * Separate from `chimes` (which holds unlock state) because a Chime is
   * *shaped* rather than levelled — see progression/support.ts.
   */
  chimeUpgrades: Record<string, Record<string, number>>

  /** Zone ids the player may enter. */
  unlockedZones: string[]
  /** First-cleared stages. Membership gates Key awards. */
  clearedStages: StageAddress[]

  /** Unlocked achievement ids. */
  achievements: string[]

  /** Number of completed Rewindings. Gates tutorial and UI reveals. */
  rewindCount: number
}

export interface Settings {
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  /** P4 and Phase 43: accessibility toggles. */
  screenShake: boolean
  reducedMotion: boolean
  colourblindPalette: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'
  textScale: number
  showFps: boolean
}

export interface Statistics {
  totalFilingsEarned: number
  totalSlackDestroyed: number
  conjunctionsFired: number
  deepestScalingIndexEver: number
  /** Seconds of active play. Offline time is not counted. */
  playtimeSeconds: number
  firstPlayedAt: number
}

export interface SaveData {
  schemaVersion: number
  /** Epoch ms. Phase 27 reads the delta for offline progress. */
  savedAt: number

  run: RunState
  meta: MetaState
  settings: Settings
  statistics: Statistics
}

export function createDefaultSave(now = Date.now()): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now,
    run: {
      filings: 0,
      currentStage: null,
      deepestScalingIndex: 0,
      formation: {},
      mounts: {},
      repairsThisStage: 0,
      reinforcements: 0,
      startedAt: now,
      filingsPerSecond: 0,
    },
    meta: {
      recollection: 0,
      keys: 0,
      purchasedNodes: [],
      movements: {},
      chimes: {},
      presets: [],
      chimeUpgrades: {},
      unlockedZones: [STARTING_ZONE_ID],
      clearedStages: [],
      achievements: [],
      rewindCount: 0,
    },
    settings: {
      masterVolume: 0.8,
      musicVolume: 0.6,
      sfxVolume: 0.8,
      screenShake: true,
      reducedMotion: false,
      colourblindPalette: 'none',
      textScale: 1,
      showFps: false,
    },
    statistics: {
      totalFilingsEarned: 0,
      totalSlackDestroyed: 0,
      conjunctionsFired: 0,
      deepestScalingIndexEver: 0,
      playtimeSeconds: 0,
      firstPlayedAt: now,
    },
  }
}

/**
 * Reset for a Rewinding: a fresh RunState, everything else untouched.
 *
 * Note what is *not* reset — `meta.unlockedZones` and `meta.clearedStages`
 * survive, because a Rewind resets power within a run and never access to
 * content already unlocked (economy-spec.md §3). Re-traversing cleared content
 * is the genre's main churn driver and is designed out.
 */
export function resetRun(save: SaveData, now = Date.now()): SaveData {
  return {
    ...save,
    run: createDefaultSave(now).run,
    meta: { ...save.meta, rewindCount: save.meta.rewindCount + 1 },
    savedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Validation
//
// Hand-rolled rather than pulling in a schema library: the shape is small and
// stable, and a dependency here would be carried for the life of the project.
//
// Repairing is deliberate. A save that is missing a field added in a later
// build should load with that field defaulted, not be rejected — the player's
// 25-40 hours matter more than schema purity. Only structural nonsense fails.
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean
  data?: SaveData
  problems: string[]
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function num(v: unknown, fallback: number, min = -Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function strRecord(v: unknown): Record<string, string> {
  if (!isObject(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v)) if (typeof val === 'string') out[k] = val
  return out
}

/**
 * Sanitise saved presets.
 *
 * Drops anything malformed rather than repairing it: a preset is a convenience,
 * and a half-recovered one that silently fields the wrong units would be worse
 * than a missing one.
 */
function presetArray(v: unknown): Preset[] {
  if (!Array.isArray(v)) return []
  const out: Preset[] = []
  for (const entry of v) {
    if (!isObject(entry) || typeof entry.name !== 'string') continue
    out.push({
      name: entry.name,
      formation: strRecord(entry.formation),
      mounts: strRecord(entry.mounts),
    })
  }
  return out
}

/** Two levels of `numRecord`, for `defId -> track -> level`. */
function nestedNumRecord(v: unknown): Record<string, Record<string, number>> {
  if (!isObject(v)) return {}
  const out: Record<string, Record<string, number>> = {}
  for (const [k, val] of Object.entries(v)) {
    if (isObject(val)) out[k] = numRecord(val)
  }
  return out
}

function numRecord(v: unknown): Record<string, number> {
  if (!isObject(v)) return {}
  const out: Record<string, number> = {}
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = val
  }
  return out
}

/**
 * Validate and repair a parsed save.
 *
 * Fails only on structural problems — not an object, or a missing/invalid
 * schemaVersion. Everything else is repaired against defaults, with each repair
 * reported in `problems` so it can be logged.
 */
export function validateSave(raw: unknown, now = Date.now()): ValidationResult {
  const problems: string[] = []

  if (!isObject(raw)) {
    return { ok: false, problems: ['Save is not an object'] }
  }

  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, problems: [`Invalid schemaVersion: ${String(version)}`] }
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      problems: [
        `Save is from a newer version (schema ${version}, this build understands ${SCHEMA_VERSION}). ` +
          'Refusing to load rather than silently discarding data.',
      ],
    }
  }

  const d = createDefaultSave(now)
  const run = isObject(raw.run) ? raw.run : (problems.push('Missing run state'), {})
  const meta = isObject(raw.meta) ? raw.meta : (problems.push('Missing meta state'), {})
  const settings = isObject(raw.settings) ? raw.settings : {}
  const stats = isObject(raw.statistics) ? raw.statistics : {}

  const data: SaveData = {
    schemaVersion: version,
    savedAt: num(raw.savedAt, now, 0),
    run: {
      filings: num(run.filings, 0, 0),
      currentStage:
        typeof run.currentStage === 'string' ? (run.currentStage as StageAddress) : null,
      deepestScalingIndex: num(run.deepestScalingIndex, 0, 0),
      formation: strRecord(run.formation),
      mounts: strRecord(run.mounts),
      repairsThisStage: num(run.repairsThisStage, 0, 0),
      reinforcements: num(run.reinforcements, 0, 0),
      startedAt: num(run.startedAt, now, 0),
      filingsPerSecond: num(run.filingsPerSecond, 0, 0),
    },
    meta: {
      recollection: num(meta.recollection, 0, 0),
      keys: num(meta.keys, 0, 0),
      purchasedNodes: strArray(meta.purchasedNodes),
      movements: numRecord(meta.movements),
      chimes: numRecord(meta.chimes),
      presets: presetArray(meta.presets),
      chimeUpgrades: nestedNumRecord(meta.chimeUpgrades),
      unlockedZones: strArray(meta.unlockedZones),
      clearedStages: strArray(meta.clearedStages) as StageAddress[],
      achievements: strArray(meta.achievements),
      rewindCount: num(meta.rewindCount, 0, 0),
    },
    settings: {
      masterVolume: clamp01(num(settings.masterVolume, d.settings.masterVolume)),
      musicVolume: clamp01(num(settings.musicVolume, d.settings.musicVolume)),
      sfxVolume: clamp01(num(settings.sfxVolume, d.settings.sfxVolume)),
      screenShake: bool(settings.screenShake, d.settings.screenShake),
      reducedMotion: bool(settings.reducedMotion, d.settings.reducedMotion),
      colourblindPalette: isPalette(settings.colourblindPalette)
        ? settings.colourblindPalette
        : d.settings.colourblindPalette,
      textScale: Math.min(2, Math.max(0.75, num(settings.textScale, 1))),
      showFps: bool(settings.showFps, d.settings.showFps),
    },
    statistics: {
      totalFilingsEarned: num(stats.totalFilingsEarned, 0, 0),
      totalSlackDestroyed: num(stats.totalSlackDestroyed, 0, 0),
      conjunctionsFired: num(stats.conjunctionsFired, 0, 0),
      deepestScalingIndexEver: num(stats.deepestScalingIndexEver, 0, 0),
      playtimeSeconds: num(stats.playtimeSeconds, 0, 0),
      firstPlayedAt: num(stats.firstPlayedAt, now, 0),
    },
  }

  // A player must always be able to enter the game.
  if (data.meta.unlockedZones.length === 0) {
    data.meta.unlockedZones = [STARTING_ZONE_ID]
    problems.push('No unlocked zones; restored the starting zone')
  }

  return { ok: true, data, problems }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function isPalette(v: unknown): v is Settings['colourblindPalette'] {
  return v === 'none' || v === 'deuteranopia' || v === 'protanopia' || v === 'tritanopia'
}
