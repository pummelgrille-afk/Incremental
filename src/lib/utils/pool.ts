
export interface Poolable {
  active: boolean
}

export class Pool<T extends Poolable> {
  readonly items: T[]

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

      this.free.push(capacity - 1 - i)
    }
  }

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

  release(item: T): void {
    if (!item.active) return
    item.active = false
    this.liveCount--
    this.free.push(this.indexOf(item))
  }

  releaseAt(index: number): void {
    const item = this.items[index]
    if (!item.active) return
    item.active = false
    this.liveCount--
    this.free.push(index)
  }

  private indexOf(item: T): number {
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

  get peak(): number {
    return this.highWater
  }

  get exhausted(): number {
    return this.exhaustedCount
  }

  resetStats(): void {
    this.highWater = this.liveCount
    this.exhaustedCount = 0
  }
}
