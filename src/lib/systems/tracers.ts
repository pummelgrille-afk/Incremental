import { Pool } from '../utils/pool'
import type { DamageType } from '../entities/types'

/**
 * Shot tracers: the line a Platform's attack takes to its target.
 *
 * **Presentation, never state.** A Platform attack resolves instantly —
 * combat-spec.md §2 gates nothing on animation, and Phase 35's balance pass
 * measured a roster that hits the moment its cooldown crosses zero. Giving
 * Platforms real travelling projectiles would put flight time, misses on a
 * target that died mid-flight, and a second collision path between a unit and
 * its damage, and would invalidate every clear-rate figure in `balancing.csv`.
 *
 * So the damage stays instant and the *shot* is drawn. This is the ordinary
 * hitscan tracer every shooter uses, and it fixes the thing that was actually
 * wrong: a rack of Platforms firing four times a second looked completely
 * inert, because nothing between the unit and the Contact ever appeared on
 * screen. The only visible evidence a unit was working at all was the damage
 * number popping over something else.
 *
 * Same shape and the same reasoning as `systems/feed.ts`: a fixed-capacity pool
 * that silently discards overflow rather than growing. Dropping a tracer costs
 * a shot nobody saw; allocating on the hot path costs the frame.
 */

export interface Tracer {
  active: boolean
  /** Where the shot left the unit. Captured at fire time — the ring turns. */
  fromX: number
  fromY: number
  /** Where the target was when it was hit. */
  toX: number
  toY: number
  /** Drives the tracer's colour, which is how the type matrix becomes visible. */
  damageType: DamageType
  /** True when the shot killed. The render layer flares these. */
  lethal: boolean
  /** Seconds since the shot fired. The render layer fades and moves on this. */
  age: number
}

/**
 * How long a tracer stays on screen.
 *
 * Short on purpose. The bolt is drawn travelling across this window, and the
 * damage it represents has already landed — at 0.12 s the eye reads a shot
 * arriving, while anything slower starts to read as a projectile in flight and
 * invites the question of what happens when it lands on a Contact that is
 * already dead.
 */
export const TRACER_LIFETIME = 0.12

/**
 * Capacity.
 *
 * A full field is 48 Platforms; the fastest authored `baseInterval` is a shade
 * over one second, and haste can roughly halve it. That is on the order of a
 * hundred shots a second against a 0.12 s window — a dozen or so live at once,
 * with the rest of the pool there for a conjunction's worth of simultaneous
 * fire. Well under the projectile budget, and no reason to size it there.
 */
export const TRACER_CAPACITY = 64

export class TracerFeed {
  private readonly pool: Pool<Tracer>

  /** Tracers discarded because the pool was full. Dev diagnostic only. */
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

  /** Every slot, live and dead. Callers filter on `active`. */
  get items(): readonly Tracer[] {
    return this.pool.items
  }

  get live(): number {
    return this.pool.live
  }

  /** Record a shot. Silently discards when full — see the class comment. */
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

  /** Age every live tracer and recycle the expired. */
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
