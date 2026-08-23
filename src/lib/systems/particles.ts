import { Pool } from '../utils/pool'
import { BUDGETS } from '../content/budgets'
import { createRng, type Rng } from '../core/rng'

export interface Particle {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number

  life: number

  maxLife: number

  size: number

  colour: number

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

  dropped = 0

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
