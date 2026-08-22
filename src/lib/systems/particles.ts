import { Pool } from '../utils/pool'
import { BUDGETS } from '../content/budgets'
import { createRng, type Rng } from '../core/rng'

/**
 * The particle field.
 *
 * Third of the presentation-only pools, after `feed.ts` and `tracers.ts`, and
 * built on exactly the same terms: fixed capacity, silent overflow, nothing in
 * the simulation reads it. Dropping a particle costs a spark nobody saw;
 * allocating on the hot path costs the frame.
 *
 * `BUDGETS.particles` has said 400 since Phase 11, annotated "for Phase 40's
 * VFX library. Not yet spent." This is that budget being spent, and the cap is
 * taken from there rather than restated — a second number would drift from the
 * one `docs/design/balancing.csv` owns.
 *
 * ## Why particles are simulated rather than animated
 *
 * A sprite clip is right for a thing that always looks the same — a craft dies
 * the same way every time (`animation.ts`). A burst is not that: it happens at
 * an angle, at a scale, in a colour, all decided at the moment it fires. Baking
 * every combination into frames is impossible, so the effect is described by
 * where its pieces go and the renderer draws points.
 *
 * They are still **not simulation**. Nothing collides, nothing deals damage,
 * and a frame that drops every particle changes no outcome.
 *
 * ## Its own random source, and this is not optional
 *
 * The field carries a private `Rng` rather than borrowing the simulation's. A
 * stage is seeded so that it plays the same way every time, which is what makes
 * a balance measurement reproducible (`tests/support/playthrough.ts`) — and
 * drawing scatter from that stream would put every wave in the game downstream
 * of how many sparks an explosion happened to throw. Changing a particle count
 * would silently change what spawns.
 */

export interface Particle {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  /** Seconds remaining. */
  life: number
  /** Seconds it started with, so the render layer can fade on the fraction. */
  maxLife: number
  /** World-pixel radius at full life. */
  size: number
  /** 0xRRGGBB. */
  colour: number
  /**
   * Velocity retained per second, 0–1.
   *
   * A spark that keeps its speed reads as debris thrown clear; one that slows
   * hard reads as a puff. Both are wanted, so it is per-particle rather than a
   * constant.
   */
  drag: number
}

export interface ParticleSpec {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
  colour: number
  drag?: number
}

export class ParticleField {
  private readonly pool: Pool<Particle>
  private readonly rng: Rng

  /** Particles discarded because the field was full. Dev diagnostic only. */
  dropped = 0

  /** High-water mark, so the budget can be checked against real play. */
  peak = 0

  constructor(capacity = BUDGETS.particles, seed = 0x5eed_1234) {
    this.rng = createRng(seed)
    this.pool = new Pool<Particle>(capacity, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 1,
      colour: 0xffffff,
      drag: 1,
    }))
  }

  /** Every slot, live and dead. Callers filter on `active`. */
  get items(): readonly Particle[] {
    return this.pool.items
  }

  get live(): number {
    return this.pool.live
  }

  emit(spec: ParticleSpec): void {
    const particle = this.pool.acquire()
    if (!particle) {
      this.dropped++
      return
    }

    particle.x = spec.x
    particle.y = spec.y
    particle.vx = spec.vx
    particle.vy = spec.vy
    particle.life = spec.life
    particle.maxLife = spec.life
    particle.size = spec.size
    particle.colour = spec.colour
    particle.drag = spec.drag ?? 1

    if (this.pool.live > this.peak) this.peak = this.pool.live
  }

  /**
   * Throw `count` particles outward from a point.
   *
   * The shape every effect here is built from. `spread` is the half-angle in
   * radians around `angle`; passing π covers the full circle, which is what an
   * impact wants, while a narrow spread is a directed spray.
   *
   * Speed and life are varied per particle from the field's own random source —
   * a burst whose pieces all travel the same distance reads as a ring, which is
   * the one shape a burst must not have.
   */
  burst(options: {
    x: number
    y: number
    count: number
    angle: number
    spread: number
    speed: number
    life: number
    size: number
    colour: number
    drag?: number
  }): void {
    const random = this.rng.next

    for (let i = 0; i < options.count; i++) {
      const theta = options.angle + (random() * 2 - 1) * options.spread
      const speed = options.speed * (0.45 + random() * 0.55)

      this.emit({
        x: options.x,
        y: options.y,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        life: options.life * (0.6 + random() * 0.4),
        size: options.size * (0.7 + random() * 0.6),
        colour: options.colour,
        drag: options.drag,
      })
    }
  }

  /** Advance every live particle and recycle the expired. */
  update(dt: number): void {
    const items = this.pool.items

    for (let i = 0; i < items.length; i++) {
      const particle = items[i]
      if (!particle.active) continue

      particle.life -= dt
      if (particle.life <= 0) {
        this.pool.releaseAt(i)
        continue
      }

      particle.x += particle.vx * dt
      particle.y += particle.vy * dt

      if (particle.drag !== 1) {
        // Exponential, so the decay is the same whatever the tick length —
        // a per-tick multiply would make particles travel further at a lower
        // frame rate, which is the kind of bug that only shows on a slow
        // machine.
        const retained = Math.pow(particle.drag, dt)
        particle.vx *= retained
        particle.vy *= retained
      }
    }
  }

  clear(): void {
    this.pool.reset()
    this.dropped = 0
    this.peak = 0
  }
}
