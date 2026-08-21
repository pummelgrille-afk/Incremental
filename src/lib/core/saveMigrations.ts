import { SCHEMA_VERSION } from './saveSchema'

/**
 * Save schema migrations.
 *
 * The machinery exists from day one even though there is nothing to migrate
 * yet. ADR-002 is explicit about why: migrations are cheap to design now and
 * painful to retrofit. The first time a field changes shape, the only work is
 * adding one entry here.
 *
 * A migration takes a save at version N and returns it at version N+1. It runs
 * on **raw parsed JSON**, before validation, because a save written by an older
 * build will not satisfy the current schema until it has been migrated.
 *
 * **Each migration speaks the vocabulary of the version it produces, not the
 * vocabulary of the current build.** Steps 1→5 were written before the solar
 * reskin and still say `filings`, `chimeUpgrades`, `chimesEverMounted`; that is
 * correct, because a save at version 4 genuinely has a field called
 * `filingsPerSecond`. Step 5→6 is where the whole vocabulary changes at once.
 * Renaming the earlier steps to match today's field names would make them lie
 * about what they produce, and the next migration to read one of those fields
 * would find nothing there.
 */

export type RawSave = Record<string, unknown>
export type Migration = (save: RawSave) => RawSave

/**
 * Keyed by the version being migrated *from*. To add one:
 *
 *   1. Bump SCHEMA_VERSION in saveSchema.ts.
 *   2. Add an entry here keyed on the old version.
 *   3. Add a test with a fixture of the old shape.
 *
 * Migrations must be pure and must not throw on unexpected input — a save that
 * cannot be migrated should degrade to defaults during validation, not crash.
 */
/**
 * Content ids the solar reskin renamed. Saves store ids, so every one of these
 * has to be carried across or the referenced content silently disappears —
 * a Detent in a saved formation would resolve to nothing and the slot would
 * come back empty.
 */
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

/** The Array upgrade track "winding" became "recharge". */
const TRACK_IDS: Readonly<Record<string, string>> = { winding: 'recharge' }

/** Unknown ids pass through unchanged — content drift is tolerated elsewhere. */
const remap = (id: string, table: Readonly<Record<string, string>>): string =>
  table[id] ?? id

/** `"escapement-floor:first-shift"` → `"service-floor:first-shift"`. */
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

export const MIGRATIONS: Readonly<Record<number, Migration>> = Object.freeze({
  /**
   * 5 → 6: the solar reskin renames every persisted field and every content id.
   *
   * By far the largest migration, and the only one that is a *rename* rather
   * than an addition. Nothing here changes a value: `filings` becomes
   * `salvage`, `keys` becomes `clearance`, `hammer` becomes `bolt`, and the
   * player's balances, roster and tree are carried across untouched. A save
   * that survives this step is the same save under different names.
   *
   * Both halves matter and the second is easy to forget. Renaming only the
   * *fields* would leave a formation full of ids like `detent` that no longer
   * resolve to anything, and the units would quietly vanish from their slots on
   * the next load with no error anywhere — the same failure mode as a save
   * referencing deleted content, except self-inflicted.
   *
   * Unknown ids pass through rather than being dropped. A save carrying content
   * from a build this one does not know about is the validator's problem, and
   * it already tolerates it.
   */
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
          // Only remap what is actually there. Writing `formation: {}` onto a
          // preset that had no formation would be this migration inventing
          // fields, which is the validator's job and not a migration's.
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

  /**
   * 1 → 2: Phase 24 added `meta.presets`.
   *
   * The first real migration, and it is the boring kind on purpose — a new
   * field with a safe empty default. `meta` is read defensively because this
   * runs on raw parsed JSON, before validation: a hand-edited or truncated save
   * must degrade to defaults rather than throw here.
   */
  /**
   * 2 → 3: Phase 25 added `meta.chimeUpgrades`.
   *
   * Same shape as the previous step, and deliberately so: a new field with a
   * safe empty default, `meta` read defensively because this runs before
   * validation.
   */
  /**
   * 3 → 4: Phase 27 added `run.filingsPerSecond`.
   *
   * Defaults to 0, which means a save migrated from an older build earns
   * nothing for the absence that carried it across the upgrade. That is the
   * honest default — the old build never recorded a rate, so inventing one
   * would be paying out for a number nobody measured.
   */
  /**
   * 4 → 5: Phase 28 added `run.chimesEverMounted`.
   *
   * Defaults to **false**, which is generous — a save carried across the
   * upgrade counts as never having mounted a Chime, so an in-flight run can
   * still earn "Documented Procedure". The alternative would deny an
   * achievement for something the old build never recorded either way, and
   * erring toward the player is the right side to err on for a cosmetic award.
   */
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

/**
 * Step a raw save up to the current schema version.
 *
 * Returns the migrated save plus the chain applied, so the caller can log what
 * happened to a player's file.
 */
export function migrate(raw: RawSave): { save: RawSave; applied: number[] } {
  let save = raw
  const applied: number[] = []

  let version = typeof save.schemaVersion === 'number' ? save.schemaVersion : 0

  // Guard against a malformed migration that fails to advance the version.
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

/** True when this save predates the current schema and needs stepping up. */
export function needsMigration(raw: RawSave): boolean {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0
  return version < SCHEMA_VERSION
}
