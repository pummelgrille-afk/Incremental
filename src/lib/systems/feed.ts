import { Pool } from '../utils/pool'

export type CombatEventKind =

  | 'damage'

  | 'kill'

  | 'block'

export interface CombatEvent {
  active: boolean
  kind: CombatEventKind
  x: number
  y: number

  amount: number

  spriteKey: string

  age: number
}

export const EVENT_LIFETIME = 0.7

export const FEED_CAPACITY = 64

export class CombatFeed {
  private readonly pool: Pool<CombatEvent>

  dropped = 0

  constructor(capacity = FEED_CAPACITY) {
    this.pool = new Pool<CombatEvent>(capacity, () => ({
      active: false,
      kind: 'damage',
      x: 0,
      y: 0,
      amount: 0,
      spriteKey: '',
      age: 0,
    }))
  }

  get items(): readonly CombatEvent[] {
    return this.pool.items
  }

  get live(): number {
    return this.pool.live
  }

  emit(
    kind: CombatEventKind,
    x: number,
    y: number,
    amount = 0,
    spriteKey = '',
  ): void {
    const event = this.pool.acquire()
    if (!event) {
      this.dropped++
      return
    }

    event.kind = kind
    event.x = x
    event.y = y
    event.amount = Math.round(amount)
    event.spriteKey = spriteKey
    event.age = 0
  }

  update(dt: number): void {
    const items = this.pool.items
    for (let i = 0; i < items.length; i++) {
      const event = items[i]
      if (!event.active) continue

      event.age += dt
      if (event.age >= EVENT_LIFETIME) this.pool.releaseAt(i)
    }
  }

  clear(): void {
    this.pool.reset()
    this.dropped = 0
  }
}
