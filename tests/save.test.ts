import { beforeEach, describe, expect, it } from 'vitest'
import {
  BACKUP_KEY,
  LIVE_KEY,
  SaveImportError,
  SaveManager,
  TEMP_KEY,
} from '../src/lib/core/save'
import {
  createDefaultSave,
  resetRun,
  SCHEMA_VERSION,
  validateSave,
} from '../src/lib/core/saveSchema'
import { MemoryStorage, type StorageBackend } from '../src/lib/core/storage'
import { STARTING_ZONE_ID } from '../src/lib/content/zones'

let storage: MemoryStorage
let manager: SaveManager

beforeEach(() => {
  storage = new MemoryStorage()
  manager = new SaveManager(storage)
})

describe('round trip', () => {
  it('loads back exactly what was saved', () => {
    const save = createDefaultSave(1000)
    save.meta.recollection = 42
    save.meta.keys = 7
    save.run.filings = 1234.5
    save.meta.purchasedNodes = ['winding-1', 'bracing-1']

    expect(manager.save(save, 2000)).toBe(true)

    const loaded = manager.load(2000)
    expect(loaded.source).toBe('live')
    expect(loaded.data.meta.recollection).toBe(42)
    expect(loaded.data.meta.keys).toBe(7)
    expect(loaded.data.run.filings).toBe(1234.5)
    expect(loaded.data.meta.purchasedNodes).toEqual(['winding-1', 'bracing-1'])
  })

  it('creates a fresh save when storage is empty', () => {
    const loaded = manager.load()
    expect(loaded.source).toBe('fresh')
    expect(loaded.offlineSeconds).toBe(0)
    expect(loaded.data.meta.unlockedZones).toEqual([STARTING_ZONE_ID])
  })

  it('stamps schemaVersion and savedAt on every write', () => {
    manager.save(createDefaultSave(0), 555)
    const stored = JSON.parse(storage.getItem(LIVE_KEY)!)
    expect(stored.schemaVersion).toBe(SCHEMA_VERSION)
    expect(stored.savedAt).toBe(555)
  })
})

describe('offline tracking', () => {
  it('reports elapsed seconds since the save was written', () => {
    manager.save(createDefaultSave(), 10_000)
    // Two hours later.
    const loaded = manager.load(10_000 + 7_200_000)
    expect(loaded.offlineSeconds).toBeCloseTo(7200, 6)
  })

  it('never reports negative offline time when the clock moves backwards', () => {
    manager.save(createDefaultSave(), 10_000)
    const loaded = manager.load(5_000)
    expect(loaded.offlineSeconds).toBe(0)
  })
})

describe('corruption safety', () => {
  it('falls back to the backup when the live save is unparseable', () => {
    const good = createDefaultSave()
    good.meta.recollection = 99
    manager.save(good, 1000)
    // A second write promotes the first into backup.
    manager.save(good, 2000)

    storage.setItem(LIVE_KEY, '{ this is not json')

    const loaded = manager.load()
    expect(loaded.source).toBe('backup')
    expect(loaded.data.meta.recollection).toBe(99)
    expect(loaded.notices.some((n) => n.includes('backup'))).toBe(true)
  })

  it('falls back to a fresh save when live and backup are both ruined', () => {
    manager.save(createDefaultSave(), 1000)
    manager.save(createDefaultSave(), 2000)
    storage.setItem(LIVE_KEY, 'garbage')
    storage.setItem(BACKUP_KEY, 'also garbage')

    const loaded = manager.load()
    expect(loaded.source).toBe('fresh')
    expect(loaded.notices.length).toBeGreaterThan(0)
  })

  it('leaves the live save untouched when a write fails', () => {
    const good = createDefaultSave()
    good.meta.keys = 5
    manager.save(good, 1000)
    const before = storage.getItem(LIVE_KEY)

    // A backend that accepts the temp write but refuses the live one, which is
    // the shape of a quota failure hitting mid-sequence.
    const hostile: StorageBackend = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (k === LIVE_KEY) throw new Error('quota')
        storage.setItem(k, v)
      },
      removeItem: (k) => storage.removeItem(k),
    }

    const failing = new SaveManager(hostile)
    const next = createDefaultSave()
    next.meta.keys = 999
    expect(failing.save(next, 2000)).toBe(false)

    // The old save must survive intact.
    expect(storage.getItem(LIVE_KEY)).toBe(before)
    expect(JSON.parse(storage.getItem(LIVE_KEY)!).meta.keys).toBe(5)
  })

  it('does not leave a temp key behind after a failed write', () => {
    const hostile: StorageBackend = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (k === LIVE_KEY) throw new Error('quota')
        storage.setItem(k, v)
      },
      removeItem: (k) => storage.removeItem(k),
    }
    new SaveManager(hostile).save(createDefaultSave(), 1000)
    expect(storage.getItem(TEMP_KEY)).toBeNull()
  })

  it('detects a truncated write via read-back', () => {
    // Backend that silently truncates — a real localStorage failure mode.
    const truncating: StorageBackend = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => storage.setItem(k, v.slice(0, 10)),
      removeItem: (k) => storage.removeItem(k),
    }
    const m = new SaveManager(truncating)
    expect(m.save(createDefaultSave(), 1000)).toBe(false)
    expect(storage.getItem(LIVE_KEY)).toBeNull()
  })

  it('reports write failure through writeFailing', () => {
    const hostile: StorageBackend = {
      getItem: () => null,
      setItem: () => {
        throw new Error('nope')
      },
      removeItem: () => {},
    }
    const m = new SaveManager(hostile)
    m.save(createDefaultSave())
    expect(m.writeFailing).toBe(true)
  })
})

