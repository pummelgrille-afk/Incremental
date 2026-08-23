import { SCHEMA_VERSION } from './saveSchema'
import { DEFAULT_BINDINGS } from '../content/keybindings'

export type RawSave = Record<string, unknown>
export type Migration = (save: RawSave) => RawSave

const PLATFORM_IDS: Readonly<Record<string, string>> = {
  hammer: 'bolt',
  detent: 'anchor',
  pallet: 'rake',
}

const ARRAY_IDS: Readonly<Record<string, string>> = {
  'quarter-bell': 'long-baseline',
}

const ZONE_IDS: Readonly<Record<string, string>> = {
  'escapement-floor': 'service-floor',
}

const NODE_IDS: Readonly<Record<string, string>> = {
  'winding-tension-of-the-stroke': 'aperture-force-of-the-pulse',
  'winding-shortened-escape': 'aperture-shortened-dwell',
  'winding-sympathetic-stroke': 'aperture-sympathetic-pulse',
  'bracing-deeper-winding': 'shielding-deeper-reserves',
  'bracing-hardened-pallets': 'shielding-hardened-plating',
  'bracing-broadened-guard': 'shielding-broadened-guard',
  'salvage-swarf-discipline': 'recovery-debris-discipline',
  'salvage-honest-accounting': 'recovery-honest-accounting',
  'salvage-the-long-view': 'recovery-the-long-view',
  'salvage-the-night-shift': 'recovery-the-night-shift',
  'salvage-standing-orders': 'recovery-standing-orders',
  'regulation-second-beat': 'regulation-second-flare',
}

const TRACK_IDS: Readonly<Record<string, string>> = { winding: 'recharge' }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const remap = (id: string, table: Readonly<Record<string, string>>): string =>
  table[id] ?? id

function remapStage(address: string): string {
  const colon = address.indexOf(':')
  if (colon < 0) return remap(address, ZONE_IDS)
  return remap(address.slice(0, colon), ZONE_IDS) + address.slice(colon)
}

function remapKeys(
  value: unknown,
  table: Readonly<Record<string, string>>,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[remap(k, table)] = v
  }
  return out
}

function remapValues(
  value: unknown,
  table: Readonly<Record<string, string>>,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = typeof v === 'string' ? remap(v, table) : v
  }
  return out
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

const TUTORIAL_IDS_AT_SCHEMA_7 = [
  'standing-watch',
  'the-flare',
  'the-formation',
  'conjunction',
  'clearance',
  'the-arrays',
  'the-ladder',
  'the-almanac',
  'the-rewind',
]

