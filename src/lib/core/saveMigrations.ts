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
export const MIGRATIONS: Readonly<Record<number, Migration>> = Object.freeze({
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