describe('export and import', () => {
  it('round-trips through an export string', () => {
    const save = createDefaultSave(1000)
    save.meta.recollection = 314
    save.meta.achievements = ['signed-for-the-shift', 'wound-it-back']

    const text = manager.exportString(save)
    const imported = manager.importString(text)

    expect(imported.meta.recollection).toBe(314)
    expect(imported.meta.achievements).toEqual(['signed-for-the-shift', 'wound-it-back'])
  })

  it('produces a tagged, self-describing string', () => {
    const text = manager.exportString(createDefaultSave())
    expect(text.startsWith(`ORRERY-${SCHEMA_VERSION}-`)).toBe(true)
  })

  it('rejects a truncated paste', () => {
    const text = manager.exportString(createDefaultSave())
    expect(() => manager.importString(text.slice(0, text.length - 12))).toThrow(
      SaveImportError,
    )
  })

  it('rejects a string that is not a save at all', () => {
    expect(() => manager.importString('hello there')).toThrow(SaveImportError)
  })

  it('rejects an empty string', () => {
    expect(() => manager.importString('   ')).toThrow(SaveImportError)
  })

  it('rejects a save from a newer schema rather than dropping data', () => {
    const future = manager
      .exportString(createDefaultSave())
      .replace(`ORRERY-${SCHEMA_VERSION}-`, `ORRERY-${SCHEMA_VERSION + 5}-`)
    expect(() => manager.importString(future)).toThrow(/newer version/i)
  })

  it('tolerates surrounding whitespace, as a pasted string will have', () => {
    const text = manager.exportString(createDefaultSave())
    expect(() => manager.importString(`\n  ${text}  \n`)).not.toThrow()
  })

  it('survives non-ASCII content in the save', () => {
    const save = createDefaultSave()
    // Content ids are authored text; one em dash must not break exports.
    save.meta.purchasedNodes = ['regulation—1', 'salvage-café', '調整']
    const imported = manager.importString(manager.exportString(save))
    expect(imported.meta.purchasedNodes).toEqual(['regulation—1', 'salvage-café', '調整'])
  })

  it('does not write anything on import', () => {
    const text = manager.exportString(createDefaultSave())
    manager.importString(text)
    expect(storage.getItem(LIVE_KEY)).toBeNull()
  })
})

describe('housekeeping', () => {
  it('reports whether a save exists', () => {
    expect(manager.hasSave()).toBe(false)
    manager.save(createDefaultSave())
    expect(manager.hasSave()).toBe(true)
  })

  it('clears every key', () => {
    manager.save(createDefaultSave(), 1000)
    manager.save(createDefaultSave(), 2000)
    manager.clear()
    expect(storage.getItem(LIVE_KEY)).toBeNull()
    expect(storage.getItem(BACKUP_KEY)).toBeNull()
    expect(storage.getItem(TEMP_KEY)).toBeNull()
  })
})

