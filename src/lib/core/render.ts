import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { FLARE, RINGS, RIM_RADIUS, ringByIndex, slotAngle } from '../content/field'
import type { ContactInstance } from '../entities/Contact'
import { arrayPosition } from '../systems/ai'
import { EVENT_LIFETIME } from '../systems/feed'
import { TICK_SECONDS, type Simulation } from './loop'

/**
 * The Pixi render layer.
 *
 * **Reads simulation state and never writes it** (docs/architecture.md). A
 * dropped frame must not change the simulation.
 *
 * The simulation runs at a fixed 20 Hz while this draws at display rate, so
 * positions are extrapolated forward by `alpha * TICK_SECONDS` using each
 * entity's velocity. That is cheaper than storing previous positions and
 * interpolating, and exact for the constant-velocity motion that dominates —
 * projectiles and ring rotation.
 *
 * PLACEHOLDER ART — everything is a Graphics primitive in the brass palette.
 * Phases 37–40 replace these with sprites, atlases and VFX.
 */

const PALETTE = {
  background: 0x0b0a08,
  ringTrack: 0x2a2417,
  sun: 0xc9a227,
  sunLow: 0xf87171,
  platform: 0xc9a227,
  platformDisabled: 0x4a4335,
  detent: 0x8fb3c9,
  pallet: 0xc98f4a,
  array: 0x5eead4,
  contact: 0x8a8474,
  contactFlash: 0xffffff,
  projectileContact: 0xe8e2d4,
  projectileArray: 0x5eead4,
  telegraph: 0xf87171,
  conjunction: 0xfff1a8,
} as const

const PLATFORM_COLOURS: Record<string, number> = {
  hammer: PALETTE.platform,
  detent: PALETTE.detent,
  pallet: PALETTE.pallet,
}

export interface Renderer {
  render(simulation: Simulation): void
  resize(): void
  destroy(): void
  /** Screen coordinates (clientX/clientY) to simulation world space. */
  toWorld(clientX: number, clientY: number): { x: number; y: number }
  readonly canvas: HTMLCanvasElement
}

