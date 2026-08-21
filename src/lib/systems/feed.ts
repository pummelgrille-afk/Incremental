import { Pool } from '../utils/pool'

/**
 * The combat feed: transient events the render layer draws but the simulation
 * does not depend on — damage numbers, kills, blocks, objective hits.
 *
 * These are **presentation, not state**. Dropping one changes nothing about the
 * outcome of a fight, which is why the feed is a fixed-capacity pool that
 * silently discards overflow rather than growing. A burst of forty simultaneous
 * hits should cost a few missing popups, never an allocation spike on the hot
 * path.
 *
 * PLAN.md Phase 17 asks for damage popups, hit-flash and death effects to reach
 * the render layer via `stores/`. Hit-flash already lives on the entities
 * themselves (it is per-entity and short-lived); everything positional lives
 * here, because it outlives the entity that caused it — a kill popup has to
 * survive the death that produced it.
 */

/**
 * Note the absence of an objective-hit event.
 *
 * Phase 17 emitted one and the playtest cut it: a number popping at the point of
 * impact competes with the Mainspring's own white flash and with the densest
 * action on the field, while the HUD's Tension bar is already the authoritative
 * readout and is *persistent* rather than transient. Two channels for the same
 * information, one of them worse, is noise (P4).
 *
 * Damage to the Mainspring is communicated by the flash and the bar. If Phase 40
 * wants more, `mainspring.hitFlash` is the channel, not a popup.
 */
export type CombatEventKind =
  /** A Slack took damage. */
  | 'damage'
  /** A Slack died. */
  | 'kill'
  /** A Movement absorbed a projectile with its block arc. */
  | 'block'

export interface CombatEvent {
  active: boolean
  kind: CombatEventKind
  x: number
  y: number
  /** Damage dealt, rounded for display. Zero for events without a number. */
  amount: number
  /** Seconds since the event fired. The render layer fades on this. */
  age: number
}

/** How long an event stays readable before it is recycled. */
export const EVENT_LIFETIME = 0.7

/**
 * Capacity.
 *
 * Sized well below the projectile budget on purpose: at 600 projectiles a frame
 * where everything connects at once would produce hundreds of popups, which is
 * unreadable anyway. Capping the feed is a legibility decision as much as a
 * performance one (P4).
 */
export const FEED_CAPACITY = 64

export class CombatFeed {
  private readonly pool: Pool<CombatEvent>

  /** Events discarded because the feed was full. Dev diagnostic only. */
  dropped = 0

  constructor(capacity = FEED_CAPACITY) {
    this.pool = new Pool<CombatEvent>(capacity, () => ({
      active: false,
      kind: 'damage',
      x: 0,
      y: 0,
      amount: 0,
      age: 0,
    }))
  }

  /** Every slot, live and dead. Callers filter on `active`. */
  get items(): readonly CombatEvent[] {
    return this.pool.items
  }

  get live(): number {
    return this.pool.live
  }

  /**
   * Record an event. Silently discards when full — see the class comment.
   *
   * `amount` is rounded here rather than at the draw call: it is the only place
   * damage becomes a display value, and the simulation keeps its float
   * (combat-spec.md §6).
   */
  emit(kind: CombatEventKind, x: number, y: number, amount = 0): void {
    const event = this.pool.acquire()
    if (!event) {
      this.dropped++
      return
    }

    event.kind = kind
    event.x = x
    event.y = y
    event.amount = Math.round(amount)
    event.age = 0
  }

  /** Age every live event and recycle the expired. */
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
