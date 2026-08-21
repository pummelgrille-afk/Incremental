import { Application, Container, Graphics } from 'pixi.js'

/**
 * Phase 7 rendering confirmation harness.
 *
 * Proves three things before Stage 2 commits to PixiJS:
 *   1. Pixi v8 boots under Vite and Svelte without bundler or SSR trouble.
 *   2. The container-per-ring model works — one `rotation` write per ring moves
 *      every unit on it, so rotation costs O(rings) rather than O(units).
 *   3. Frame time holds at the projectile budget in `balancing.csv`.
 *
 * Phase 10 replaces this with the real vertical slice. Nothing here is
 * load-bearing; it exists so the Phase 7 decision rests on a measurement.
 */

/** Mirrors docs/design/combat-spec.md §1. Duplicated here only for the harness. */
const RINGS = [
  { radius: 90, slots: 6, period: 8 },
  { radius: 160, slots: 10, period: 14 },
  { radius: 240, slots: 14, period: 22 },
] as const

const RIM_RADIUS = 320

export interface RenderHarness {
  /** Rolling mean frame time in milliseconds. */
  readonly frameMs: number
  /** Sprites currently drawn, including ring furniture. */
  readonly spriteCount: number
  setProjectileCount(n: number): void
  destroy(): void
}

export async function startHarness(
  host: HTMLElement,
  initialProjectiles = 600,
): Promise<RenderHarness> {
  const app = new Application()
  await app.init({
    background: 0x0b0a08,
    antialias: true,
    resizeTo: host,
    // Cap DPR: a 3x retina backing store triples fill cost for no legibility
    // gain on shapes this simple.
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  })
  host.appendChild(app.canvas)

  // World is centred on the Mainspring, so children use polar-derived local
  // coordinates and never need to know about screen space.
  const world = new Container()
  app.stage.addChild(world)

  const ringContainers: Container[] = []
  const unitSprites: Graphics[] = []

  for (const ring of RINGS) {
    // Ring track: drawn once, never touched again.
    const track = new Graphics()
      .circle(0, 0, ring.radius)
      .stroke({ width: 1, color: 0x7a6418, alpha: 0.35 })
    world.addChild(track)

    // One container per ring. Rotating this moves every unit on it.
    const container = new Container()
    world.addChild(container)
    ringContainers.push(container)

    for (let slot = 0; slot < ring.slots; slot++) {
      const angle = (slot / ring.slots) * Math.PI * 2
      const unit = new Graphics()
        .circle(0, 0, 7)
        .fill({ color: 0xc9a227 })
      // Local coordinates. The parent's rotation carries them around.
      unit.x = Math.cos(angle) * ring.radius
      unit.y = Math.sin(angle) * ring.radius
      container.addChild(unit)
      unitSprites.push(unit)
    }
  }

  const mainspring = new Graphics()
    .circle(0, 0, 28)
    .fill({ color: 0xc9a227, alpha: 0.9 })
  world.addChild(mainspring)

  // Projectiles: the load test. Pooled up front, same as the real system will
  // do via utils/pool.ts in Phase 11.
  const projectileLayer = new Container()
  world.addChild(projectileLayer)

  const projectiles: Graphics[] = []
  const velocities: { vx: number; vy: number }[] = []

  const growTo = (n: number) => {
    while (projectiles.length < n) {
      const p = new Graphics().circle(0, 0, 3).fill({ color: 0xe8e2d4 })
      const angle = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * 80
      p.x = Math.cos(angle) * RIM_RADIUS
      p.y = Math.sin(angle) * RIM_RADIUS
      projectileLayer.addChild(p)
      projectiles.push(p)
      velocities.push({
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
      })
    }
    while (projectiles.length > n) {
      projectiles.pop()!.destroy()
      velocities.pop()
    }
  }
  growTo(initialProjectiles)

  const ringPhase = new Float32Array(RINGS.length)
  let frameMs = 0

  const recentre = () => {
    world.x = app.screen.width / 2
    world.y = app.screen.height / 2
  }
  recentre()
  app.renderer.on('resize', recentre)

  const step = (dt: number) => {
    // The claim under test: one write per ring, not per unit.
    for (let i = 0; i < RINGS.length; i++) {
      ringPhase[i] += (Math.PI * 2) / RINGS[i].period * dt
      ringContainers[i].rotation = ringPhase[i]
    }

    // Projectiles still need per-entity integration — unavoidable, and the
    // reason the budget is measured against this count.
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i]
      const v = velocities[i]
      p.x += v.vx * dt
      p.y += v.vy * dt
      if (p.x * p.x + p.y * p.y < 28 * 28) {
        const angle = Math.random() * Math.PI * 2
        p.x = Math.cos(angle) * RIM_RADIUS
        p.y = Math.sin(angle) * RIM_RADIUS
        const speed = 40 + Math.random() * 80
        v.vx = -Math.cos(angle) * speed
        v.vy = -Math.sin(angle) * speed
      }
    }

  }

  app.ticker.add((ticker) => {
    step(ticker.deltaMS / 1000)
    // Exponential moving average; a single slow frame should not dominate.
    frameMs = frameMs === 0 ? ticker.deltaMS : frameMs * 0.9 + ticker.deltaMS * 0.1
  })

  if (import.meta.env.DEV) {
    // Dev-only handle so the render budget can be measured without relying on
    // requestAnimationFrame, which is throttled in headless/backgrounded tabs.
    // Phase 11 formalises this into a proper profiling toggle.
    ;(window as unknown as Record<string, unknown>).__orreryHarness = {
      app,
      step,
      setProjectileCount: growTo,
    }
  }

  return {
    get frameMs() {
      return frameMs
    },
    get spriteCount() {
      return unitSprites.length + projectiles.length + RINGS.length + 1
    },
    setProjectileCount: growTo,
    destroy() {
      app.destroy(true, { children: true })
    },
  }
}
