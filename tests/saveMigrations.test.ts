import { describe, expect, it } from 'vitest'
import { DEFAULT_BINDINGS } from '../src/lib/content/keybindings'
import {
  MIGRATIONS,
  MigrationError,
  migrate,
  needsMigration,
  type Migration,
  type RawSave,
} from '../src/lib/core/saveMigrations'
import { SCHEMA_VERSION } from '../src/lib/core/saveSchema'

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
    expect(() => migrate({})).toThrow(MigrationError)
  })

  it('has a migration registered for every version below the current one', () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) {
      expect(MIGRATIONS[v], `missing migration from schema ${v}`).toBeTypeOf('function')
    }
  })
})

describe('migration chain invariants', () => {
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

    expect(save.schemaVersion).toBe(SCHEMA_VERSION)
    expect(meta.presets).toEqual([])
  })

  it('keeps everything else exactly as it was', () => {
    const { save } = migrate(schemaOne())
    const meta = save.meta as Record<string, unknown>
    const run = save.run as Record<string, unknown>

    expect(meta.recollection).toBe(5)
    expect(meta.clearance).toBe(3)
    expect(meta.platforms).toEqual({ bolt: 2 })
    expect(meta.purchasedNodes).toEqual(['aperture-force-of-the-pulse'])
    expect(run.salvage).toBe(12)
    expect(run.formation).toEqual({ '2:0': 'bolt' })
  })

  it('does not clobber presets a newer build already wrote', () => {
    const save = schemaOne()
    ;(save.meta as Record<string, unknown>).presets = [{ name: 'kept' }]

    const migrated = migrate(save).save
    expect((migrated.meta as Record<string, unknown>).presets).toEqual([{ name: 'kept' }])
  })

  it('survives a save with no meta at all', () => {
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

describe('2 → 3: array upgrade tracks', () => {
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
    expect(meta.arrayUpgrades).toEqual({})
  })

  it('keeps the presets schema 2 introduced', () => {
    const { save } = migrate(schemaTwo())
    const meta = save.meta as Record<string, unknown>
    expect(meta.presets).toEqual([{ name: 'wide', formation: {}, mounts: {} }])
    expect(meta.arrays).toEqual({ 'long-baseline': 1 })
  })

  it('does not clobber tracks a newer build already wrote', () => {
    const save = schemaTwo()
    ;(save.meta as Record<string, unknown>).chimeUpgrades = { 'quarter-bell': { capacity: 2 } }

    const migrated = migrate(save).save
    expect((migrated.meta as Record<string, unknown>).arrayUpgrades).toEqual({
      'long-baseline': { capacity: 2 },
    })
  })

  it('carries a schema 1 save all the way to current', () => {
    const { save, applied } = migrate({ schemaVersion: 1, meta: { keys: 7 } })
    const meta = save.meta as Record<string, unknown>
    const run = save.run as Record<string, unknown>

    expect(applied).toEqual(
      Array.from({ length: SCHEMA_VERSION - 1 }, (_, i) => i + 1),
    )
    expect(save.schemaVersion).toBe(SCHEMA_VERSION)
    expect(meta.clearance).toBe(7)
    expect(meta.presets).toEqual([])
    expect(meta.arrayUpgrades).toEqual({})
    expect(run.salvagePerSecond).toBe(0)
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
    const { save, applied } = migrate(schemaThree())
    expect(applied).toContain(3)
    expect((save.run as Record<string, unknown>).salvagePerSecond).toBe(0)
  })

  it('leaves the rest of the run alone', () => {
    const run = migrate(schemaThree()).save.run as Record<string, unknown>
    expect(run.salvage).toBe(90)
    expect(run.formation).toEqual({ '1:0': 'bolt' })
    expect(run.startedAt).toBe(5)
  })

  it('survives a save with no run at all', () => {
    const { save } = migrate({ schemaVersion: 3 })
    expect((save.run as Record<string, unknown>).salvagePerSecond).toBe(0)
  })

  it('does not clobber a rate a newer build already wrote', () => {
    const save = schemaThree()
    ;(save.run as Record<string, unknown>).filingsPerSecond = 4.5

    const migrated = migrate(save).save
    expect((migrated.run as Record<string, unknown>).salvagePerSecond).toBe(4.5)
  })
})

describe('4 → 5: the Array-usage flag', () => {
  const schemaFour = (): RawSave => ({
    schemaVersion: 4,
    savedAt: 0,
    run: { filings: 5, filingsPerSecond: 1.5, formation: {}, mounts: {} },
    meta: { keys: 1, presets: [], chimeUpgrades: {}, achievements: ['wound-it-back'] },
  })

  it('defaults to false, which is the generous side', () => {
    const { save, applied } = migrate(schemaFour())
    expect(applied).toContain(4)
    expect((save.run as Record<string, unknown>).arraysEverMounted).toBe(false)
  })

  it('keeps a flag a newer build already set', () => {
    const save = schemaFour()
    ;(save.run as Record<string, unknown>).chimesEverMounted = true
    expect((migrate(save).save.run as Record<string, unknown>).arraysEverMounted).toBe(true)
  })

  it('keeps everything schemas 2 to 4 introduced', () => {
    const { save } = migrate(schemaFour())
    const meta = save.meta as Record<string, unknown>
    const run = save.run as Record<string, unknown>

    expect(meta.presets).toEqual([])
    expect(meta.arrayUpgrades).toEqual({})
    expect(meta.achievements).toEqual(['wound-it-back'])
    expect(run.salvagePerSecond).toBe(1.5)
  })
})

