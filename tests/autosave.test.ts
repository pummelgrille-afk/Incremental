import { beforeEach, describe, expect, it } from 'vitest'
import { Autosaver } from '../src/lib/core/autosave'
import { SaveManager } from '../src/lib/core/save'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { MemoryStorage, type StorageBackend } from '../src/lib/core/storage'

let storage: MemoryStorage
let manager: SaveManager
let snapshot: () => ReturnType<typeof createDefaultSave>

beforeEach(() => {
  storage = new MemoryStorage()
  manager = new SaveManager(storage)
  snapshot = () => createDefaultSave(1000)
})

/** Advance simulation time in 50 ms slices, as the real loop does. */
function run(auto: Autosaver, seconds: number) {
  const step = 0.05
  for (let t = 0; t < seconds; t += step) auto.tick(step)
}

describe('interval saving', () => {
  it('does not write before the interval elapses', () => {
    const auto = new Autosaver(manager, snapshot, { intervalSeconds: 15 })
    run(auto, 14)
    expect(auto.getStats().writes).toBe(0)
  })

  it('writes once the interval elapses', () => {
    const auto = new Autosaver(manager, snapshot, { intervalSeconds: 15 })
    run(auto, 15.1)
    expect(auto.getStats().writes).toBe(1)
    expect(auto.getStats().lastReason).toBe('interval')
  })

  it('keeps writing on a steady cadence', () => {
    const auto = new Autosaver(manager, snapshot, { intervalSeconds: 10 })
    run(auto, 45)
    expect(auto.getStats().writes).toBe(4)
  })
})

describe('key events', () => {
  it('writes immediately on a stage clear', () => {
    const auto = new Autosaver(manager, snapshot)
    expect(auto.request('stage-clear')).toBe(true)
    expect(auto.getStats().writes).toBe(1)
  })

  it('writes immediately on a rewind', () => {
    // The single most expensive event to lose.
    const auto = new Autosaver(manager, snapshot)
    expect(auto.request('rewind')).toBe(true)
    expect(auto.getStats().lastReason).toBe('rewind')
  })

  it('coalesces a burst of purchases into one write', () => {
    const auto = new Autosaver(manager, snapshot, { minGapSeconds: 2 })
    for (let i = 0; i < 20; i++) auto.request('purchase')
    expect(auto.getStats().writes).toBe(0)

    run(auto, 2.1)
    expect(auto.getStats().writes).toBe(1)
    expect(auto.getStats().lastReason).toBe('purchase')
  })

  it('flushes on demand regardless of timing', () => {
    const auto = new Autosaver(manager, snapshot)
    expect(auto.flush('shutdown')).toBe(true)
    expect(auto.getStats().writes).toBe(1)
  })

  it('discards a pending coalesced save once flushed', () => {
    const auto = new Autosaver(manager, snapshot, { minGapSeconds: 2 })
    auto.request('purchase')
    auto.flush('manual')
    run(auto, 3)
    // The flush covered the pending purchase; no second write for it.
    expect(auto.getStats().writes).toBe(1)
  })
})

describe('failure handling', () => {
  const brokenStorage: StorageBackend = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: () => {},
  }

  it('counts failures without throwing', () => {
    const auto = new Autosaver(new SaveManager(brokenStorage), snapshot, {
      intervalSeconds: 5,
    })
    expect(() => run(auto, 6)).not.toThrow()
    expect(auto.getStats().failures).toBe(1)
    expect(auto.getStats().writes).toBe(0)
  })

  it('backs off exponentially instead of hammering a full quota', () => {
    const auto = new Autosaver(new SaveManager(brokenStorage), snapshot, {
      intervalSeconds: 5,
      maxBackoffSeconds: 100,
    })

    // Without backoff, 120s at a 5s interval would attempt 24 writes.
    run(auto, 120)
    expect(auto.getStats().failures).toBeLessThan(8)
    expect(auto.degraded).toBe(true)
  })

  it('reports healthy when writes succeed', () => {
    const auto = new Autosaver(manager, snapshot, { intervalSeconds: 5 })
    run(auto, 6)
    expect(auto.degraded).toBe(false)
  })

  it('recovers once storage works again', () => {
    let failing = true
    const flaky: StorageBackend = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (failing) throw new Error('quota')
        storage.setItem(k, v)
      },
      removeItem: (k) => storage.removeItem(k),
    }
    const auto = new Autosaver(new SaveManager(flaky), snapshot, { intervalSeconds: 5 })

    run(auto, 6)
    expect(auto.degraded).toBe(true)

    failing = false
    run(auto, 200)
    expect(auto.degraded).toBe(false)
    expect(auto.getStats().writes).toBeGreaterThan(0)
  })
})

describe('snapshot timing', () => {
  it('reads the snapshot at write time, not at construction', () => {
    // Guards against handing the autosaver a stale object reference.
    let filings = 0
    const auto = new Autosaver(
      manager,
      () => {
        const s = createDefaultSave(1000)
        s.run.filings = filings
        return s
      },
      { intervalSeconds: 5 },
    )

    filings = 777
    run(auto, 6)

    expect(new SaveManager(storage).load().data.run.filings).toBe(777)
  })
})
