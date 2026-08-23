import { Pool } from '../utils/pool'
import type { DamageType } from '../entities/types'

export interface Tracer {
  active: boolean

  fromX: number
  fromY: number

  toX: number
  toY: number

  damageType: DamageType

  lethal: boolean

  age: number
}

export const TRACER_LIFETIME = 0.12

export const TRACER_CAPACITY = 64

export class TracerFeed {
  private readonly pool: Pool<Tracer>

  dropped = 0

  constructor(capacity = TRACER_CAPACITY) {
    this.pool = new Pool<Tracer>(capacity, () => ({
      active: false,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
      damageType: 'percussive',
      lethal: false,
      age: 0,
    }))
  }

  get items(): readonly Tracer[] {
    return this.pool.items
  }

  get live(): number {
    return this.pool.live
  }

  emit(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    damageType: DamageType,
    lethal = false,
  ): void {
    const tracer = this.pool.acquire()
    if (!tracer) {
      this.dropped++
      return
    }

    tracer.fromX = fromX
    tracer.fromY = fromY
    tracer.toX = toX
    tracer.toY = toY
    tracer.damageType = damageType
    tracer.lethal = lethal
    tracer.age = 0
  }

  update(dt: number): void {
    const items = this.pool.items
    for (let i = 0; i < items.length; i++) {
      const tracer = items[i]
      if (!tracer.active) continue

      tracer.age += dt
      if (tracer.age >= TRACER_LIFETIME) this.pool.releaseAt(i)
    }
  }

  clear(): void {
    this.pool.reset()
    this.dropped = 0
  }
}