export const MIGRATIONS: Readonly<Record<number, Migration>> = Object.freeze({
  7: (save) => {
    const settings = isObject(save.settings) ? save.settings : {}

    return {
      ...save,
      schemaVersion: 8,
      settings: {
        ...settings,
        keybindings: isObject(settings.keybindings)
          ? { ...DEFAULT_BINDINGS, ...settings.keybindings }
          : { ...DEFAULT_BINDINGS },
      },
    }
  },

  6: (save) => {
    const meta = (save.meta ?? {}) as Record<string, unknown>
    const cleared = Array.isArray(meta.clearedStages) ? meta.clearedStages.length : 0

    return {
      ...save,
      schemaVersion: 7,
      meta: {
        ...meta,
        tutorialSeen: Array.isArray(meta.tutorialSeen)
          ? meta.tutorialSeen
          : cleared > 0
            ? [...TUTORIAL_IDS_AT_SCHEMA_7]
            : [],
      },
    }
  },

  5: (save) => {
    const run = (save.run ?? {}) as Record<string, unknown>
    const meta = (save.meta ?? {}) as Record<string, unknown>
    const stats = (save.statistics ?? {}) as Record<string, unknown>

    const {
      filings,
      filingsPerSecond,
      chimesEverMounted,
      formation,
      currentStage,
      ...restRun
    } = run
    const {
      keys,
      movements,
      chimes,
      chimeUpgrades,
      purchasedNodes,
      unlockedZones,
      clearedStages,
      presets,
      ...restMeta
    } = meta
    const { totalFilingsEarned, totalSlackDestroyed, ...restStats } = stats

    const trackLedger: Record<string, unknown> = {}
    for (const [defId, tracks] of Object.entries(remapKeys(chimeUpgrades, ARRAY_IDS))) {
      trackLedger[defId] = remapKeys(tracks, TRACK_IDS)
    }

    return {
      ...save,
      schemaVersion: 6,
      run: {
        ...restRun,
        salvage: filings,
        salvagePerSecond: filingsPerSecond,
        arraysEverMounted: chimesEverMounted,
        formation: remapValues(formation, PLATFORM_IDS),
        mounts: remapValues(run.mounts, ARRAY_IDS),
        currentStage: typeof currentStage === 'string' ? remapStage(currentStage) : null,
      },
      meta: {
        ...restMeta,
        clearance: keys,
        platforms: remapKeys(movements, PLATFORM_IDS),
        arrays: remapKeys(chimes, ARRAY_IDS),
        arrayUpgrades: trackLedger,
        purchasedNodes: strings(purchasedNodes).map((id) => remap(id, NODE_IDS)),
        unlockedZones: strings(unlockedZones).map((id) => remap(id, ZONE_IDS)),
        clearedStages: strings(clearedStages).map(remapStage),
        presets: (Array.isArray(presets) ? presets : []).map((entry) => {
          if (entry === null || typeof entry !== 'object') return entry
          const preset = entry as Record<string, unknown>
          const out: Record<string, unknown> = { ...preset }

          if (preset.formation !== undefined) {
            out.formation = remapValues(preset.formation, PLATFORM_IDS)
          }
          if (preset.mounts !== undefined) {
            out.mounts = remapValues(preset.mounts, ARRAY_IDS)
          }
          return out
        }),
      },
      statistics: {
        ...restStats,
        totalSalvageEarned: totalFilingsEarned,
        totalContactsDestroyed: totalSlackDestroyed,
      },
    }
  },

  4: (save) => {
    const run = (save.run ?? {}) as Record<string, unknown>
    return {
      ...save,
      schemaVersion: 5,
      run: { ...run, chimesEverMounted: run.chimesEverMounted === true },
    }
  },

  3: (save) => {
    const run = (save.run ?? {}) as Record<string, unknown>
    return {
      ...save,
      schemaVersion: 4,
      run: {
        ...run,
        filingsPerSecond: typeof run.filingsPerSecond === 'number' ? run.filingsPerSecond : 0,
      },
    }
  },

  2: (save) => {
    const meta = (save.meta ?? {}) as Record<string, unknown>
    return {
      ...save,
      schemaVersion: 3,
      meta: {
        ...meta,
        chimeUpgrades:
          meta.chimeUpgrades !== null && typeof meta.chimeUpgrades === 'object'
            ? meta.chimeUpgrades
            : {},
      },
    }
  },

  1: (save) => {
    const meta = (save.meta ?? {}) as Record<string, unknown>
    return {
      ...save,
      schemaVersion: 2,
      meta: { ...meta, presets: Array.isArray(meta.presets) ? meta.presets : [] },
    }
  },
})

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

export function migrate(raw: RawSave): { save: RawSave; applied: number[] } {
  let save = raw
  const applied: number[] = []

  let version = typeof save.schemaVersion === 'number' ? save.schemaVersion : 0

  let guard = 0
  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version]
    if (!migration) {
      throw new MigrationError(
        `No migration from schema version ${version} to ${version + 1}`,
      )
    }

    save = migration(save)
    applied.push(version)

    const next = typeof save.schemaVersion === 'number' ? save.schemaVersion : version
    if (next <= version) {
      throw new MigrationError(
        `Migration from version ${version} did not advance schemaVersion`,
      )
    }
    version = next

    if (++guard > 100) {
      throw new MigrationError('Migration chain exceeded 100 steps; aborting')
    }
  }

  return { save, applied }
}

export function needsMigration(raw: RawSave): boolean {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0
  return version < SCHEMA_VERSION
}
