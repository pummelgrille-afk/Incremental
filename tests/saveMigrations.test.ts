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
 * The machinery was built at schema 1 with nothing to migrate, which is the
 * point of building it early (ADR-002). Schema 2 is the first real step, and it
 * arrived with a fixture below without touching the chain logic — which is the
 * bet ADR-002 made paying off.
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

describe('1 → 2: presets', () => {
  /** A save exactly as schema 1 wrote it, with no `presets` field. */
  const schemaOne = (): RawSave => ({
    schemaVersion: 1,
    savedAt: 0,
    run: { filings: 12, formation: { '2:0': 'hammer' }, mounts: {} },
    meta: {
      recollection: 5,
      keys: 3,
      purchasedNodes: ['winding-tension-of-the-stroke'],
      movements: { hammer: 2 },
      chimes: {},
      unlockedZones: ['escapement-floor'],
      clearedStages: [],
      achievements: [],
      rewindCount: 0,
    },
  })

  it('adds an empty preset list', () => {
    const { save, applied } = migrate(schemaOne())
    const meta = save.meta as Record<string, unknown>

    expect(applied).toContain(1)
    // The chain runs all the way to current, not just one step.
    expect(save.schemaVersion).toBe(SCHEMA_VERSION)
    expect(meta.presets).toEqual([])
  })

  it('keeps everything else exactly as it was', () => {
    // A migration that quietly dropped progress would be worse than no
    // migration at all.
    const { save } = migrate(schemaOne())
    const meta = save.meta as Record<string, unknown>
    const run = save.run as Record<string, unknown>

    expect(meta.recollection).toBe(5)
    expect(meta.keys).toBe(3)
    expect(meta.movements).toEqual({ hammer: 2 })
    expect(meta.purchasedNodes).toEqual(['winding-tension-of-the-stroke'])
    expect(run.filings).toBe(12)
    expect(run.formation).toEqual({ '2:0': 'hammer' })
  })

  it('does not clobber presets a newer build already wrote', () => {
    const save = schemaOne()
    ;(save.meta as Record<string, unknown>).presets = [{ name: 'kept' }]

    const migrated = migrate(save).save
    expect((migrated.meta as Record<string, unknown>).presets).toEqual([{ name: 'kept' }])
  })

  it('survives a save with no meta at all', () => {
    // It runs on raw parsed JSON, before validation — a truncated or
    // hand-edited save must degrade to defaults rather than throw here.
    const { save } = migrate({ schemaVersion: 1 })
    expect((save.meta as Record<string, unknown>).presets).toEqual([])
  })

  it('leaves the original save untouched', () => {
    const original = schemaOne()
    const snapshot = JSON.stringify(original)
    migrate(original)
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})

describe('2 → 3: chime upgrade tracks', () => {
  /** A save exactly as schema 2 wrote it, with no `chimeUpgrades` field. */
  const schemaTwo = (): RawSave => ({
    schemaVersion: 2,
    savedAt: 0,
    run: { filings: 30, formation: { '1:0': 'hammer' }, mounts: { '0': 'quarter-bell' } },
    meta: {
      recollection: 9,
      keys: 4,
      purchasedNodes: [],
      movements: { hammer: 3 },
      chimes: { 'quarter-bell': 1 },
      presets: [{ name: 'wide', formation: {}, mounts: {} }],
      unlockedZones: ['escapement-floor'],
      clearedStages: [],
      achievements: [],
      rewindCount: 0,
    },
  })

  it('adds an empty track ledger', () => {
    const { save, applied } = migrate(schemaTwo())
    const meta = save.meta as Record<string, unknown>

    expect(applied).toContain(2)
    expect(save.schemaVersion).toBe(SCHEMA_VERSION)
    expect(meta.chimeUpgrades).toEqual({})
  })

  it('keeps the presets schema 2 introduced', () => {
    // Each migration must leave the one before it intact, or the chain is not
    // a chain.
    const { save } = migrate(schemaTwo())
    const meta = save.meta as Record<string, unknown>
    expect(meta.presets).toEqual([{ name: 'wide', formation: {}, mounts: {} }])
    expect(meta.chimes).toEqual({ 'quarter-bell': 1 })
  })

  it('does not clobber tracks a newer build already wrote', () => {
    const save = schemaTwo()
    ;(save.meta as Record<string, unknown>).chimeUpgrades = { 'quarter-bell': { capacity: 2 } }

    const migrated = migrate(save).save
    expect((migrated.meta as Record<string, unknown>).chimeUpgrades).toEqual({
      'quarter-bell': { capacity: 2 },
    })
  })

  it('carries a schema 1 save all the way to current', () => {
    // The whole point of a chain: an old save must not need to be opened by
    // every intermediate build on the way.
    const { save, applied } = migrate({ schemaVersion: 1, meta: { keys: 7 } })
    const meta = save.meta as Record<string, unknown>
    const run = save.run as Record<string, unknown>

    // Every step from 1 to current, in order — asserted against the constant
    // so adding a migration does not mean editing this test.
    expect(applied).toEqual(
      Array.from({ length: SCHEMA_VERSION - 1 }, (_, i) => i + 1),
    )
    expect(save.schemaVersion).toBe(SCHEMA_VERSION)
    expect(meta.keys).toBe(7)
    expect(meta.presets).toEqual([])
    expect(meta.chimeUpgrades).toEqual({})
    expect(run.filingsPerSecond).toBe(0)
  })
})

describe('3 → 4: the offline earning rate', () => {
  const schemaThree = (): RawSave => ({
    schemaVersion: 3,
    savedAt: 0,
    run: { filings: 90, formation: { '1:0': 'hammer' }, mounts: {}, startedAt: 5 },
    meta: { keys: 2, presets: [], chimeUpgrades: {} },
  })

  it('defaults the rate to zero', () => {
    /*
     * The honest default: an older build never recorded a rate, so inventing
     * one would pay out for a number nobody measured. The absence that carried
     * the save across the upgrade earns nothing.
     */
    const { save, applied } = migrate(schemaThree())
    expect(applied).toContain(3)
    expect((save.run as Record<string, unknown>).filingsPerSecond).toBe(0)
  })

  it('leaves the rest of the run alone', () => {
    const run = migrate(schemaThree()).save.run as Record<string, unknown>
    expect(run.filings).toBe(90)
    expect(run.formation).toEqual({ '1:0': 'hammer' })
    expect(run.startedAt).toBe(5)
  })

  it('survives a save with no run at all', () => {
    const { save } = migrate({ schemaVersion: 3 })
    expect((save.run as Record<string, unknown>).filingsPerSecond).toBe(0)
  })

  it('does not clobber a rate a newer build already wrote', () => {
    const save = schemaThree()
    ;(save.run as Record<string, unknown>).filingsPerSecond = 4.5

    const migrated = migrate(save).save
    expect((migrated.run as Record<string, unknown>).filingsPerSecond).toBe(4.5)
  })
})

describe('4 → 5: the Chime-usage flag', () => {
  const schemaFour = (): RawSave => ({
    schemaVersion: 4,
    savedAt: 0,
    run: { filings: 5, filingsPerSecond: 1.5, formation: {}, mounts: {} },
    meta: { keys: 1, presets: [], chimeUpgrades: {}, achievements: ['wound-it-back'] },
  })

  it('defaults to false, which is the generous side', () => {
    /*
     * A save carried across the upgrade counts as never having mounted a
     * Chime, so an in-flight run can still earn "Documented Procedure". The
     * old build never recorded it either way, and for a cosmetic award the
     * player is the right side to err toward.
     */
    const { save, applied } = migrate(schemaFour())
    expect(applied).toContain(4)
    expect((save.run as Record<string, unknown>).chimesEverMounted).toBe(false)
  })

  it('keeps a flag a newer build already set', () => {
    const save = schemaFour()
    ;(save.run as Record<string, unknown>).chimesEverMounted = true
    expect((migrate(save).save.run as Record<string, unknown>).chimesEverMounted).toBe(true)
  })

  it('keeps everything schemas 2 to 4 introduced', () => {
    const { save } = migrate(schemaFour())
    const meta = save.meta as Record<string, unknown>
    const run = save.run as Record<string, unknown>

    expect(meta.presets).toEqual([])
    expect(meta.chimeUpgrades).toEqual({})
    expect(meta.achievements).toEqual(['wound-it-back'])
    expect(run.filingsPerSecond).toBe(1.5)
  })
})
