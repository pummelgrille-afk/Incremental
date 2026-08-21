/**
 * Fixed-capacity object pool.
 *
 * Every system that spawns short-lived entities uses one. At the projectile
 * budget in balancing.csv (600, tuning to 1200) allocating per spawn would put
 * the garbage collector on the hot path and produce exactly the frame-time
 * spikes that make a bullet-hell feel bad.
 *
 * The pool preallocates and never grows: `capacity` is a *budget*, and running
 * out is information, not an error. `acquire()` returning null means the field
 * is at its limit, which the caller handles by simply not spawning.
 *
 * Phase 11 adds budget instrumentation on top; the allocation strategy is here
 * because Phase 10 needs projectiles and retrofitting pooling later would mean
 * touching every spawn site.
 */

export interface Poolable {
  active: boolean
}

export class Pool<T extends Poolable> {
  /** Every slot, live and dead. Systems iterate this and skip `!active`. */
  readonly items: T[]

  /** Indices of free slots. Stack order — most recently freed is reused first. */
  private readonly free: number[] = []

  private liveCount = 0
  private highWater = 0
  private exhaustedCount = 0

  constructor(
    readonly capacity: number,
    factory: (index: number) => T,
  ) {
    this.items = new Array<T>(capacity)
    for (let i = 0; i < capacity; i++) {
      const item = factory(i)
      item.active = false
      this.items[i] = item
      // Reverse order so the first acquire takes index 0, which keeps the
      // active set packed toward the front early on and reads better in a
      // debugger.
      this.free.push(capacity - 1 - i)
    }
  }

  /**
   * Take a slot, or null when the budget is exhausted.
   *
   * The returned object still holds its previous field values — callers must
   * fully initialize it. Clearing on release instead would cost a write pass
   * over dead objects nobody is going to read.
   */
  acquire(): T | null {
    const index = this.free.pop()
    if (index === undefined) {
      this.exhaustedCount++
      return null
    }

    const item = this.items[index]
    item.active = true
    this.liveCount++
    if (this.liveCount > this.highWater) this.highWater = this.liveCount
    return item
  }

  /** Return a slot. Releasing an already-dead item is a no-op, not an error. */
  release(item: T): void {
    if (!item.active) return
    item.active = false
    this.liveCount--
    this.free.push(this.indexOf(item))
  }

  /** Release by index — cheaper than `release` when iterating by position. */
  releaseAt(index: number): void {
    const item = this.items[index]
    if (!item.active) return
    item.active = false
    this.liveCount--
    this.free.push(index)
  }

  private indexOf(item: T): number {
    // Linear, but release-by-object is the uncommon path; hot loops use
    // releaseAt with the index they already have.
    return this.items.indexOf(item)
  }

  reset(): void {
    this.free.length = 0
    for (let i = this.capacity - 1; i >= 0; i--) {
      this.items[i].active = false
      this.free.push(i)
    }
    this.liveCount = 0
  }

  get live(): number {
    return this.liveCount
  }

  get available(): number {
    return this.free.length
  }

  /** Peak concurrent usage. Phase 11 reads this to validate the budget. */
  get peak(): number {
    return this.highWater
  }

  /** Times acquire() was refused. Non-zero means the budget is too small. */
  get exhausted(): number {
    return this.exhaustedCount
  }

  resetStats(): void {
    this.highWater = this.liveCount
    this.exhaustedCount = 0
  }
}