describe('5 → 6: the solar reskin', () => {
  const schemaFive = (): RawSave => ({
    schemaVersion: 5,
    savedAt: 0,
    run: {
      filings: 340,
      filingsPerSecond: 2.5,
      chimesEverMounted: true,
      currentStage: 'escapement-floor:noted-in-the-log',
      formation: { '1:0': 'hammer', '2:3': 'detent', '3:7': 'pallet' },
      mounts: { '0': 'quarter-bell' },
      deepestScalingIndex: 3,
      repairsThisStage: 1,
      reinforcements: 2,
      startedAt: 11,
    },
    meta: {
      recollection: 14,
      keys: 6,
      purchasedNodes: [
        'winding-tension-of-the-stroke',
        'bracing-hardened-pallets',
        'salvage-the-night-shift',
        'regulation-second-beat',
      ],
      movements: { hammer: 4, detent: 2, pallet: 1 },
      chimes: { 'quarter-bell': 1 },
      chimeUpgrades: { 'quarter-bell': { capacity: 2, winding: 1, resonance: 3 } },
      presets: [
        { name: 'wide', formation: { '2:0': 'pallet' }, mounts: { '1': 'quarter-bell' } },
      ],
      unlockedZones: ['escapement-floor'],
      clearedStages: ['escapement-floor:first-shift', 'escapement-floor:routine-maintenance'],
      achievements: ['signed-for-the-shift'],
      rewindCount: 2,
    },
    statistics: {
      totalFilingsEarned: 9000,
      totalSlackDestroyed: 1200,
      conjunctionsFired: 40,
      playtimeSeconds: 3600,
    },
  })

  it('renames every persisted field without changing a value', () => {
    const { save, applied } = migrate(schemaFive())
    const run = save.run as Record<string, unknown>
    const meta = save.meta as Record<string, unknown>
    const stats = save.statistics as Record<string, unknown>

    expect(applied).toContain(5)
    expect(save.schemaVersion).toBe(SCHEMA_VERSION)

    expect(run.salvage).toBe(340)
    expect(run.salvagePerSecond).toBe(2.5)
    expect(run.arraysEverMounted).toBe(true)
    expect(meta.clearance).toBe(6)
    expect(meta.recollection).toBe(14)
    expect(meta.rewindCount).toBe(2)
    expect(stats.totalSalvageEarned).toBe(9000)
    expect(stats.totalContactsDestroyed).toBe(1200)
  })

  it('leaves no field under its old name', () => {
    const { save } = migrate(schemaFive())
    const run = save.run as Record<string, unknown>
    const meta = save.meta as Record<string, unknown>
    const stats = save.statistics as Record<string, unknown>

    for (const gone of ['filings', 'filingsPerSecond', 'chimesEverMounted']) {
      expect(run, gone).not.toHaveProperty(gone)
    }
    for (const gone of ['keys', 'movements', 'chimes', 'chimeUpgrades']) {
      expect(meta, gone).not.toHaveProperty(gone)
    }
    for (const gone of ['totalFilingsEarned', 'totalSlackDestroyed']) {
      expect(stats, gone).not.toHaveProperty(gone)
    }
  })

  it('carries content ids across, so nothing vanishes from its slot', () => {
    const { save } = migrate(schemaFive())
    const run = save.run as Record<string, unknown>
    const meta = save.meta as Record<string, unknown>

    expect(run.formation).toEqual({ '1:0': 'bolt', '2:3': 'anchor', '3:7': 'rake' })
    expect(run.mounts).toEqual({ '0': 'long-baseline' })
    expect(meta.platforms).toEqual({ bolt: 4, anchor: 2, rake: 1 })
    expect(meta.arrays).toEqual({ 'long-baseline': 1 })
  })

  it('carries the tree, the tracks, the zones and the presets', () => {
    const { save } = migrate(schemaFive())
    const meta = save.meta as Record<string, unknown>

    expect(meta.purchasedNodes).toEqual([
      'aperture-force-of-the-pulse',
      'shielding-hardened-plating',
      'recovery-the-night-shift',
      'regulation-second-flare',
    ])

    expect(meta.arrayUpgrades).toEqual({
      'long-baseline': { capacity: 2, recharge: 1, resonance: 3 },
    })
    expect(meta.unlockedZones).toEqual(['service-floor'])
    expect(meta.clearedStages).toEqual([
      'service-floor:first-shift',
      'service-floor:routine-maintenance',
    ])
    expect(meta.presets).toEqual([
      { name: 'wide', formation: { '2:0': 'rake' }, mounts: { '1': 'long-baseline' } },
    ])
  })

  it('rewrites the zone half of a stage address and leaves the stage half alone', () => {
    const { save } = migrate(schemaFive())
    expect((save.run as Record<string, unknown>).currentStage).toBe(
      'service-floor:noted-in-the-log',
    )
  })

  it('passes unknown ids through rather than dropping them', () => {
    const save = schemaFive()
    ;(save.meta as Record<string, unknown>).movements = { hammer: 1, 'from-a-mod': 3 }

    const meta = migrate(save).save.meta as Record<string, unknown>
    expect(meta.platforms).toEqual({ bolt: 1, 'from-a-mod': 3 })
  })

  it('survives a save with nothing in it', () => {
    expect(() => migrate({ schemaVersion: 5 })).not.toThrow()
  })

  it('leaves the original save untouched', () => {
    const original = schemaFive()
    const snapshot = JSON.stringify(original)
    migrate(original)
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})

describe('6 → 7: onboarding', () => {
  const schemaSix = (cleared: string[]): RawSave => ({
    schemaVersion: 6,
    savedAt: 0,
    run: { salvage: 40, formation: {}, mounts: {} },
    meta: {
      recollection: 0,
      clearance: 3,
      purchasedNodes: [],
      platforms: { bolt: 1 },
      arrays: {},
      presets: [],
      arrayUpgrades: {},
      unlockedZones: ['service-floor'],
      clearedStages: cleared,
      achievements: [],
      rewindCount: 0,
    },
    settings: {},
    statistics: {},
  })

  it('opts an existing player out of the whole sequence', () => {
    const meta = migrate(schemaSix(['service-floor:first-shift'])).save.meta as Record<
      string,
      unknown
    >

    expect(Array.isArray(meta.tutorialSeen)).toBe(true)
    expect((meta.tutorialSeen as string[]).length).toBeGreaterThan(0)
    expect(meta.tutorialSeen).toContain('the-formation')
  })

  it('leaves the sequence intact for a save that has never cleared anything', () => {
    const meta = migrate(schemaSix([])).save.meta as Record<string, unknown>
    expect(meta.tutorialSeen).toEqual([])
  })

  it('keeps a list that is already there', () => {
    const save = schemaSix([])
    ;(save.meta as Record<string, unknown>).tutorialSeen = ['standing-watch']

    const meta = migrate(save).save.meta as Record<string, unknown>
    expect(meta.tutorialSeen).toEqual(['standing-watch'])
  })

  it('survives a save with nothing in it', () => {
    expect(() => migrate({ schemaVersion: 6 })).not.toThrow()
  })

  it('leaves the original save untouched', () => {
    const original = schemaSix(['service-floor:first-shift'])
    const snapshot = JSON.stringify(original)
    migrate(original)
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})

describe('7 → 8: keys become data', () => {
  const schemaSeven = (settings: Record<string, unknown> = {}): RawSave => ({
    schemaVersion: 7,
    savedAt: 0,
    run: { salvage: 40, formation: {}, mounts: {} },
    meta: {
      recollection: 0,
      clearance: 3,
      purchasedNodes: [],
      platforms: { bolt: 1 },
      arrays: {},
      presets: [],
      arrayUpgrades: {},
      unlockedZones: ['service-floor'],
      clearedStages: [],
      achievements: [],
      tutorialSeen: [],
      rewindCount: 0,
    },
    settings,
    statistics: {},
  })

  it('writes the defaults in explicitly rather than leaving the field absent', () => {
    const settings = migrate(schemaSeven()).save.settings as Record<string, unknown>
    const bindings = settings.keybindings as Record<string, string>

    expect(bindings).toEqual(DEFAULT_BINDINGS)
  })

  it('keeps every other setting untouched', () => {
    const settings = migrate(schemaSeven({ masterVolume: 0.2, showFps: true })).save
      .settings as Record<string, unknown>

    expect(settings.masterVolume).toBe(0.2)
    expect(settings.showFps).toBe(true)
  })

  it('survives a save whose settings object is missing entirely', () => {
    const raw = schemaSeven()
    delete raw.settings

    const settings = migrate(raw).save.settings as Record<string, unknown>
    expect(settings.keybindings).toEqual(DEFAULT_BINDINGS)
  })

  it('leaves a partially bound map alone and fills the rest', () => {
    const settings = migrate(schemaSeven({ keybindings: { formation: 'KeyJ' } })).save
      .settings as Record<string, unknown>
    const bindings = settings.keybindings as Record<string, string>

    expect(bindings.formation).toBe('KeyJ')
    expect(bindings.map).toBe(DEFAULT_BINDINGS.map)
  })
})
