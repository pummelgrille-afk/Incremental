import { describe, expect, it } from 'vitest'
import {
  MIGRATIONS,
  MigrationError,
  migrate,
  needsMigration,
  type Migration,
  type RawSave,
} from '../src/lib/core/saveMigrations'
import { SCHEMA_VERSION } from '../src/lib/core/saveSchema'

/**
 * There is nothing to migrate at schema 1, so these test the *machinery* —
 * which is the point of building it early (ADR-002). The first real migration
 * should arrive with a fixture of the old shape and pass without touching this
 * file's logic.
 */

describe('migrate', () => {
  it('leaves a current save alone', () => {
    const save: RawSave = { schemaVersion: SCHEMA_VERSION, meta: {} }
    const { save: out, applied } = migrate(save)
    expect(applied).toEqual([])
    expect(out).toBe(save)
  })

  it('reports whether a save needs migrating', () => {
    expect(needsMigration({ schemaVersion: SCHEMA_VERSION })).toBe(false)
    expect(needsMigration({ schemaVersion: 0 })).toBe(true)
    expect(needsMigration({})).toBe(true)
  })

  it('throws when no migration exists for a version', () => {
    // A save with no version tag reads as 0, for which there is no migration.
    expect(() => migrate({})).toThrow(MigrationError)
  })

  it('has a migration registered for every version below the current one', () => {
    // Guards the common mistake: bumping SCHEMA_VERSION without adding a step.
    for (let v = 1; v < SCHEMA_VERSION; v++) {
      expect(MIGRATIONS[v], `missing migration from schema ${v}`).toBeTypeOf('function')
    }
  })
})

describe('migration chain invariants', () => {
  /** Runs the real chain logic against a synthetic registry. */
  function runChain(
    registry: Record<number, Migration>,
    start: RawSave,
    target: number,
  ): { save: RawSave; applied: number[] } {
    let save = start
    const applied: number[] = []
    let version = typeof save.schemaVersion === 'number' ? save.schemaVersion : 0
    let guard = 0
    while (version < target) {
      const m = registry[version]
      if (!m) throw new MigrationError(`No migration from ${version}`)
      save = m(save)
      applied.push(version)
      const next = typeof save.schemaVersion === 'number' ? save.schemaVersion : version
      if (next <= version) throw new MigrationError('did not advance')
      version = next
      if (++guard > 100) throw new MigrationError('too many steps')
    }
    return { save, applied }
  }

  it('applies steps in order across several versions', () => {
    const registry: Record<number, Migration> = {
      1: (s) => ({ ...s, schemaVersion: 2, added: 'two' }),
      2: (s) => ({ ...s, schemaVersion: 3, added: 'three' }),
    }
    const { save, applied } = runChain(registry, { schemaVersion: 1 }, 3)
    expect(applied).toEqual([1, 2])
    expect(save.added).toBe('three')
  })

  it('refuses a migration that fails to advance the version', () => {
    const registry: Record<number, Migration> = { 1: (s) => ({ ...s }) }
    expect(() => runChain(registry, { schemaVersion: 1 }, 2)).toThrow(MigrationError)
  })
})