describe('validation and repair', () => {
  it('repairs missing sections rather than rejecting the save', () => {
    const result = validateSave({ schemaVersion: 1, savedAt: 5 })
    expect(result.ok).toBe(true)
    expect(result.data!.meta.recollection).toBe(0)
    expect(result.problems.length).toBeGreaterThan(0)
  })

  it('rejects a non-object', () => {
    expect(validateSave('nope').ok).toBe(false)
    expect(validateSave(null).ok).toBe(false)
  })

  it('rejects a missing or invalid schemaVersion', () => {
    expect(validateSave({}).ok).toBe(false)
    expect(validateSave({ schemaVersion: 'one' }).ok).toBe(false)
    expect(validateSave({ schemaVersion: 0 }).ok).toBe(false)
  })

  it('strips values of the wrong type instead of trusting them', () => {
    const result = validateSave({
      schemaVersion: 1,
      meta: { recollection: 'lots', purchasedNodes: ['a', 5, 'b'], movements: { x: 'y' } },
    })
    expect(result.data!.meta.recollection).toBe(0)
    expect(result.data!.meta.purchasedNodes).toEqual(['a', 'b'])
    expect(result.data!.meta.movements).toEqual({})
  })

  it('refuses negative currencies', () => {
    const result = validateSave({ schemaVersion: 1, run: { filings: -500 } })
    expect(result.data!.run.filings).toBe(0)
  })

  it('always leaves the player a zone to enter', () => {
    const result = validateSave({ schemaVersion: 1, meta: { unlockedZones: [] } })
    expect(result.data!.meta.unlockedZones).toEqual([STARTING_ZONE_ID])
  })

  it('clamps settings into range', () => {
    const result = validateSave({
      schemaVersion: 1,
      settings: { masterVolume: 50, textScale: 99, colourblindPalette: 'purple' },
    })
    expect(result.data!.settings.masterVolume).toBe(1)
    expect(result.data!.settings.textScale).toBe(2)
    expect(result.data!.settings.colourblindPalette).toBe('none')
  })
})

describe('resetRun', () => {
  it('clears run state and increments the rewind count', () => {
    const save = createDefaultSave(1000)
    save.run.filings = 5000
    save.run.deepestScalingIndex = 22
    save.run.formation = { '1:0': 'hammer' }

    const after = resetRun(save, 2000)

    expect(after.run.filings).toBe(0)
    expect(after.run.deepestScalingIndex).toBe(0)
    expect(after.run.formation).toEqual({})
    expect(after.meta.rewindCount).toBe(1)
  })

  it('preserves everything a Rewinding must not touch', () => {
    const save = createDefaultSave(1000)
    save.meta.recollection = 120
    save.meta.keys = 9
    save.meta.purchasedNodes = ['winding-3']
    save.meta.movements = { hammer: 4 }
    save.meta.achievements = ['wound-it-back']
    save.statistics.totalFilingsEarned = 99_999

    const after = resetRun(save, 2000)

    expect(after.meta.recollection).toBe(120)
    expect(after.meta.keys).toBe(9)
    expect(after.meta.purchasedNodes).toEqual(['winding-3'])
    expect(after.meta.movements).toEqual({ hammer: 4 })
    expect(after.meta.achievements).toEqual(['wound-it-back'])
    expect(after.statistics.totalFilingsEarned).toBe(99_999)
  })

  it('never resets content access', () => {
    // economy-spec.md §3: a Rewind resets power within a run, never access to
    // content already unlocked. This is the anti-churn guarantee.
    const save = createDefaultSave(1000)
    save.meta.unlockedZones = ['escapement-floor', 'hour-ring']
    save.meta.clearedStages = ['escapement-floor:first-shift']

    const after = resetRun(save, 2000)

    expect(after.meta.unlockedZones).toEqual(['escapement-floor', 'hour-ring'])
    expect(after.meta.clearedStages).toEqual(['escapement-floor:first-shift'])
  })
})