export async function createRenderer(host: HTMLElement): Promise<Renderer> {
  const app = new Application()
  await app.init({
    background: PALETTE.background,
    antialias: true,
    resizeTo: host,
    // Cap DPR: a 3x backing store triples fill cost for no legibility gain on
    // shapes this simple.
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  })
  host.appendChild(app.canvas)

  // Everything is centred on the Sun, so children work in world
  // coordinates and never think about screen space.
  const world = new Container()
  app.stage.addChild(world)

  // --- Static furniture: drawn once, never touched again. -------------------
  const trackLayer = new Container()
  world.addChild(trackLayer)
  for (const ring of RINGS) {
    trackLayer.addChild(
      new Graphics().circle(0, 0, ring.radius).stroke({
        width: 1,
        color: PALETTE.ringTrack,
        alpha: 0.9,
      }),
    )
  }
  trackLayer.addChild(
    new Graphics().circle(0, 0, RIM_RADIUS).stroke({
      width: 1,
      color: PALETTE.ringTrack,
      alpha: 0.5,
    }),
  )

  // --- One container per ring. Rotating it moves every unit on it. ----------
  const ringContainers = RINGS.map(() => {
    const container = new Container()
    world.addChild(container)
    return container
  })

  const contactLayer = new Container()
  const projectileLayer = new Container()
  const effectLayer = new Container()
  const arrayLayer = new Container()
  world.addChild(contactLayer, arrayLayer, projectileLayer, effectLayer)

  const sun = new Graphics()
  world.addChild(sun)

  // Strike feedback lives above everything, so it reads even in dense fire.
  const strikeGraphic = new Graphics()
  effectLayer.addChild(strikeGraphic)

  // Damage popups. Text objects are expensive to create, so the pool of them
  // matches the feed's capacity and is allocated once.
  const feedLayer = new Container()
  world.addChild(feedLayer)
  const popupStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    fontWeight: '600',
    fill: PALETTE.projectileContact,
  })
  const popups: Text[] = []

  // Sprite registries, keyed by entity id so they survive across frames.
  const platformSprites = new Map<number, Graphics>()
  const contactSprites = new Map<number, Graphics>()
  /** Last-drawn signature per Contact, so unchanged ones skip the rebuild. */
  const contactSigs = new Map<number, number>()
  const arraySprites = new Map<number, Graphics>()
  const projectileSprites: Graphics[] = []

  const recentre = () => {
    world.x = app.screen.width / 2
    world.y = app.screen.height / 2
    // Scale down on small viewports so the whole field stays visible.
    const fit = Math.min(app.screen.width, app.screen.height) / (RIM_RADIUS * 2.2)
    world.scale.set(Math.min(1, fit))
  }
  recentre()
  app.renderer.on('resize', recentre)

  function drawPlatforms(simulation: Simulation, alpha: number) {
    const sim = simulation.state
    const seen = new Set<number>()

    for (const platform of sim.platforms) {
      seen.add(platform.id)
      const ring = ringByIndex(platform.slot.ring)
      if (!ring) continue

      let sprite = platformSprites.get(platform.id)
      if (!sprite) {
        sprite = new Graphics()
        platformSprites.set(platform.id, sprite)
        ringContainers[ring.index - 1].addChild(sprite)
      }

      // Local coordinates only — the parent container's rotation carries them.
      const localAngle = slotAngle(ring, platform.slot.slot, 0)
      sprite.x = Math.cos(localAngle) * ring.radius
      sprite.y = Math.sin(localAngle) * ring.radius

      const disabled = platform.disabledFor > 0
      const colour = disabled
        ? PALETTE.platformDisabled
        : (PLATFORM_COLOURS[platform.def.id] ?? PALETTE.platform)

      sprite.clear()
      // Body.
      sprite.circle(0, 0, 8).fill({ color: colour, alpha: disabled ? 0.4 : 1 })

      if (!disabled) {
        // Health ring, so damage is legible without a bar.
        const health = platform.hp / platform.maxHp
        if (health < 1) {
          sprite
            .arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * health)
            .stroke({ width: 2, color: colour, alpha: 0.8 })
        }
        if (platform.buffs.shield.magnitude > 0) {
          sprite.circle(0, 0, 13).stroke({ width: 1.5, color: PALETTE.array, alpha: 0.7 })
        }
      }
    }

    for (const [id, sprite] of platformSprites) {
      if (seen.has(id)) continue
      sprite.destroy()
      platformSprites.delete(id)
    }

    // The entire rotation system: one write per ring.
    for (let i = 0; i < ringContainers.length; i++) {
      const state = sim.rings[i]
      if (!state) continue
      ringContainers[i].rotation = state.phase + state.angularVelocity * alpha * TICK_SECONDS
    }
  }

  function drawArrays(simulation: Simulation) {
    const seen = new Set<number>()

    for (const array of simulation.state.arrays) {
      seen.add(array.id)
      let sprite = arraySprites.get(array.id)
      if (!sprite) {
        sprite = new Graphics()
        arraySprites.set(array.id, sprite)
        arrayLayer.addChild(sprite)
      }

      const position = arrayPosition(array)
      sprite.x = position.x
      sprite.y = position.y

      sprite.clear()
      sprite.rect(-7, -7, 14, 14).fill({
        color: PALETTE.array,
        alpha: array.disabledFor > 0 ? 0.3 : 1,
      })

      // Charge pips — the resource that makes Arrays burst-y, made visible.
      const whole = Math.floor(array.charge)
      for (let i = 0; i < array.maxCharge; i++) {
        sprite
          .circle(-6 + i * 6, 13, 2)
          .fill({ color: PALETTE.array, alpha: i < whole ? 1 : 0.22 })
      }
    }

    for (const [id, sprite] of arraySprites) {
      if (seen.has(id)) continue
      sprite.destroy()
      arraySprites.delete(id)
    }
  }

  /**
   * Contact are the dominant render cost, so their geometry is only rebuilt when
   * it actually changes.
   *
   * Phase 11 measured ~12 us per Contact per frame against ~4 us for a projectile
   * that is merely repositioned. The difference was `clear()` plus a geometry
   * rebuild every frame for entities that mostly are not changing: an
   * undamaged, non-telegraphing Contact looks identical frame to frame and only
   * needs its position updated.
   *
   * A signature captures everything that affects the drawing. Telegraphing
   * Contact animate, so they are exempt — but only a handful telegraph at once.
   */
  function contactSignature(contact: ContactInstance): number {
    const flashing = contact.hitFlash > 0 ? 1 : 0
    // Health quantised to 20 steps: finer than the eye resolves on a 4 px arc,
    // and it stops a continuous regen trickle from dirtying every frame.
    const health = Math.round((contact.hp / contact.maxHp) * 20)
    const shielded = contact.shieldHitsRemaining > 0 ? 1 : 0
    return flashing | (shielded << 1) | (health << 2)
  }

  function drawContact(simulation: Simulation, alpha: number) {
    const seen = new Set<number>()
    const lead = alpha * TICK_SECONDS

    for (const contact of simulation.state.contact) {
      seen.add(contact.id)
      let sprite = contactSprites.get(contact.id)
      if (!sprite) {
        sprite = new Graphics()
        contactSprites.set(contact.id, sprite)
        contactLayer.addChild(sprite)
        contactSigs.set(contact.id, -1)
      }

      // Position always updates — this is the cheap part.
      sprite.x = contact.position.x + contact.velocity.x * lead
      sprite.y = contact.position.y + contact.velocity.y * lead

      const telegraphing = contact.telegraphRemaining > 0
      const signature = contactSignature(contact)

      // Skip the rebuild when nothing visible changed.
      if (!telegraphing && contactSigs.get(contact.id) === signature) continue
      contactSigs.set(contact.id, telegraphing ? -1 : signature)

      const size = contact.def.motion === 'drift' ? 11 : 7

      sprite.clear()
      sprite
        .circle(0, 0, size)
        .fill({ color: contact.hitFlash > 0 ? PALETTE.contactFlash : PALETTE.contact })

      // Telegraph: a pattern that fires without warning is a bug, so the
      // warning has to be visible from the render layer, not implied.
      if (telegraphing) {
        const t = contact.telegraphRemaining
        sprite.circle(0, 0, size + 6 + t * 14).stroke({
          width: 2,
          color: PALETTE.telegraph,
          alpha: 0.35 + 0.4 * Math.abs(Math.sin(t * 18)),
        })
      }

      const health = contact.hp / contact.maxHp
      if (health < 1) {
        sprite
          .arc(0, 0, size + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * health)
          .stroke({ width: 1.5, color: PALETTE.contact, alpha: 0.8 })
      }
    }

    for (const [id, sprite] of contactSprites) {
      if (seen.has(id)) continue
      sprite.destroy()
      contactSprites.delete(id)
      contactSigs.delete(id)
    }
  }

  function drawProjectiles(simulation: Simulation, alpha: number) {
    const items = simulation.projectiles.items
    const lead = alpha * TICK_SECONDS

    // Sprites are allocated once and reused by index, matching the pool. No
    // per-frame allocation on the hot path.
    while (projectileSprites.length < items.length) {
      const sprite = new Graphics()
      sprite.visible = false
      projectileLayer.addChild(sprite)
      projectileSprites.push(sprite)
    }

    for (let i = 0; i < items.length; i++) {
      const p = items[i]
      const sprite = projectileSprites[i]

      if (!p.active) {
        if (sprite.visible) sprite.visible = false
        continue
      }

      if (!sprite.visible) {
        sprite.visible = true
        sprite.clear()
        sprite.circle(0, 0, p.radius).fill({
          color: p.faction === 'contact' ? PALETTE.projectileContact : PALETTE.projectileArray,
        })
      }

      sprite.x = p.position.x + p.velocity.x * lead
      sprite.y = p.position.y + p.velocity.y * lead
    }
  }

  function drawSun(simulation: Simulation) {
    const state = simulation.state.sun
    const fraction = state.maxHp > 0 ? state.hp / state.maxHp : 0
    const low = fraction < 0.3

    sun.clear()
    sun.circle(0, 0, 26).fill({
      color: state.hitFlash > 0 ? 0xffffff : low ? PALETTE.sunLow : PALETTE.sun,
      alpha: 0.95,
    })

    // Output as an arc around the core — the objective's health is the one
    // number that must never require looking away from the field.
    sun
      .arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction)
      .stroke({ width: 4, color: low ? PALETTE.sunLow : PALETTE.sun })

    if (state.shield > 0) {
      sun.circle(0, 0, 40).stroke({ width: 2, color: PALETTE.array, alpha: 0.6 })
    }
  }

  /**
   * Show where a strike landed.
   *
   * An input with no feedback reads as a broken input, so this draws even when
   * the strike hit nothing at all.
   */
  function drawStrike(simulation: Simulation) {
    const strike = simulation.lastStrike
    strikeGraphic.clear()
    if (!strike) return

    // Expand and fade over the strike's short life.
    const t = Math.min(1, strike.age / 0.35)
    strikeGraphic
      .circle(strike.x, strike.y, FLARE.radius * (0.55 + 0.45 * t))
      .stroke({ width: 3 * (1 - t) + 1, color: PALETTE.conjunction, alpha: 1 - t })
  }

  const FEED_COLOURS: Record<string, number> = {
    damage: 0xe8e2d4,
    kill: PALETTE.sun,
    block: PALETTE.detent,
  }

  /**
   * Draw the combat feed.
   *
   * Text objects are reused by index rather than created per event — creating a
   * Pixi Text allocates a texture, which on a burst of kills would spike the
   * frame far worse than the drawing itself.
   */
  function drawFeed(simulation: Simulation) {
    const events = simulation.state.feed.items

    while (popups.length < events.length) {
      const text = new Text({ text: '', style: popupStyle })
      text.anchor.set(0.5)
      text.visible = false
      feedLayer.addChild(text)
      popups.push(text)
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const popup = popups[i]

      if (!event.active) {
        if (popup.visible) popup.visible = false
        continue
      }

      const t = event.age / EVENT_LIFETIME

      popup.visible = true
      popup.text = event.kind === 'block' ? '–' : String(event.amount)
      popup.style.fill = FEED_COLOURS[event.kind] ?? PALETTE.projectileContact
      // Drift upward and fade, so overlapping numbers separate over time.
      popup.x = event.x
      popup.y = event.y - t * 22
      popup.alpha = 1 - t * t
      popup.scale.set(event.kind === 'kill' ? 1.15 : 1)
    }
  }

  let destroyed = false

  return {
    canvas: app.canvas,

    render(simulation: Simulation) {
      const alpha = simulation.alpha

      drawPlatforms(simulation, alpha)
      drawArrays(simulation)
      drawContact(simulation, alpha)
      drawProjectiles(simulation, alpha)
      drawSun(simulation)
      drawStrike(simulation)
      drawFeed(simulation)

      app.render()
    },

    toWorld(clientX: number, clientY: number) {
      const rect = app.canvas.getBoundingClientRect()
      // Undo the centring and the fit scale applied in recentre().
      return {
        x: (clientX - rect.left - world.x) / world.scale.x,
        y: (clientY - rect.top - world.y) / world.scale.y,
      }
    },

    resize: recentre,

    destroy() {
      /*
       * Guarded, because Pixi's `destroy` is not idempotent — a second call
       * throws on a half-torn-down Application ("this._cancelResize is not a
       * function"). Svelte can unmount after an explicit teardown, and a
       * teardown path that throws on its second call takes the error handler
       * with it.
       */
      if (destroyed) return
      destroyed = true

      app.destroy(true, { children: true })
      platformSprites.clear()
      contactSprites.clear()
      arraySprites.clear()
      projectileSprites.length = 0
      popups.length = 0
    },
  }
}
