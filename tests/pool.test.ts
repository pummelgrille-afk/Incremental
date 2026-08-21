import { describe, expect, it } from 'vitest'
import { Pool } from '../src/lib/utils/pool'

interface Thing {
  active: boolean
  value: number
}

const makePool = (capacity: number) =>
  new Pool<Thing>(capacity, (i) => ({ active: false, value: i }))

describe('Pool', () => {
  it('preallocates the full capacity, all inactive', () => {
    const pool = makePool(10)
    expect(pool.items).toHaveLength(10)
    expect(pool.items.every((i) => !i.active)).toBe(true)
    expect(pool.live).toBe(0)
    expect(pool.available).toBe(10)
  })

  it('marks acquired items active', () => {
    const pool = makePool(4)
    const item = pool.acquire()
    expect(item?.active).toBe(true)
    expect(pool.live).toBe(1)
    expect(pool.available).toBe(3)
  })

  it('returns null when the budget is exhausted rather than growing', () => {
    // Running out is information, not an error — the caller just does not spawn.
    const pool = makePool(3)
    expect(pool.acquire()).not.toBeNull()
    expect(pool.acquire()).not.toBeNull()
    expect(pool.acquire()).not.toBeNull()
    expect(pool.acquire()).toBeNull()
    expect(pool.items).toHaveLength(3)
  })

  it('counts refusals so the budget can be validated', () => {
    const pool = makePool(2)
    pool.acquire()
    pool.acquire()
    pool.acquire()
    pool.acquire()
    expect(pool.exhausted).toBe(2)
  })

  it('reuses released slots', () => {
    const pool = makePool(2)
    const a = pool.acquire()!
    pool.acquire()
    expect(pool.acquire()).toBeNull()

    pool.release(a)
    expect(pool.available).toBe(1)
    expect(pool.acquire()).not.toBeNull()
  })

  it('treats releasing an inactive item as a no-op', () => {
    const pool = makePool(3)
    const item = pool.acquire()!
    pool.release(item)
    pool.release(item)
    expect(pool.live).toBe(0)
    expect(pool.available).toBe(3)
  })

  it('releases by index without scanning', () => {
    const pool = makePool(4)
    pool.acquire()
    const index = pool.items.findIndex((i) => i.active)
    pool.releaseAt(index)
    expect(pool.items[index].active).toBe(false)
    expect(pool.live).toBe(0)
  })

  it('never double-counts live on repeated releaseAt', () => {
    const pool = makePool(4)
    pool.acquire()
    pool.releaseAt(0)
    pool.releaseAt(0)
    expect(pool.live).toBe(0)
    expect(pool.available).toBe(4)
  })

  it('tracks peak concurrent usage', () => {
    const pool = makePool(10)
    const held = [pool.acquire()!, pool.acquire()!, pool.acquire()!]
    held.forEach((i) => pool.release(i))
    pool.acquire()
    expect(pool.peak).toBe(3)
  })

  it('never hands the same slot to two callers', () => {
    const pool = makePool(50)
    const seen = new Set<number>()
    for (let i = 0; i < 50; i++) {
      const item = pool.acquire()
      expect(item).not.toBeNull()
      expect(seen.has(item!.value)).toBe(false)
      seen.add(item!.value)
    }
  })

  it('survives heavy churn without leaking slots', () => {
    const pool = makePool(32)
    for (let cycle = 0; cycle < 200; cycle++) {
      const taken: Thing[] = []
      for (let i = 0; i < 20; i++) {
        const item = pool.acquire()
        if (item) taken.push(item)
      }
      for (const item of taken) pool.release(item)
    }
    expect(pool.live).toBe(0)
    expect(pool.available).toBe(32)
  })

  it('resets everything to free', () => {
    const pool = makePool(5)
    pool.acquire()
    pool.acquire()
    pool.reset()
    expect(pool.live).toBe(0)
    expect(pool.available).toBe(5)
    expect(pool.items.every((i) => !i.active)).toBe(true)
  })
})
