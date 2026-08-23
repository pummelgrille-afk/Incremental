
export class PooledDelta {
  private previous: number | null = null

  private gainPool = 0
  private lossPool = 0
  private gainUntil = 0
  private lossUntil = 0

  constructor(private readonly window: number) {}

  get gain(): number {
    return this.gainPool
  }

  get loss(): number {
    return this.lossPool
  }

  push(value: number, now: number): void {
    const previous = this.previous
    this.previous = value

    if (previous === null) {
      this.gainPool = 0
      this.lossPool = 0
      return
    }

    const delta = value - previous

    if (delta > 0) {
      this.gainPool += delta
      this.gainUntil = now + this.window
      this.lossPool = 0
    } else if (delta < 0) {
      this.lossPool -= delta
      this.lossUntil = now + this.window
      this.gainPool = 0
    }

    if (this.gainPool > 0 && now >= this.gainUntil) this.gainPool = 0
    if (this.lossPool > 0 && now >= this.lossUntil) this.lossPool = 0
  }

  prime(value: number): void {
    this.previous = value
    this.gainPool = 0
    this.lossPool = 0
  }

  clear(): void {
    this.previous = null
    this.gainPool = 0
    this.lossPool = 0
  }
}
