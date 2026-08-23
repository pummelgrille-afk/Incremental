import type { StageAddress } from '../entities/Zone'
import { DEFAULT_LOCALE, localeByCode } from '../i18n/locales'
import { STARTING_ZONE_ID } from '../content/zones'
import { DEFAULT_BINDINGS, type ActionId } from '../content/keybindings'
import { normaliseBindings } from './keybindings'

export const SCHEMA_VERSION = 8

export interface RunState {
  salvage: number

  currentStage: StageAddress | null

  deepestScalingIndex: number

  formation: Record<string, string>

  mounts: Record<string, string>

  repairsThisStage: number
  reinforcements: number

  startedAt: number

  salvagePerSecond: number

  arraysEverMounted: boolean
}

export interface Preset {
  name: string
  formation: Record<string, string>
  mounts: Record<string, string>
}

export interface MetaState {
  recollection: number

  clearance: number

  purchasedNodes: string[]

  platforms: Record<string, number>
  arrays: Record<string, number>

  presets: Preset[]

  arrayUpgrades: Record<string, Record<string, number>>

  unlockedZones: string[]

  clearedStages: StageAddress[]

  achievements: string[]

  tutorialSeen: string[]

  rewindCount: number
}

export interface Settings {
  masterVolume: number
  musicVolume: number
  sfxVolume: number

  screenShake: boolean
  reducedMotion: boolean
  colourblindPalette: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'
  textScale: number
  showFps: boolean

  locale: string

  keybindings: Record<ActionId, string>
}

export interface Statistics {
  totalSalvageEarned: number
  totalContactsDestroyed: number
  conjunctionsFired: number
  deepestScalingIndexEver: number

  playtimeSeconds: number
  firstPlayedAt: number
}

export interface SaveData {
  schemaVersion: number

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
      salvage: 0,
      currentStage: null,
      deepestScalingIndex: 0,
      formation: {},
      mounts: {},
      repairsThisStage: 0,
      reinforcements: 0,
      startedAt: now,
      salvagePerSecond: 0,
      arraysEverMounted: false,
    },
    meta: {
      recollection: 0,
      clearance: 0,
      purchasedNodes: [],
      platforms: {},
      arrays: {},
      presets: [],
      arrayUpgrades: {},
      unlockedZones: [STARTING_ZONE_ID],
      clearedStages: [],
      achievements: [],
      tutorialSeen: [],
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
      keybindings: { ...DEFAULT_BINDINGS },
      showFps: false,
      locale: DEFAULT_LOCALE,
    },
    statistics: {
      totalSalvageEarned: 0,
      totalContactsDestroyed: 0,
      conjunctionsFired: 0,
      deepestScalingIndexEver: 0,
      playtimeSeconds: 0,
      firstPlayedAt: now,
    },
  }
}

export function resetRun(save: SaveData, now = Date.now()): SaveData {
  return {
    ...save,
    run: createDefaultSave(now).run,
    meta: { ...save.meta, rewindCount: save.meta.rewindCount + 1 },
    savedAt: now,
  }
}

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
      salvage: num(run.salvage, 0, 0),
      currentStage:
        typeof run.currentStage === 'string' ? (run.currentStage as StageAddress) : null,
      deepestScalingIndex: num(run.deepestScalingIndex, 0, 0),
      formation: strRecord(run.formation),
      mounts: strRecord(run.mounts),
      repairsThisStage: num(run.repairsThisStage, 0, 0),
      reinforcements: num(run.reinforcements, 0, 0),
      startedAt: num(run.startedAt, now, 0),
      salvagePerSecond: num(run.salvagePerSecond, 0, 0),
      arraysEverMounted: run.arraysEverMounted === true,
    },
    meta: {
      recollection: num(meta.recollection, 0, 0),
      clearance: num(meta.clearance, 0, 0),
      purchasedNodes: strArray(meta.purchasedNodes),
      platforms: numRecord(meta.platforms),
      arrays: numRecord(meta.arrays),
      presets: presetArray(meta.presets),
      arrayUpgrades: nestedNumRecord(meta.arrayUpgrades),
      unlockedZones: strArray(meta.unlockedZones),
      clearedStages: strArray(meta.clearedStages) as StageAddress[],
      achievements: strArray(meta.achievements),
      tutorialSeen: strArray(meta.tutorialSeen),
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

      locale:
        typeof settings.locale === 'string' && localeByCode(settings.locale) !== undefined
          ? settings.locale
          : d.settings.locale,

      keybindings: normaliseBindings(settings.keybindings),
    },
    statistics: {
      totalSalvageEarned: num(stats.totalSalvageEarned, 0, 0),
      totalContactsDestroyed: num(stats.totalContactsDestroyed, 0, 0),
      conjunctionsFired: num(stats.conjunctionsFired, 0, 0),
      deepestScalingIndexEver: num(stats.deepestScalingIndexEver, 0, 0),
      playtimeSeconds: num(stats.playtimeSeconds, 0, 0),
      firstPlayedAt: num(stats.firstPlayedAt, now, 0),
    },
  }

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
