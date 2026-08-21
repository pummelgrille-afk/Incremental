import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { BEAT, RINGS, RIM_RADIUS, ringByIndex, slotAngle } from '../content/field'
import type { SlackInstance } from '../entities/Slack'
import { chimePosition } from '../systems/ai'
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
  mainspring: 0xc9a227,
  mainspringLow: 0xf87171,
  movement: 0xc9a227,
  movementDisabled: 0x4a4335,
  detent: 0x8fb3c9,
  pallet: 0xc98f4a,
  chime: 0x5eead4,
  slack: 0x8a8474,
  slackFlash: 0xffffff,
  projectileSlack: 0xe8e2d4,
  projectileChime: 0x5eead4,
  telegraph: 0xf87171,
  conjunction: 0xfff1a8,
} as const

const MOVEMENT_COLOURS: Record<string, number> = {
  hammer: PALETTE.movement,
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

  // Everything is centred on the Mainspring, so children work in world
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

  const slackLayer = new Container()
  const projectileLayer = new Container()
  const effectLayer = new Container()
  const chimeLayer = new Container()
  world.addChild(slackLayer, chimeLayer, projectileLayer, effectLayer)

  const mainspring = new Graphics()
  world.addChild(mainspring)

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
    fill: PALETTE.projectileSlack,
  })
  const popups: Text[] = []

  // Sprite registries, keyed by entity id so they survive across frames.
  const movementSprites = new Map<number, Graphics>()
  const slackSprites = new Map<number, Graphics>()
  /** Last-drawn signature per Slack, so unchanged ones skip the rebuild. */
  const slackSigs = new Map<number, number>()
  const chimeSprites = new Map<number, Graphics>()
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

  function drawMovements(simulation: Simulation, alpha: number) {
    const sim = simulation.state
    const seen = new Set<number>()

    for (const movement of sim.movements) {
      seen.add(movement.id)
      const ring = ringByIndex(movement.slot.ring)
      if (!ring) continue

      let sprite = movementSprites.get(movement.id)
      if (!sprite) {
        sprite = new Graphics()
        movementSprites.set(movement.id, sprite)
        ringContainers[ring.index - 1].addChild(sprite)
      }

      // Local coordinates only — the parent container's rotation carries them.
      const localAngle = slotAngle(ring, movement.slot.slot, 0)
      sprite.x = Math.cos(localAngle) * ring.radius
      sprite.y = Math.sin(localAngle) * ring.radius

      const disabled = movement.disabledFor > 0
      const colour = disabled
        ? PALETTE.movementDisabled
        : (MOVEMENT_COLOURS[movement.def.id] ?? PALETTE.movement)

      sprite.clear()
      // Body.
      sprite.circle(0, 0, 8).fill({ color: colour, alpha: disabled ? 0.4 : 1 })

      if (!disabled) {
        // Health ring, so damage is legible without a bar.
        const health = movement.hp / movement.maxHp
        if (health < 1) {
          sprite
            .arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * health)
            .stroke({ width: 2, color: colour, alpha: 0.8 })
        }
        if (movement.buffs.shield.magnitude > 0) {
          sprite.circle(0, 0, 13).stroke({ width: 1.5, color: PALETTE.chime, alpha: 0.7 })
        }
      }
    }

    for (const [id, sprite] of movementSprites) {
      if (seen.has(id)) continue
      sprite.destroy()
      movementSprites.delete(id)
    }

    // The entire rotation system: one write per ring.
    for (let i = 0; i < ringContainers.length; i++) {
      const state = sim.rings[i]
      if (!state) continue
      ringContainers[i].rotation = state.phase + state.angularVelocity * alpha * TICK_SECONDS
    }
  }

  function drawChimes(simulation: Simulation) {
    const seen = new Set<number>()

    for (const chime of simulation.state.chimes) {
      seen.add(chime.id)
      let sprite = chimeSprites.get(chime.id)
      if (!sprite) {
        sprite = new Graphics()
        chimeSprites.set(chime.id, sprite)
        chimeLayer.addChild(sprite)
      }

      const position = chimePosition(chime)
      sprite.x = position.x
      sprite.y = position.y

      sprite.clear()
      sprite.rect(-7, -7, 14, 14).fill({
        color: PALETTE.chime,
        alpha: chime.disabledFor > 0 ? 0.3 : 1,
      })

      // Charge pips — the resource that makes Chimes burst-y, made visible.
      const whole = Math.floor(chime.charge)
      for (let i = 0; i < chime.maxCharge; i++) {
        sprite
          .circle(-6 + i * 6, 13, 2)
          .fill({ color: PALETTE.chime, alpha: i < whole ? 1 : 0.22 })
      }
    }

    for (const [id, sprite] of chimeSprites) {
      if (seen.has(id)) continue
      sprite.destroy()
      chimeSprites.delete(id)
    }
  }

  /**
   * Slack are the dominant render cost, so their geometry is only rebuilt when
   * it actually changes.
   *
   * Phase 11 measured ~12 us per Slack per frame against ~4 us for a projectile
   * that is merely repositioned. The difference was `clear()` plus a geometry
   * rebuild every frame for entities that mostly are not changing: an
   * undamaged, non-telegraphing Slack looks identical frame to frame and only
   * needs its position updated.
   *
   * A signature captures everything that affects the drawing. Telegraphing
   * Slack animate, so they are exempt — but only a handful telegraph at once.
   */
  function slackSignature(slack: SlackInstance): number {
    const flashing = slack.hitFlash > 0 ? 1 : 0
    // Health quantised to 20 steps: finer than the eye resolves on a 4 px arc,
    // and it stops a continuous regen trickle from dirtying every frame.
    const health = Math.round((slack.hp / slack.maxHp) * 20)
    const shielded = slack.shieldHitsRemaining > 0 ? 1 : 0
    return flashing | (shielded << 1) | (health << 2)
  }

  function drawSlack(simulation: Simulation, alpha: number) {
    const seen = new Set<number>()
    const lead = alpha * TICK_SECONDS

    for (const slack of simulation.state.slack) {
      seen.add(slack.id)
      let sprite = slackSprites.get(slack.id)
      if (!sprite) {
        sprite = new Graphics()
        slackSprites.set(slack.id, sprite)
        slackLayer.addChild(sprite)
        slackSigs.set(slack.id, -1)
      }

      // Position always updates — this is the cheap part.
      sprite.x = slack.position.x + slack.velocity.x * lead
      sprite.y = slack.position.y + slack.velocity.y * lead

      const telegraphing = slack.telegraphRemaining > 0
      const signature = slackSignature(slack)

      // Skip the rebuild when nothing visible changed.
      if (!telegraphing && slackSigs.get(slack.id) === signature) continue
      slackSigs.set(slack.id, telegraphing ? -1 : signature)

      const size = slack.def.motion === 'drift' ? 11 : 7

      sprite.clear()
      sprite
        .circle(0, 0, size)
        .fill({ color: slack.hitFlash > 0 ? PALETTE.slackFlash : PALETTE.slack })

      // Telegraph: a pattern that fires without warning is a bug, so the
      // warning has to be visible from the render layer, not implied.
      if (telegraphing) {
        const t = slack.telegraphRemaining
        sprite.circle(0, 0, size + 6 + t * 14).stroke({
          width: 2,
          color: PALETTE.telegraph,
          alpha: 0.35 + 0.4 * Math.abs(Math.sin(t * 18)),
        })
      }

      const health = slack.hp / slack.maxHp
      if (health < 1) {
        sprite
          .arc(0, 0, size + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * health)
          .stroke({ width: 1.5, color: PALETTE.slack, alpha: 0.8 })
      }
    }

    for (const [id, sprite] of slackSprites) {
      if (seen.has(id)) continue
      sprite.destroy()
      slackSprites.delete(id)
      slackSigs.delete(id)
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
          color: p.faction === 'slack' ? PALETTE.projectileSlack : PALETTE.projectileChime,
        })
      }

      sprite.x = p.position.x + p.velocity.x * lead
      sprite.y = p.position.y + p.velocity.y * lead
    }
  }

  function drawMainspring(simulation: Simulation) {
    const state = simulation.state.mainspring
    const fraction = state.maxHp > 0 ? state.hp / state.maxHp : 0
    const low = fraction < 0.3

    mainspring.clear()
    mainspring.circle(0, 0, 26).fill({
      color: state.hitFlash > 0 ? 0xffffff : low ? PALETTE.mainspringLow : PALETTE.mainspring,
      alpha: 0.95,
    })

    // Tension as an arc around the core — the objective's health is the one
    // number that must never require looking away from the field.
    mainspring
      .arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction)
      .stroke({ width: 4, color: low ? PALETTE.mainspringLow : PALETTE.mainspring })

    if (state.shield > 0) {
      mainspring.circle(0, 0, 40).stroke({ width: 2, color: PALETTE.chime, alpha: 0.6 })
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
      .circle(strike.x, strike.y, BEAT.radius * (0.55 + 0.45 * t))
      .stroke({ width: 3 * (1 - t) + 1, color: PALETTE.conjunction, alpha: 1 - t })
  }

  const FEED_COLOURS: Record<string, number> = {
    damage: 0xe8e2d4,
    kill: PALETTE.mainspring,
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
      popup.style.fill = FEED_COLOURS[event.kind] ?? PALETTE.projectileSlack
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

      drawMovements(simulation, alpha)
      drawChimes(simulation)
      drawSlack(simulation, alpha)
      drawProjectiles(simulation, alpha)
      drawMainspring(simulation)
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
      movementSprites.clear()
      slackSprites.clear()
      chimeSprites.clear()
      projectileSprites.length = 0
      popups.length = 0
    },
  }
}
